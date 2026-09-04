import type { Bindings } from "../env.js";

/**
 * Short-lived download URLs for bytes that live in R2.
 *
 * R2 in Workers has no presign, so a bucket object cannot be handed to a
 * browser the way S3 would do it. The alternative everyone reaches for first —
 * putting the API key in the query string — is the one thing the rest of this
 * API refuses to do: an `sk_live_` in a URL lands in access logs, proxy logs
 * and `Referer`, and it is organization-wide and long-lived. A signature is the
 * opposite on every axis: it names one object, it expires in minutes, and
 * leaking it costs exactly that object.
 *
 * The signed payload is `kind.id.exp` and deliberately not the organization id.
 * The signer already knew the org; the download route re-reads it from the row.
 * Putting it in the URL would leak a tenant identifier for no verification
 * benefit.
 */

export type SignedKind = "export" | "file";

/** 10 minutes: long enough to click, short enough that a leaked link is stale. */
const DEFAULT_TTL_SECONDS = 600;

function secretOf(env: Bindings): string {
  return env.SIGNING_SALT || env.BETTER_AUTH_SECRET;
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 128 bits of the digest.
 *
 * Truncation is safe for a MAC and halves a URL that people paste into
 * terminals; 2^128 is not a space anyone forges a link out of.
 */
function truncate(hex: string): string {
  return hex.slice(0, 32);
}

/** Constant-time over two hex strings of equal length. */
function sameSignature(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface SignedDownload {
  /** Absolute, because the caller is usually not the browser that will follow it. */
  url: string;
  /** Unix milliseconds, so a client can decide to re-mint rather than retry. */
  expiresAt: number;
}

export async function signDownload(
  env: Bindings,
  kind: SignedKind,
  id: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<SignedDownload> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = truncate(await hmacHex(secretOf(env), `${kind}.${id}.${exp}`));
  const origin = (env.APP_ORIGIN || "").replace(/\/+$/, "");
  return { url: `${origin}/d/${kind}/${id}?exp=${exp}&sig=${sig}`, expiresAt: exp * 1000 };
}

export type SignatureVerdict = "ok" | "expired" | "invalid";

export async function verifyDownload(
  env: Bindings,
  kind: SignedKind,
  id: string,
  expRaw: string | undefined,
  sig: string | undefined,
): Promise<SignatureVerdict> {
  if (!expRaw || !sig) return "invalid";
  const exp = Number(expRaw);
  if (!Number.isFinite(exp)) return "invalid";
  const expected = truncate(await hmacHex(secretOf(env), `${kind}.${id}.${exp}`));
  // Signature first, expiry second: answering "expired" for a URL nobody could
  // have signed would confirm that the id exists.
  if (!sameSignature(expected, sig)) return "invalid";
  if (exp * 1000 < Date.now()) return "expired";
  return "ok";
}
