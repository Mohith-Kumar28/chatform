import type { Bindings } from "../env.js";

/**
 * Sealing the credentials a form admin hands us for their own payment gateway.
 *
 * An OAuth token for a merchant's Razorpay account or a restricted Stripe key
 * can create charges and read that merchant's payments. A D1 export, a backup
 * or a stray `SELECT *` must not be enough to do either, so these never sit in
 * the database as plaintext: they are AES-256-GCM ciphertext under a key that
 * lives only in the worker's secrets (`PAYMENTS_ENCRYPTION_KEY`).
 *
 * The `aad` is the row id the value belongs to, and it is authenticated with
 * the ciphertext without being stored in it. That is what stops the quieter
 * attack a database writer has even without the key: copying one account's
 * sealed credentials onto another account's row. The copy does not open,
 * because the tag was computed over a different id.
 *
 * `v1:<base64 iv>:<base64 ciphertext+tag>`. The version prefix is there so a
 * change of algorithm is a new prefix beside the old one rather than a
 * migration that has to rewrite every row at once.
 *
 * Rotation: set the new key as `PAYMENTS_ENCRYPTION_KEY` and the old one as
 * `PAYMENTS_ENCRYPTION_KEY_PREV`. Everything opens under either; everything
 * sealed from then on uses the new one, and rows written under the old key
 * move over the next time they are re-sealed (every token refresh does it).
 */

const VERSION = "v1";
const IV_BYTES = 12;

/**
 * Imported keys, by the base64 text they came from.
 *
 * Filled on first use, never at module load: Workers refuse `crypto.subtle`
 * outside a request, and the pool the tests run in does not, so a key imported
 * at global scope passes every test and then stops the real worker booting.
 * Keyed by the secret's text so a rotated key is a new entry rather than a
 * stale one, and holding the promise so two concurrent first calls import once.
 */
let keyCache: Map<string, Promise<CryptoKey>> | undefined;

function importKey(b64: string): Promise<CryptoKey> {
  keyCache ??= new Map();
  let key = keyCache.get(b64);
  if (!key) {
    const raw = decodeKey(b64);
    key = crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    // A failed import must not be cached, or one bad deploy poisons the isolate.
    key.catch(() => keyCache?.delete(b64));
    keyCache.set(b64, key);
  }
  return key;
}

function decodeKey(b64: string): Uint8Array {
  let raw: Uint8Array;
  try {
    raw = fromBase64(b64.trim());
  } catch {
    throw new Error("PAYMENTS_ENCRYPTION_KEY is not valid base64");
  }
  // Said plainly, because AES-GCM would otherwise accept a 16- or 24-byte key
  // and quietly give us a weaker cipher than the one this file claims.
  if (raw.length !== 32) {
    throw new Error(`PAYMENTS_ENCRYPTION_KEY must decode to 32 bytes, got ${raw.length}`);
  }
  return raw;
}

function currentKey(env: Pick<Bindings, "PAYMENTS_ENCRYPTION_KEY">): string {
  const key = env.PAYMENTS_ENCRYPTION_KEY?.trim();
  if (!key) {
    // Thrown rather than degraded: there is no safe fallback for "store this
    // credential" — plaintext is the one outcome this module exists to prevent.
    throw new Error("PAYMENTS_ENCRYPTION_KEY is not configured");
  }
  return key;
}

/** Seal `plaintext` for the row named by `aad`. Never logs either. */
export async function seal(
  env: Pick<Bindings, "PAYMENTS_ENCRYPTION_KEY">,
  plaintext: string,
  aad: string,
): Promise<string> {
  const key = await importKey(currentKey(env));
  // Inside the call, per the rule above, and fresh per seal: a repeated IV
  // under GCM gives away both plaintexts' XOR and the authentication key.
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    key,
    enc.encode(plaintext),
  );
  return `${VERSION}:${toBase64(iv)}:${toBase64(new Uint8Array(ct))}`;
}

/**
 * Open a value sealed for the row named by `aad`.
 *
 * Tries the current key, then `PAYMENTS_ENCRYPTION_KEY_PREV`. Throws on a
 * wrong key, a wrong `aad`, or any tampering — GCM cannot tell those apart,
 * and none of them should be retried.
 */
export async function open(
  env: Pick<Bindings, "PAYMENTS_ENCRYPTION_KEY" | "PAYMENTS_ENCRYPTION_KEY_PREV">,
  sealed: string,
  aad: string,
): Promise<string> {
  const parts = sealed.split(":");
  if (parts.length !== 3 || parts[0] !== VERSION) throw new Error("secret_box_malformed");
  let iv: Uint8Array;
  let ct: Uint8Array;
  try {
    iv = fromBase64(parts[1]!);
    ct = fromBase64(parts[2]!);
  } catch {
    throw new Error("secret_box_malformed");
  }
  if (iv.length !== IV_BYTES) throw new Error("secret_box_malformed");

  const candidates = [currentKey(env)];
  const prev = env.PAYMENTS_ENCRYPTION_KEY_PREV?.trim();
  if (prev && prev !== candidates[0]) candidates.push(prev);

  const additionalData = new TextEncoder().encode(aad);
  for (const b64 of candidates) {
    const key = await importKey(b64);
    try {
      const pt = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as BufferSource, additionalData },
        key,
        ct as BufferSource,
      );
      return new TextDecoder().decode(pt);
    } catch {
      // Next key. The error names nothing about which part failed, on purpose.
    }
  }
  throw new Error("secret_box_open_failed");
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
