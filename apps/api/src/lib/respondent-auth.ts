import { RespondentIdentity, normalizeE164 } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { enqueueMail } from "./mail.js";

/**
 * Respondent sign-in.
 *
 * Two properties shape everything here:
 *
 * 1. A respondent is not a user. Verifying an identity must not create a
 *    Better Auth account, join an organization, or set a cookie. The result is
 *    an attestation the DO stores on the session.
 * 2. It has to work headlessly. The `/v1` API lets a customer drive the whole
 *    conversation from their own server, so no method may be the *only* way in
 *    while depending on our page being open. Google is verified from an ID
 *    token the caller supplies; phone has two entries that meet at the same
 *    identity shape:
 *
 *      - `verifyFirebasePhoneToken` — what the hosted form uses. Firebase
 *        sends and checks the SMS, so there is no number to rent and no Indian
 *        DLT registration to sit through, which is the whole reason it is here.
 *        It is a browser SDK flow with a reCAPTCHA step, so it cannot be the
 *        headless path.
 *      - `startPhoneChallenge` / `verifyPhoneChallenge` — our own OTP over
 *        HTTP, which is. It needs an SMS provider configured; without one it
 *        fails closed.
 *
 *    Both mint `provider: "phone"` with the E.164 number as the subject, so a
 *    respondent verified either way is the same person to `onePerIdentity`.
 *
 * The OTP half of that also serves a second, smaller question. A `verify` email
 * or phone *question* — see `blocks.ts` — proves one answer rather than a whole
 * respondent, and wants exactly the same code, caps and expiry. So the codes are
 * one implementation scoped by what they prove (`startOtpChallenge`), and the
 * sign-in pair below is a thin wrapper over it that also mints an identity.
 */

// ───────────────────────────── Google ─────────────────────────────

const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

interface Jwk {
  kid: string;
  n: string;
  e: string;
  alg?: string;
  kty: string;
}

/**
 * Google rotates signing keys on the order of days, so each set is cached for
 * the lifetime of the isolate with a short TTL. A `kid` miss forces a refetch
 * once — that is what makes rotation a non-event rather than an outage.
 *
 * Keyed by URL because Google publishes its OAuth keys and the ones Firebase
 * signs session tokens with at two different endpoints, and a single shared
 * cache would let a token signed for one be checked against the other's keys.
 */
const jwksCaches = new Map<string, { keys: Jwk[]; fetchedAt: number }>();
const JWKS_TTL_MS = 60 * 60 * 1000;

async function getSigningKey(jwksUrl: string, kid: string, allowRefetch = true): Promise<CryptoKey | null> {
  let cache = jwksCaches.get(jwksUrl);
  if (!cache || Date.now() - cache.fetchedAt > JWKS_TTL_MS) {
    const res = await fetch(jwksUrl);
    if (!res.ok) return null;
    const body = (await res.json()) as { keys: Jwk[] };
    cache = { keys: body.keys ?? [], fetchedAt: Date.now() };
    jwksCaches.set(jwksUrl, cache);
  }
  const jwk = cache.keys.find((k) => k.kid === kid);
  if (!jwk) {
    if (!allowRefetch) return null;
    jwksCaches.delete(jwksUrl); // key rotated mid-cache; refetch once
    return getSigningKey(jwksUrl, kid, false);
  }
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/**
 * Check an RS256 JWT's signature against a published key set and hand back the
 * decoded claims. Shared by both ID-token paths: everything up to "is this
 * token authentic" is identical, and only the claim checks differ.
 */
async function verifyRs256<T>(
  jwksUrl: string,
  token: string,
): Promise<{ ok: true; claims: T } | { ok: false; code: string; message: string }> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, code: "malformed_token", message: "That sign-in could not be read." };

  const header = b64urlToJson<{ alg: string; kid: string }>(parts[0]!);
  const claims = b64urlToJson<T>(parts[1]!);
  if (!header || !claims) return { ok: false, code: "malformed_token", message: "That sign-in could not be read." };
  if (header.alg !== "RS256") return { ok: false, code: "bad_alg", message: "Unsupported sign-in token." };

  const key = await getSigningKey(jwksUrl, header.kid);
  if (!key) return { ok: false, code: "unknown_key", message: "Could not verify that sign-in. Try again." };

  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64urlToBytes(parts[2]!) as BufferSource,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!verified) return { ok: false, code: "bad_signature", message: "Could not verify that sign-in." };

  return { ok: true, claims };
}

