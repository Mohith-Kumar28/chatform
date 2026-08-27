import { env } from "cloudflare:test";
import { beforeAll, beforeEach, describe, expect, it, afterEach } from "vitest";
import { applySchema } from "./helpers.js";
import {
  verifyGoogleIdToken,
  startPhoneChallenge,
  verifyPhoneChallenge,
  pruneOtpChallenges,
} from "../src/lib/respondent-auth.js";
import type { Bindings } from "../src/env.js";

const GOOGLE_RESPONDENT_CLIENT_ID = "1234.apps.googleusercontent.com";

function bindings(over: Partial<Bindings> = {}): Bindings {
  return { ...(env as unknown as Bindings), GOOGLE_RESPONDENT_CLIENT_ID, ENVIRONMENT: "development", ...over };
}

// ───────────────────────── Google ID tokens ─────────────────────────

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const b64urlJson = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

let keyPair: CryptoKeyPair;
let jwks: { keys: unknown[] };
const KID = "test-key-1";

/**
 * Mint a real RS256 token signed by a key we publish through a stubbed JWKS
 * endpoint. Testing the rejection paths against hand-written strings would
 * only prove the parser rejects garbage; the checks that matter — signature,
 * audience, issuer, expiry — are only exercised by a token that is otherwise
 * completely valid.
 */
