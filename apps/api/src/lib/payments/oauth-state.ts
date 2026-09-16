import type { Bindings } from "../../env.js";
import { timingSafeEqual } from "../crypto.js";
import { webOrigins } from "../origins.js";
import { hmacSha256, toBase64Url } from "./webhook-sig.js";

/**
 * The `state` that carries a connect attempt through Cashfree's or Razorpay's consent screen and
 * back.
 *
 * The callback is a bare browser redirect, so `state` is the only thing tying "someone approved
 * a Razorpay account" to "this organization asked for it". Three properties matter:
 *
 *   - It cannot be forged. It is HMAC-signed with a key only the worker holds.
 *   - It dies. Ten minutes, which is longer than any consent screen and shorter than a leaked
 *     link stays useful.
 *   - It works once. The nonce is claimed with a conditional write, so a replayed callback —
 *     a refresh of the landing page, or someone else holding the URL — connects nothing.
 *
 * Why the payload is stored rather than carried: Cashfree caps `state` at 64 characters
 * (https://www.cashfree.com/docs/partners/embedded/oauth-flow), and an organization id, a user
 * id and a return URL do not fit. So the token the gateway sees is only `nonce.mac`; the payload
 * lives in a D1 row keyed by the nonce and the MAC covers both, which means a row edited in
 * place fails verification exactly as a token edited in flight does.
 *
 * The row is an `idempotency_keys` row under its own `endpoint` rather than a table of its own.
 * That table already is "a single-use claim with an expiry": a unique index to claim against, an
 * `expires_at`, and the existing cron sweep (`pruneIdempotencyKeys`) that deletes spent rows.
 * A new migration for the same four columns would buy nothing.
 *
 * Verification is also consumption. There is no "check it now, spend it later" API to misuse.
 *
 * None of this makes the callback safe on its own: the route also requires that the browser
 * completing it is signed in as the user who started it. Without that, an attacker could start
 * a connect for their own organization and send the consent link to a victim, whose approval
 * would land the victim's merchant account in the attacker's organization.
 */

export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const STATE_ENDPOINT = "payment_oauth_state";
const NONCE_HEX = 32;
const MAC_CHARS = 24;
const TOKEN_RE = new RegExp(`^[0-9a-f]{${NONCE_HEX}}\\.[A-Za-z0-9_-]{${MAC_CHARS}}$`);

export type OAuthProvider = "cashfree" | "razorpay";

export interface OAuthStatePayload {
  orgId: string;
  userId: string;
  provider: OAuthProvider;
  nonce: string;
  /** Validated against `WEB_ORIGINS` before it was signed. */
  returnTo: string;
  /** Epoch ms. */
  exp: number;
}

/** What a token exchange or refresh yields, whichever gateway issued it. */
export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms, or null when the gateway did not say. */
  accessExpiresAt: number | null;
  refreshExpiresAt: number | null;
  /** The merchant the token acts as — Cashfree `merchant_id`, Razorpay `razorpay_account_id`. */
  providerAccountId: string | null;
  /** Razorpay's publishable key for Checkout. Never a secret. */
  publicToken?: string | null;
}

function b64urlJson(value: unknown): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function fromB64urlJson(text: string): unknown {
  const bin = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function mac(env: Pick<Bindings, "BETTER_AUTH_SECRET">, nonce: string, payloadB64: string): Promise<string> {
  // Domain-separated, so no other HMAC this worker computes with the same secret can be
  // replayed as a state.
  const bytes = await hmacSha256(env.BETTER_AUTH_SECRET, `chatform.payment_oauth_state.v1.${nonce}.${payloadB64}`);
  return toBase64Url(bytes).slice(0, MAC_CHARS);
}

/**
 * An absolute URL on one of the app's own origins, or null.
 *
 * The callback redirects here, so this is the open-redirect check: anything that is not one of
 * `WEB_ORIGINS` is refused rather than normalised. The fragment is dropped — it would swallow the
 * `?payments=` the callback appends.
 */
export function validateReturnTo(env: Bindings, returnTo: unknown): string | null {
  if (typeof returnTo !== "string" || returnTo.length > 1000) return null;
  let url: URL;
  try {
    url = new URL(returnTo);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!webOrigins(env).includes(url.origin)) return null;
  url.hash = "";
  return url.toString();
}

/** Sign a new state and record its nonce. Returns the compact token the gateway will echo back. */
export async function signOAuthState(
  env: Bindings,
  input: { orgId: string; userId: string; provider: OAuthProvider; returnTo: string },
  now = Date.now(),
): Promise<{ state: string; payload: OAuthStatePayload }> {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(NONCE_HEX / 2));
  const nonce = Array.from(nonceBytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const payload: OAuthStatePayload = { ...input, nonce, exp: now + OAUTH_STATE_TTL_MS };
  const payloadB64 = b64urlJson(payload);

  await env.DB.prepare(
    `INSERT INTO idempotency_keys (id, organization_id, endpoint, request_hash, response_body, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(`idm_${nonce.slice(0, 20)}`, input.orgId, STATE_ENDPOINT, nonce, payloadB64, payload.exp, now)
    .run();

  return { state: `${nonce}.${await mac(env, nonce, payloadB64)}`, payload };
}

export type OAuthStateFailure = "malformed" | "unknown" | "bad_signature" | "expired" | "used";

/**
 * Verify and spend a state. Anything suspect is a failure with a reason; nothing throws on
 * attacker-controlled input.
 *
 * An `expired` or `used` failure also carries the state's `returnTo` and `provider`. Both have
 * already passed the MAC by then, so they are the values this worker signed — safe to redirect
 * to, and the only way an admin who took too long on the consent screen lands back on the page
 * that can tell them so, rather than on the site root with no word of what happened.
 *
 * The claim is `UPDATE … WHERE response_status IS NULL`, checked through `meta.changes`: two
 * callbacks racing with the same state both pass the signature check and exactly one of them
 * wins the write.
 */
export async function verifyOAuthState(
  env: Bindings,
  token: string | null | undefined,
  now = Date.now(),
): Promise<
  | { ok: true; payload: OAuthStatePayload }
  | { ok: false; reason: OAuthStateFailure; returnTo?: string; provider?: OAuthProvider }
> {
  if (!token || !TOKEN_RE.test(token)) return { ok: false, reason: "malformed" };
  const [nonce, presented] = token.split(".") as [string, string];

  const row = await env.DB.prepare(
    `SELECT response_body, response_status FROM idempotency_keys WHERE endpoint = ? AND request_hash = ? LIMIT 1`,
  )
    .bind(STATE_ENDPOINT, nonce)
    .first<{ response_body: string | null; response_status: number | null }>();
  if (!row?.response_body) return { ok: false, reason: "unknown" };

  if (!timingSafeEqual(presented, await mac(env, nonce, row.response_body))) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: OAuthStatePayload;
  try {
    payload = fromB64urlJson(row.response_body) as OAuthStatePayload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (payload.nonce !== nonce || typeof payload.exp !== "number") return { ok: false, reason: "malformed" };
  const signed = { returnTo: payload.returnTo, provider: payload.provider };
  if (payload.exp < now) return { ok: false, reason: "expired", ...signed };
  if (row.response_status != null) return { ok: false, reason: "used", ...signed };

  const claimed = await env.DB.prepare(
    `UPDATE idempotency_keys SET response_status = 200
      WHERE endpoint = ? AND request_hash = ? AND response_status IS NULL`,
  )
    .bind(STATE_ENDPOINT, nonce)
    .run();
  if ((claimed.meta?.changes ?? 0) !== 1) return { ok: false, reason: "used", ...signed };

  return { ok: true, payload };
}