function b64urlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(input.length / 4) * 4, "=");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToJson<T>(input: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlToBytes(input))) as T;
  } catch {
    return null;
  }
}

interface GoogleClaims {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  iat: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

export type AuthResult =
  | { ok: true; identity: RespondentIdentity }
  | { ok: false; code: string; message: string };

/**
 * Verify a Google ID token end to end: signature against Google's JWKS, then
 * issuer, audience, and expiry.
 *
 * Decoding the payload without checking the signature — which is what most
 * "parse the JWT" snippets do — would let anyone sign in as anyone by editing
 * a base64 string, so every check below is load-bearing.
 */
export async function verifyGoogleIdToken(env: Bindings, idToken: string): Promise<AuthResult> {
  const clientId = env.GOOGLE_RESPONDENT_CLIENT_ID;
  if (!clientId) {
    return { ok: false, code: "google_not_configured", message: "Google sign-in is not set up for this form." };
  }

  const signed = await verifyRs256<GoogleClaims>(GOOGLE_JWKS_URL, idToken);
  if (!signed.ok) return signed;
  const { claims } = signed;

  if (!GOOGLE_ISSUERS.has(claims.iss)) return { ok: false, code: "bad_issuer", message: "Could not verify that sign-in." };
  // Without this check a token minted for any other Google app would be
  // accepted here — the single most common way this verification is got wrong.
  if (claims.aud !== clientId) return { ok: false, code: "bad_audience", message: "Could not verify that sign-in." };

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) return { ok: false, code: "expired", message: "That sign-in expired. Try again." };
  if (claims.iat > now + 300) return { ok: false, code: "bad_iat", message: "Could not verify that sign-in." };

  return {
    ok: true,
    identity: {
      provider: "google",
      subject: claims.sub,
      email: claims.email_verified ? (claims.email ?? null) : null,
      phone: null,
      name: claims.name ?? null,
      pictureUrl: claims.picture ?? null,
      verifiedAt: Date.now(),
    },
  };
}

// ───────────────────────── Firebase phone ─────────────────────────

/**
 * Firebase signs session tokens with its own key set, published in JWK form at
 * this endpoint. (The `robot/v1/metadata/x509` URL every Admin-SDK example
 * reaches for serves PEM certificates, which Workers cannot import directly.)
 */
const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

interface FirebaseClaims {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  iat: number;
  auth_time?: number;
  phone_number?: string;
  firebase?: { sign_in_provider?: string };
}

/**
 * Verify a Firebase ID token minted by a phone sign-in and turn it into a
 * phone identity.
 *
 * Firebase carries the SMS — no number to rent, no DLT registration, no per
 * message billing of ours — but that also means the SMS never passes through
 * this worker, so this token is the *only* evidence the number was proved. It
 * gets checked as hard as the Google one, plus two constraints that are
 * specific to Firebase and easy to leave out:
 *
 *   - `sign_in_provider` must be "phone". A Firebase project usually has more
 *     than one method enabled, and a token from an anonymous or email sign-in
 *     is signed by the very same key. Without this check anyone could enable a
 *     throwaway method, sign in with it, and present the result as a verified
 *     phone number.
 *   - `phone_number` must be present. It is the subject we store and the value
 *     `onePerIdentity` de-duplicates on; a token without one is not an identity
 *     this function has any business minting.
 */