async function mintToken(claims: Record<string, unknown>, signWith?: CryptoKey): Promise<string> {
  const header = b64urlJson({ alg: "RS256", kid: KID, typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlJson({
    iss: "https://accounts.google.com",
    aud: GOOGLE_RESPONDENT_CLIENT_ID,
    sub: "google-sub-123",
    iat: now,
    exp: now + 3600,
    ...claims,
  });
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signWith ?? keyPair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${b64url(new Uint8Array(sig))}`;
}

const realFetch = globalThis.fetch;

beforeAll(async () => {
  await applySchema();
  keyPair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pub = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  jwks = { keys: [{ ...pub, kid: KID, alg: "RS256", use: "sig" }] };
});

beforeEach(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://www.googleapis.com/oauth2/v3/certs")) {
      return new Response(JSON.stringify(jwks), { headers: { "content-type": "application/json" } });
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("Google ID token verification", () => {
  it("accepts a well-formed token and reports the verified email", async () => {
    const token = await mintToken({ email: "grace@hopper.dev", email_verified: true, name: "Grace" });
    const res = await verifyGoogleIdToken(bindings(), token);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.identity.provider).toBe("google");
    expect(res.identity.subject).toBe("google-sub-123");
    expect(res.identity.email).toBe("grace@hopper.dev");
  });

  it("does not trust an unverified email, but still signs the person in", async () => {
    const token = await mintToken({ email: "spoof@hopper.dev", email_verified: false });
    const res = await verifyGoogleIdToken(bindings(), token);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Google says it has not confirmed this address, so it must not be
    // recorded as the respondent's email or matched against anything.
    expect(res.identity.email).toBeNull();
    expect(res.identity.subject).toBe("google-sub-123");
  });

  it("rejects a token minted for a different app", async () => {
    const token = await mintToken({ aud: "9999.apps.googleusercontent.com" });
    const res = await verifyGoogleIdToken(bindings(), token);
    expect(res).toMatchObject({ ok: false, code: "bad_audience" });
  });

  it("rejects a token signed by someone else's key", async () => {
    const attacker = (await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const token = await mintToken({}, attacker.privateKey);
    const res = await verifyGoogleIdToken(bindings(), token);
    expect(res).toMatchObject({ ok: false, code: "bad_signature" });
  });

  it("rejects an expired token and a foreign issuer", async () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    expect(await verifyGoogleIdToken(bindings(), await mintToken({ exp: past }))).toMatchObject({
      ok: false,
      code: "expired",
    });
    expect(await verifyGoogleIdToken(bindings(), await mintToken({ iss: "https://evil.example" }))).toMatchObject({
      ok: false,
      code: "bad_issuer",
    });
  });

  it("rejects an alg=none token outright", async () => {
    const now = Math.floor(Date.now() / 1000);
    const header = b64urlJson({ alg: "none", kid: KID });
    const payload = b64urlJson({ iss: "https://accounts.google.com", aud: GOOGLE_RESPONDENT_CLIENT_ID, sub: "x", iat: now, exp: now + 60 });
    expect(await verifyGoogleIdToken(bindings(), `${header}.${payload}.`)).toMatchObject({ ok: false, code: "bad_alg" });
  });

  it("refuses when the form's deployment has no Google client id", async () => {
    const res = await verifyGoogleIdToken(bindings({ GOOGLE_RESPONDENT_CLIENT_ID: undefined }), await mintToken({}));
    expect(res).toMatchObject({ ok: false, code: "google_not_configured" });
  });
});

// ───────────────────────────── phone OTP ─────────────────────────────

describe("phone OTP", () => {
  let session = 0;
  const nextSession = () => `sess_otp_${++session}_${crypto.randomUUID().slice(0, 6)}`;

  it("sends a code and verifies it, yielding an E.164 identity", async () => {
    const sid = nextSession();
    const start = await startPhoneChallenge(bindings(), sid, "+1 (415) 555-0132");
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    expect(start.destination).toBe("+14155550132");
    expect(start.devCode).toMatch(/^\d{6}$/);

    const res = await verifyPhoneChallenge(bindings(), sid, start.devCode!);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.identity).toMatchObject({ provider: "phone", subject: "+14155550132", phone: "+14155550132" });
  });

  it("never returns the code outside development", async () => {
    const start = await startPhoneChallenge(bindings({ ENVIRONMENT: "production" }), nextSession(), "+14155550133");
    // No SMS provider is configured, so a production send must fail closed
    // rather than fall back to handing the code to the caller.
    expect(start.ok).toBe(false);
    if (start.ok) return;
    expect(start.code).toBe("sms_failed");
  });

  it("rejects a number with no country code and no hint, but takes the hint", async () => {
    expect(await startPhoneChallenge(bindings(), nextSession(), "9986543210")).toMatchObject({
      ok: false,
      code: "invalid_phone",
    });
    const withHint = await startPhoneChallenge(bindings(), nextSession(), "9986543210", "91");
    expect(withHint).toMatchObject({ ok: true, destination: "+919986543210" });
  });

  it("locks out after five wrong guesses", async () => {
    const sid = nextSession();
    const start = await startPhoneChallenge(bindings(), sid, "+14155550134");
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const wrong = start.devCode === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      expect(await verifyPhoneChallenge(bindings(), sid, wrong)).toMatchObject({ ok: false });
    }
    // The correct code must not rescue an exhausted challenge — otherwise the
    // attempt cap is decorative.
    expect(await verifyPhoneChallenge(bindings(), sid, start.devCode!)).toMatchObject({
      ok: false,
      code: "too_many_attempts",
    });
  });

  it("consumes the code, so it cannot be replayed", async () => {
    const sid = nextSession();
    const start = await startPhoneChallenge(bindings(), sid, "+14155550135");
    if (!start.ok) throw new Error("start failed");
    expect((await verifyPhoneChallenge(bindings(), sid, start.devCode!)).ok).toBe(true);
    expect(await verifyPhoneChallenge(bindings(), sid, start.devCode!)).toMatchObject({
      ok: false,
      code: "no_challenge",
    });
  });

  it("refuses to verify before any code was asked for", async () => {
    expect(await verifyPhoneChallenge(bindings(), nextSession(), "123456")).toMatchObject({
      ok: false,
      code: "no_challenge",
    });
  });

  it("expires a code, and the sweep removes spent rows", async () => {
    const sid = nextSession();
    const start = await startPhoneChallenge(bindings(), sid, "+14155550136");
    if (!start.ok) throw new Error("start failed");
    await env.DB.prepare(`UPDATE otp_challenges SET expires_at = ?2 WHERE session_id = ?1`)
      .bind(sid, Date.now() - 1000)
      .run();
    expect(await verifyPhoneChallenge(bindings(), sid, start.devCode!)).toMatchObject({ ok: false, code: "expired" });

    await pruneOtpChallenges(bindings());
    const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM otp_challenges WHERE session_id = ?1`)
      .bind(sid)
      .first<{ n: number }>();
    expect(left?.n).toBe(0);
  });

  it("caps how many codes one session can spend our money on", async () => {
    const sid = nextSession();
    for (let i = 0; i < 5; i++) {
      // Rows are inserted directly to step past the resend cooldown, which is
      // a separate guard with its own test below.
      await env.DB.prepare(
        `INSERT INTO otp_challenges (id, session_id, destination, code_hash, attempts, send_count, expires_at, created_at)
         VALUES (?1, ?2, '+14155550137', 'x', 0, ?3, ?4, ?5)`,
      )
        .bind(`otp_cap_${sid}_${i}`, sid, i + 1, Date.now() + 60_000, Date.now() - 120_000)
        .run();
    }
    expect(await startPhoneChallenge(bindings(), sid, "+14155550137")).toMatchObject({
      ok: false,
      code: "too_many_codes",
    });
  });

  it("makes you wait before asking for another code", async () => {
    const sid = nextSession();
    expect((await startPhoneChallenge(bindings(), sid, "+14155550138")).ok).toBe(true);
    expect(await startPhoneChallenge(bindings(), sid, "+14155550138")).toMatchObject({ ok: false, code: "cooldown" });
  });
});
