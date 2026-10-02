import { describe, it, expect } from "vitest";
import { verifyWebhook, WebhookVerificationError } from "../src/webhooks";

/**
 * Webhook verification is the one thing in this SDK that is a security control
 * rather than a convenience, so it is tested as one: the happy path proves it
 * accepts a genuine delivery, and everything else proves it refuses what it
 * should.
 */

const SECRET = "whsec_test_secret";

async function sign(id: string, timestamp: string, body: string, secret = SECRET) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  let binary = "";
  for (const byte of new Uint8Array(mac)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function delivery(over: { body?: string; secret?: string; timestamp?: number } = {}) {
  const body = over.body ?? JSON.stringify({ event: "response.completed", formId: "frm_1" });
  const id = "whd_abc123";
  const timestamp = String(over.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = await sign(id, timestamp, body, over.secret);
  return {
    body,
    headers: {
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": `v1,${signature}`,
    },
  };
}

describe("verifyWebhook", () => {
  it("accepts a genuine delivery and returns the parsed body", async () => {
    const { body, headers } = await delivery();
    const event = await verifyWebhook<{ event: string }>({ body, headers, secret: SECRET });
    expect(event.event).toBe("response.completed");
  });

  it("accepts Headers as well as a plain object", async () => {
    const { body, headers } = await delivery();
    const event = await verifyWebhook({ body, headers: new Headers(headers), secret: SECRET });
    expect(event).toBeTruthy();
  });

  it("rejects a body that was tampered with", async () => {
    const { headers } = await delivery();
    await expect(
      verifyWebhook({ body: JSON.stringify({ event: "response.completed", formId: "frm_evil" }), headers, secret: SECRET }),
    ).rejects.toThrow(WebhookVerificationError);
  });

  it("rejects the wrong secret", async () => {
    const { body, headers } = await delivery({ secret: "whsec_someone_elses" });
    await expect(verifyWebhook({ body, headers, secret: SECRET })).rejects.toMatchObject({
      reason: "signature_mismatch",
    });
  });

  it("rejects a replay from outside the window", async () => {
    // A captured delivery replayed an hour later is signed correctly and must
    // still be refused.
    const { body, headers } = await delivery({ timestamp: Math.floor(Date.now() / 1000) - 3600 });
    await expect(verifyWebhook({ body, headers, secret: SECRET })).rejects.toMatchObject({
      reason: "stale_timestamp",
    });
  });

  it("rejects a delivery with no signature headers", async () => {
    await expect(
      verifyWebhook({ body: "{}", headers: {}, secret: SECRET }),
    ).rejects.toMatchObject({ reason: "missing_headers" });
  });

  it("accepts one of several signatures during a secret rotation", async () => {
    const { body, headers } = await delivery();
    const stale = await sign(headers["webhook-id"], headers["webhook-timestamp"], body, "whsec_old");
    const event = await verifyWebhook({
      body,
      headers: { ...headers, "webhook-signature": `v1,${stale} ${headers["webhook-signature"]}` },
      secret: SECRET,
    });
    expect(event).toBeTruthy();
  });

  it("accepts the Standard Webhooks published test vector", async () => {
    // The key is the base64-decoded secret, not its characters. Pinned to the
    // spec's own vector because a test that signs with this file's helper can
    // only prove the two halves agree with each other.
    const event = await verifyWebhook({
      body: '{"test": 2432232314}',
      headers: {
        "webhook-id": "msg_p5jXN8AQM9LWM0D4loKWxJek",
        "webhook-timestamp": "1614265330",
        "webhook-signature": "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
      },
      secret: "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw",
      toleranceSeconds: Number.MAX_SAFE_INTEGER,
    });
    expect(event).toEqual({ test: 2432232314 });
  });

  it("accepts a delivery signed the way the API signs a real secret", async () => {
    // Real secrets are `whsec_` plus 32 hex characters, which is valid base64,
    // so the API keys its HMAC with the decoded bytes. Keying with the literal
    // string is the bug that rejected every genuine delivery.
    const secret = "whsec_0123456789abcdef0123456789abcdef";
    const raw = atob(secret.slice("whsec_".length));
    const keyBytes = Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
    const id = "evt_1";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ event: "response.completed" });
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
    const signature = btoa(String.fromCharCode(...new Uint8Array(mac)));
    const event = await verifyWebhook({
      body,
      headers: { "webhook-id": id, "webhook-timestamp": timestamp, "webhook-signature": `v1,${signature}` },
      secret,
    });
    expect(event).toEqual({ event: "response.completed" });
  });

  it("throws rather than returning false", async () => {
    // A caller who forgets to check a boolean has written an unauthenticated
    // endpoint; the failure must not be silent.
    await expect(verifyWebhook({ body: "{}", headers: {}, secret: SECRET })).rejects.toBeInstanceOf(Error);
  });
});