export async function verifyFirebasePhoneToken(env: Bindings, idToken: string): Promise<AuthResult> {
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    return { ok: false, code: "phone_not_configured", message: "Phone sign-in is not set up for this form." };
  }

  const signed = await verifyRs256<FirebaseClaims>(FIREBASE_JWKS_URL, idToken);
  if (!signed.ok) return signed;
  const { claims } = signed;

  // Both are derived from the project id, so a token from anyone else's
  // Firebase project fails here even though Google signed it with a key this
  // endpoint publishes. This pair is the entire tenant boundary.
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) {
    return { ok: false, code: "bad_issuer", message: "Could not verify that sign-in." };
  }
  if (claims.aud !== projectId) {
    return { ok: false, code: "bad_audience", message: "Could not verify that sign-in." };
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) return { ok: false, code: "expired", message: "That sign-in expired. Try again." };
  if (claims.iat > now + 300) return { ok: false, code: "bad_iat", message: "Could not verify that sign-in." };
  if (!claims.sub) return { ok: false, code: "malformed_token", message: "That sign-in could not be read." };

  if (claims.firebase?.sign_in_provider !== "phone") {
    return { ok: false, code: "wrong_provider", message: "That sign-in did not verify a phone number." };
  }

  // Firebase already emits E.164, but normalising means one spelling of a
  // number reaches the database however it was verified — otherwise the same
  // person could answer twice, once through each path.
  const phone = normalizeE164(claims.phone_number ?? "");
  if (!phone) return { ok: false, code: "no_phone", message: "That sign-in did not verify a phone number." };

  return {
    ok: true,
    identity: {
      provider: "phone",
      subject: phone,
      email: null,
      phone,
      name: null,
      pictureUrl: null,
      verifiedAt: Date.now(),
    },
  };
}

// ─────────────────────── One-time codes over HTTP ───────────────────────

/**
 * Our own OTP, used for two different questions.
 *
 * The sign-in gate asks "who are you" and mints an identity (`scope: "auth"`).
 * A `verify` email or phone question asks "is this value real" about one answer
 * and mints nothing (`scope: "block:<ref>"`). The mechanics are identical — a
 * six-digit code, hashed, capped, expiring — so they are one implementation
 * with the scope carried on the row, and the two never see each other's codes.
 */

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_SCOPE = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;

/** What a code proves. `block:<ref>` is one answer; `auth` is the whole session. */
export type OtpScope = "auth" | `block:${string}`;
/** How it travels. Decided by what is being proved, never by the destination. */
export type OtpChannel = "sms" | "email";

