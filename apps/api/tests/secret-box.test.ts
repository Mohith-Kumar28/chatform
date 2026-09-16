import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { seal, open } from "../src/lib/secret-box.js";

/**
 * The sealing every stored gateway credential goes through.
 *
 * Tested for the properties an attacker with database access would probe, not
 * just the round trip: that ciphertext moved to another row does not open, that
 * a flipped byte does not open, and that rotating the key does not strand the
 * rows sealed under the old one.
 */

const KEY = env.PAYMENTS_ENCRYPTION_KEY!;
// A second, different 32-byte key, as base64.
const OTHER = btoa("chatform-test-payments-prev-32by");

describe("secret-box", () => {
  it("round-trips a credential for the row it was sealed for", async () => {
    const secret = JSON.stringify({ accessToken: "rzp_oauth_abc", refreshToken: "rt_def" });
    const sealed = await seal(env, secret, "pac_one");
    expect(sealed).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/);
    expect(sealed).not.toContain("rzp_oauth_abc");
    expect(await open(env, sealed, "pac_one")).toBe(secret);
  });

  it("uses a fresh IV every time, so equal secrets do not look equal", async () => {
    const a = await seal(env, "same", "pac_one");
    const b = await seal(env, "same", "pac_one");
    expect(a).not.toBe(b);
  });

  it("refuses to open ciphertext copied onto another row", async () => {
    const sealed = await seal(env, "rk_live_secret", "pac_one");
    await expect(open(env, sealed, "pac_two")).rejects.toThrow("secret_box_open_failed");
  });

  it("refuses tampered ciphertext", async () => {
    const sealed = await seal(env, "rk_live_secret", "pac_one");
    const [v, iv, ct] = sealed.split(":") as [string, string, string];
    const bytes = Uint8Array.from(atob(ct), (c) => c.charCodeAt(0));
    bytes[0] = bytes[0]! ^ 0x01;
    const tampered = `${v}:${iv}:${btoa(String.fromCharCode(...bytes))}`;
    await expect(open(env, tampered, "pac_one")).rejects.toThrow("secret_box_open_failed");

    await expect(open(env, "v1:nope", "pac_one")).rejects.toThrow("secret_box_malformed");
    await expect(open(env, `v2:${iv}:${ct}`, "pac_one")).rejects.toThrow("secret_box_malformed");
  });

  it("opens rows sealed under the previous key during a rotation", async () => {
    const underOld = await seal({ PAYMENTS_ENCRYPTION_KEY: OTHER }, "rotated", "pac_one");

    // The new key alone cannot read it…
    await expect(open({ PAYMENTS_ENCRYPTION_KEY: KEY }, underOld, "pac_one")).rejects.toThrow();
    // …and with the old one named as PREV, it can.
    expect(
      await open({ PAYMENTS_ENCRYPTION_KEY: KEY, PAYMENTS_ENCRYPTION_KEY_PREV: OTHER }, underOld, "pac_one"),
    ).toBe("rotated");
    // The fallback does not loosen the row binding.
    await expect(
      open({ PAYMENTS_ENCRYPTION_KEY: KEY, PAYMENTS_ENCRYPTION_KEY_PREV: OTHER }, underOld, "pac_two"),
    ).rejects.toThrow("secret_box_open_failed");
  });

  it("fails loudly without a usable key rather than storing plaintext", async () => {
    await expect(seal({ PAYMENTS_ENCRYPTION_KEY: undefined }, "x", "pac_one")).rejects.toThrow(
      "PAYMENTS_ENCRYPTION_KEY is not configured",
    );
    await expect(seal({ PAYMENTS_ENCRYPTION_KEY: btoa("too-short") }, "x", "pac_one")).rejects.toThrow(
      "must decode to 32 bytes",
    );
  });
});