const CHALLENGE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function hashCode(sessionId: string, code: string): Promise<string> {
  // Salted with the session id so the same code in two sessions hashes
  // differently, and a stolen table cannot be attacked with one rainbow table
  // of the ten thousand possible codes.
  const data = new TextEncoder().encode(`${sessionId}:${code}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function sixDigitCode(): string {
  // Rejection-free: take 4 random bytes, mod into range. The tiny modulo bias
  // over 2^32 is irrelevant against a 5-attempt cap.
  const buf = crypto.getRandomValues(new Uint32Array(1));
  return String(buf[0]! % 1_000_000).padStart(6, "0");
}

export type StartResult =
  | { ok: true; destination: string; channel: OtpChannel; devCode?: string }
  | { ok: false; code: string; message: string };

export interface ChallengeRequest {
  sessionId: string;
  scope: OtpScope;
  channel: OtpChannel;
  /** As the respondent typed it. Normalized here, per channel. */
  destination: string;
  /** Dial code to assume for a bare national number. `sms` only. */
  dialHint?: string;
  /** Named in the email, so a code arriving out of context still makes sense. */
  formTitle?: string;
}

/**
 * Send a code, and record what it has to match.
 *
 * The caps are per scope rather than per session: a respondent who spent three
 * sends signing in must not find themselves one send away from being stuck on
 * the delivery-number question. Both are counted from the rows, so they survive
 * an evicted Durable Object and a reconnect.
 */
export async function startOtpChallenge(env: Bindings, req: ChallengeRequest): Promise<StartResult> {
  const { sessionId, scope, channel } = req;

  const destination =
    channel === "sms"
      ? normalizeE164(req.destination, req.dialHint)
      : normalizeChallengeEmail(req.destination);
  if (!destination) {
    return channel === "sms"
      ? { ok: false, code: "invalid_phone", message: "Please enter your number with its country code." }
      : { ok: false, code: "invalid_email", message: "That doesn't look like an email address we can reach." };
  }

  const recent = await env.DB.prepare(
    `SELECT COUNT(*) AS n,
            MAX(created_at) AS last,
            (SELECT destination FROM otp_challenges
              WHERE session_id = ?1 AND scope = ?2
              ORDER BY created_at DESC LIMIT 1) AS last_destination
       FROM otp_challenges WHERE session_id = ?1 AND scope = ?2`,
  )
    .bind(sessionId, scope)
    .first<{ n: number; last: number | null; last_destination: string | null }>();

  if ((recent?.n ?? 0) >= MAX_SENDS_PER_SCOPE) {
    return { ok: false, code: "too_many_codes", message: "Too many codes requested. Please start over." };
  }
  /*
   * The cooldown is a resend cooldown, and only a resend cooldown.
   *
   * Applying it to a *different* destination punishes the one person it should
   * help: somebody who mistyped their number, noticed, and corrected it inside
   * half a minute would be told to wait — with the code they cannot receive
   * still outstanding and no way past it. The send cap above is what limits
   * spend; this only stops the same message being sent twice in a breath.
   */
  if (
    recent?.last &&
    recent.last_destination === destination &&
    Date.now() - recent.last < RESEND_COOLDOWN_MS
  ) {
    return { ok: false, code: "cooldown", message: "Hang on a moment before asking for another code." };
  }

  const code = sixDigitCode();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO otp_challenges (id, session_id, scope, channel, destination, code_hash, attempts, send_count, expires_at, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8, ?9)`,
  )
    .bind(
      `otp_${crypto.randomUUID().slice(0, 16)}`,
      sessionId,
      scope,
      channel,
      destination,
      await hashCode(sessionId, code),
      (recent?.n ?? 0) + 1,
      now + CODE_TTL_MS,
      now,
    )
    .run();

  const sent =
    channel === "sms"
      ? await sendSms(env, destination, `${code} is your verification code.`)
      : await sendCodeEmail(env, destination, code, req.formTitle);
  if (!sent.ok) {
    return channel === "sms"
      ? { ok: false, code: "sms_failed", message: "We couldn't send that code. Please try again." }
      : { ok: false, code: "email_failed", message: "We couldn't email that code. Please try again." };
  }

  // In dev with no SMS provider the code is returned so the flow is testable.
  // Guarded on ENVIRONMENT, never on "is Twilio missing" — a production deploy
  // that lost its credentials must fail closed, not start handing out codes.
  return {
    ok: true,
    destination,
    channel,
    devCode: env.ENVIRONMENT === "development" ? code : undefined,
  };
}

/** Lower-cased and trimmed, or null when it is not an address at all. */
function normalizeChallengeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return CHALLENGE_EMAIL_RE.test(v) && v.length <= 320 ? v : null;
}

export type OtpVerifyResult =
  | { ok: true; destination: string; channel: OtpChannel }
  | { ok: false; code: string; message: string };

/**
 * Check a code against the newest live challenge in one scope.
 *
 * Consumes every outstanding challenge in that scope on success — not the whole
 * session — so proving a delivery number does not silently retire the sign-in
 * code the respondent is still holding.
 */
export async function verifyOtpChallenge(
  env: Bindings,
  sessionId: string,
  scope: OtpScope,
  code: string,
): Promise<OtpVerifyResult> {
  const row = await env.DB.prepare(
    `SELECT id, destination, channel, code_hash, attempts, expires_at
       FROM otp_challenges
      WHERE session_id = ?1 AND scope = ?2 AND consumed_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
  )
    .bind(sessionId, scope)
    .first<{
      id: string;
      destination: string;
      channel: OtpChannel;
      code_hash: string;
      attempts: number;
      expires_at: number;
    }>();

  if (!row) return { ok: false, code: "no_challenge", message: "Ask for a code first." };
  if (row.expires_at < Date.now()) return { ok: false, code: "expired", message: "That code expired. Ask for a new one." };
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, code: "too_many_attempts", message: "Too many wrong codes. Ask for a new one." };
  }

  const supplied = await hashCode(sessionId, code.trim());
  if (supplied !== row.code_hash) {
    await env.DB.prepare(`UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?1`).bind(row.id).run();
    const left = MAX_ATTEMPTS - row.attempts - 1;
    return {
      ok: false,
      code: "wrong_code",
      message: left > 0 ? `That code didn't match. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many wrong codes. Ask for a new one.",
    };
  }

  // Consume every outstanding challenge in this scope, not just this row, so
  // an older un-expired code cannot be replayed afterwards.
  await env.DB.prepare(
    `UPDATE otp_challenges SET consumed_at = ?3 WHERE session_id = ?1 AND scope = ?2 AND consumed_at IS NULL`,
  )
    .bind(sessionId, scope, Date.now())
    .run();

  return { ok: true, destination: row.destination, channel: row.channel };
}

// ──────────────────────── Phone sign-in, our own OTP ────────────────────────

export async function startPhoneChallenge(
  env: Bindings,
  sessionId: string,
  rawPhone: string,
  dialHint?: string,
): Promise<StartResult> {
  return startOtpChallenge(env, {
    sessionId,
    scope: "auth",
    channel: "sms",
    destination: rawPhone,
    dialHint,
  });
}

export async function verifyPhoneChallenge(env: Bindings, sessionId: string, code: string): Promise<AuthResult> {
  const result = await verifyOtpChallenge(env, sessionId, "auth", code);
  if (!result.ok) return result;

  return {
    ok: true,
    identity: {
      provider: "phone",
      subject: result.destination,
      email: null,
      phone: result.destination,
      name: null,
      pictureUrl: null,
      verifiedAt: Date.now(),
    },
  };
}

/**
 * Email one code.
 *
 * Goes through the same queue as every other transactional message, so it
 * inherits the provider fallback, the delivery record and the retries. That
 * costs a second or two of latency, which is the same trade every sign-in code
 * in the product already makes — and the alternative, sending inline, would
 * put an outbound HTTP call on the respondent's turn.
 */
async function sendCodeEmail(
  env: Bindings,
  to: string,
  code: string,
  formTitle?: string,
): Promise<{ ok: boolean }> {
  await enqueueMail(env, { kind: "otp", to, code, purpose: "answer-verification", formTitle });
  return { ok: true };
}

/**
 * Send an SMS via Twilio when it is configured.
 *
 * Deliberately provider-shaped rather than provider-specific at the call site:
 * swapping Twilio for MessageBird or Vonage is this one function. With no
 * credentials in development the code is logged and the send reports success,
 * so the whole flow is exercisable locally without spending money.
 */
async function sendSms(env: Bindings, to: string, body: string): Promise<{ ok: boolean }> {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = env;
  if (!sid || !token || !from) {
    if (env.ENVIRONMENT === "development") {
      console.log(`[otp] would SMS ${to}: ${body}`);
      return { ok: true };
    }
    console.error("sms_not_configured");
    return { ok: false };
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) {
      console.error("sms_send_failed", res.status, await res.text());
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("sms_send_threw", err);
    return { ok: false };
  }
}

/** Sweep consumed and expired challenges. Called from the existing cron. */
export async function pruneOtpChallenges(env: Bindings): Promise<void> {
  // `expires_at` is already now+TTL at insert, so it alone is the deadline —
  // subtracting another TTL here would just keep dead rows for a second window.
  await env.DB.prepare(`DELETE FROM otp_challenges WHERE expires_at < ?1 OR consumed_at IS NOT NULL`)
    .bind(Date.now())
    .run();
}
