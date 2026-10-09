import type { MiddlewareHandler } from "hono";
import type { Bindings } from "../env.js";
import { readPresentedKey, hashApiKey } from "./apikeys.js";
import { respondentToken } from "../routes/helpers.js";
import type { GuardVars } from "./guards.js";
import { isInternalCall } from "./internal-call.js";

/**
 * Burst protection, ahead of verification.
 *
 * This is the cheapest of the three limits and the only one that runs before we
 * touch the database, which is the whole point: a caller spraying guessed keys
 * should never reach D1. It is keyed by the digest of whatever was presented,
 * because at this stage there is no key id yet — same bytes, one hash, no read.
 *
 * The binding is per-colo and eventually consistent, so "20 per 10s" is really
 * "20 per 10s per Cloudflare location". That is fine for absorbing abuse and
 * useless as a product promise, which is why the number a customer is told
 * lives on the key row itself and is enforced inside `verifyApiKey`.
 *
 * The whole thing degrades to a no-op when the binding is absent, rather than
 * failing closed: a local runtime without `ratelimits` should still serve
 * requests.
 */

async function bucketFor(presented: string): Promise<string> {
  // The stored-hash function, truncated. Never the key itself: a rate-limit key
  // is not a place to put a secret.
  return (await hashApiKey(presented)).slice(0, 24);
}

function tooMany(
  c: Parameters<MiddlewareHandler>[0],
  { seconds, scope, policy }: { seconds: number; scope: "burst" | "user"; policy?: string },
) {
  c.header("retry-after", String(seconds));
  // Only when there is one to state. This used to be set unconditionally, with
  // an empty string for anything that was not the burst limiter — a header
  // present and blank, which a client parsing it has to treat as a policy of
  // nothing rather than as no policy at all.
  if (policy) c.header("ratelimit-policy", policy);
  return c.json({ error: { code: "rate_limited", message: "Too many requests", scope } }, 429);
}

export const burstLimit: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Partial<GuardVars>;
}> = async (c, next) => {
  /**
   * An MCP tool call re-enters this worker to reach `/v1`, and it was already
   * counted on the way in at `/mcp`. Counting it twice would halve the limit a
   * customer is entitled to. The marker is a per-isolate UUID that never leaves
   * the worker, so it cannot be presented from outside.
   */
  if (isInternalCall(c)) return next();

  const presented = readPresentedKey(c);
  if (!presented) return next(); // no key: `requireApiKey` answers with a 401

  // Publishable keys legitimately burst — one window per respondent on a busy
  // page — so they get their own, roomier binding.
  const name: LimitName = presented.startsWith("pk_") ? "RATE_LIMIT_PK" : "RATE_LIMIT";
  const success = await withinLimit(c.env, name, `k:${await bucketFor(presented)}`);
  if (!success) return tooMany(c, { seconds: 10, scope: "burst", policy: "100;w=10" });
  await next();
};

/**
 * Count a request against each key, on Cloudflare's edge only.
 *
 * Every key is a conversation, a respondent token or a user. Never an IP
 * address: an address is a campus, an office or a mobile carrier, and counting
 * it counts a crowd. Nothing here reads the address at all.
 *
 * Three rules, and each one is load-bearing rather than defensive:
 *
 * 1. **Off the edge, no limit.** Miniflare, the test suite and a direct request
 *    to `wrangler dev` carry no `cf-ray`, the request id Cloudflare stamps on
 *    everything it forwards. `vitest.config.ts` points Miniflare at this same
 *    `wrangler.jsonc`, so without this rule the suite's own fixtures would
 *    start meeting 429s. In production the header is always there.
 * 2. **No binding, no limit** — as `burstLimit` already does.
 * 3. **A throwing limiter is not an outage.** `burstLimit` does not catch, and
 *    on `/v1` that is arguable. Here it is not: a limiter exception would turn a
 *    live form into a 500 for a respondent halfway through answering it, which
 *    is strictly worse than a request that went uncounted.
 */
/**
 * The limits, as `wrangler.jsonc` declares them, for the counter kept here.
 *
 * Cloudflare's rate limit binding does not refuse anything from a worker with
 * a placement, and this one is placed beside the database. Measured on
 * 2026-10-09 with two otherwise identical workers and a limit of 20 a minute:
 * the unplaced one refused 59 of 150 requests, the placed one none of 150,
 * and this API answered a thousand calls on one key in a minute with
 * `success: true` every time. So every limit in this file had been inert
 * since the placement went in.
 *
 * The binding is still asked, and still obeyed if it ever answers no. Beside
 * it sits a plain count per key held in this isolate's memory. That is per
 * isolate, so it can only ever let through more than the declared limit,
 * never less: a loose bound, which is all the binding promised either.
 */
const LIMITS = {
  RATE_LIMIT: { limit: 100, periodMs: 10_000 },
  RATE_LIMIT_PK: { limit: 600, periodMs: 10_000 },
  RATE_LIMIT_P: { limit: 120, periodMs: 60_000 },
  RATE_LIMIT_P_AUTH: { limit: 12, periodMs: 60_000 },
  RATE_LIMIT_RESERVE: { limit: 1200, periodMs: 60_000 },
  RATE_LIMIT_ASSET: { limit: 60, periodMs: 60_000 },
  RATE_LIMIT_SAVE: { limit: 120, periodMs: 60_000 },
} as const;
export type LimitName = keyof typeof LIMITS;

const windows = new Map<string, { started: number; count: number }>();
const MAX_WINDOWS = 20_000;

/** Count one against `key` in this isolate. False once the window is spent. */
function countLocally(name: LimitName, key: string): boolean {
  const { limit, periodMs } = LIMITS[name];
  const now = Date.now();
  const id = `${name}:${key}`;
  const current = windows.get(id);
  if (!current || now - current.started >= periodMs) {
    // Bounded: a flood of distinct keys must not become a flood of memory.
    if (windows.size >= MAX_WINDOWS) {
      for (const [k, w] of windows) if (now - w.started >= 60_000) windows.delete(k);
      if (windows.size >= MAX_WINDOWS) windows.clear();
    }
    windows.set(id, { started: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

/** One request against one limit: the binding's verdict, and this isolate's own count. */
export async function withinLimit(env: Bindings, name: LimitName, key: string): Promise<boolean> {
  const binding = env[name];
  if (!binding) return true;
  const local = countLocally(name, key);
  try {
    const { success } = await binding.limit({ key });
    return success && local;
  } catch {
    return local;
  }
}

async function limited(
  c: Parameters<MiddlewareHandler>[0],
  name: LimitName,
  keys: string[],
): Promise<boolean> {
  if (!c.req.header("cf-ray")) return false;
  for (const key of keys) {
    if (!(await withinLimit(c.env as Bindings, name, key))) return true;
  }
  return false;
}

/**
 * Reserving a session object: per device, and all together.
 *
 * Nobody is identified by address here either. A device that sent its signal
 * is held to the per-conversation rate, which bounds a tab stuck in a loop.
 * That signal is the caller's own word, so the second limit does not depend on
 * it: one bucket for every reservation there is. Being refused costs a
 * respondent nothing they can see. The form opens without a reservation.
 */
export async function reserveLimited(
  c: Parameters<MiddlewareHandler<{ Bindings: Bindings }>>[0],
  device: string | null,
): Promise<boolean> {
  if (device && (await limited(c, "RATE_LIMIT_P", [`rv:${device.slice(0, 64)}`]))) return true;
  return limited(c, "RATE_LIMIT_RESERVE", ["rv:all"]);
}

/**
 * Inside a conversation, counted per conversation. Never per address.
 *
 * The respondent surface used to count by address as well: 120 requests a
 * minute for everything under `/p`, and 8 session opens. An address is not a
 * person. A campus Wi-Fi, an office, or a mobile carrier's shared address
 * (most of Jio and Airtel) puts hundreds or thousands of respondents behind
 * one, and at a registration event the ninth person in a room to open the
 * form in a minute was turned away. A form must take every real respondent,
 * however many arrive at once, so nothing here may count a crowd.
 *
 * What is left is the unit that can actually misbehave: one runaway tab,
 * bounded to two requests a second sustained, which no person answering
 * questions comes near. Keeping bots out is Turnstile's job at session start
 * (`open-session.ts`), and a flood from one machine is Cloudflare's edge's.
 */
export const publicSessionLimit: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const sessionId = c.req.path.match(/^\/p\/sessions\/([^/]+)/)?.[1];
  if (sessionId && (await limited(c, "RATE_LIMIT_P", [`ps:${sessionId}`]))) {
    return tooMany(c, { seconds: 60, scope: "user", policy: "120;w=60" });
  }
  await next();
};

/**
 * Proving an identity: a JWKS fetch happens before the attempt can even fail.
 *
 * Per respondent token, for the reason `respondentPaymentLimit` gives: at an
 * event, a whole hall signs in behind one address, and counting them together
 * refused the thirteenth. A request with no token is not counted at all: it is
 * answered 401 by `requireRespondent` a moment later.
 */
export const respondentAuthLimit: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const token = respondentToken(c);
  if (token && (await limited(c, "RATE_LIMIT_P_AUTH", [`pa:t:${await bucketFor(token)}`]))) {
    return tooMany(c, { seconds: 60, scope: "user", policy: "12;w=60" });
  }
  await next();
};

/**
 * Opening a checkout: a call on the form admin's gateway account, and possibly a token refresh.
 *
 * Per respondent, not per address. It shared the sign-in bucket once — twelve a minute per
 * address — and a live event is exactly where that fails: a campus Wi-Fi puts hundreds of
 * respondents behind one address, their phone codes and their Pay presses all counted together,
 * and the thirteenth person to tap Pay in a minute was told to slow down at the moment they were
 * trying to hand over money. One respondent is the unit that can misbehave here, and
 * `MAX_PAYMENT_ATTEMPTS` already caps the orders one of them can open; this bounds the rest (a
 * retry loop, a gateway that keeps refusing) to twelve a minute each.
 *
 * "One respondent" means their token, not the session id in the path. A session id is not a
 * secret — it rides in the `/p` URL and in the return address a gateway redirects to, and it ends
 * up in gateway logs and browser history — so a bucket named after one let anybody who had seen
 * it spend a respondent's whole minute of Pay presses with unauthenticated posts, which is a
 * thing to do to a form at the moment its event starts. The token is the credential the route
 * goes on to check, hashed here for the same reason the API-key limiter hashes: a rate-limit key
 * is not a place to put a secret. A request with no token has nothing to own a bucket with, so it
 * is not counted, and is answered 401 a moment later by `requireRespondent`.
 *
 * The same binding as sign-in, under its own key prefix, so the two never share a count and no
 * new binding has to be provisioned.
 */
export const respondentPaymentLimit: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const token = respondentToken(c);
  if (token && (await limited(c, "RATE_LIMIT_P_AUTH", [`pay:t:${await bucketFor(token)}`]))) {
    return tooMany(c, { seconds: 60, scope: "user", policy: "12;w=60" });
  }
  await next();
};

/**
 * The builder's autosave, keyed by the author rather than by address.
 *
 * Per user because that is the unit that misbehaves: an office behind one
 * address is many authors who must not exhaust each other, and a runaway tab is
 * one author who should not be able to. Mounted ahead of `requireOrg` so a
 * refusal costs nothing — the three guard reads that follow are the expense this
 * limit exists to avoid paying for a client stuck in a loop.
 *
 * 120 a minute is deliberately far above the ceiling the editor itself imposes:
 * autosave checkpoints at most every ten seconds per tab, so a person with five
 * forms open still sits at a quarter of this. It is a bound on a bug, not a
 * budget for a user, and — like every binding here — it is per-colo and
 * eventually consistent, so it is not a number to state as a promise.
 *
 * Keyed through `limited`, which is what keeps it inert off the Cloudflare edge:
 * `vitest.config.ts` points Miniflare at this same `wrangler.jsonc`, so a
 * limiter that counted off the edge (no `cf-ray`) would start failing the test
 * suite on its own fixtures.
 */
export const saveLimit: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Partial<GuardVars>;
}> = async (c, next) => {
  const userId = c.get("userId");
  if (userId && (await limited(c, "RATE_LIMIT_SAVE", [`save:${userId}`]))) {
    return tooMany(c, { seconds: 60, scope: "user", policy: "120;w=60" });
  }
  await next();
};

/**
 * Asset uploads, keyed by the author rather than by address.
 *
 * Same reasoning as `saveLimit`: an office behind one address is many authors
 * who must not exhaust each other. Sixty a minute is far above adding images
 * to a form by hand and far below anything that could fill a bucket, and like
 * every binding here it is per-colo and eventually consistent — a bound on a
 * loop, not a quota to state.
 */
export const assetLimit: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Partial<GuardVars>;
}> = async (c, next) => {
  const userId = c.get("userId");
  if (userId && (await limited(c, "RATE_LIMIT_ASSET", [`asset:${userId}`]))) {
    return tooMany(c, { seconds: 60, scope: "user", policy: "60;w=60" });
  }
  await next();
};

/**
 * Password and one-time-code attempts, per account being signed into.
 *
 * Better Auth's own limiter keys on the caller's IP address, so it is switched
 * off (`advanced.ipAddress.disableIpTracking` in `lib/auth.ts`) and this takes
 * its place. The email address being attacked is the unit that matters: a
 * guesser hammering one account is capped wherever they send from, and a hall
 * of real people signing in behind one network never share a bucket.
 */
const AUTH_ATTEMPT_PATHS = /\/auth\/(sign-in\/email|sign-up\/email|email-otp\/[^/]+|sign-in\/email-otp|forget-password|request-password-reset)$/;

export async function authAttemptLimited(c: Parameters<MiddlewareHandler>[0], env: Bindings): Promise<boolean> {
  if (c.req.method !== "POST" || !AUTH_ATTEMPT_PATHS.test(c.req.path)) return false;
  let email: unknown;
  try {
    email = ((await c.req.raw.clone().json()) as { email?: unknown }).email;
  } catch {
    return false;
  }
  if (typeof email !== "string" || !email.includes("@")) return false;
  const bucket = (await hashApiKey(`auth:${email.trim().toLowerCase()}`)).slice(0, 24);
  return limited(c, "RATE_LIMIT_P_AUTH", [`au:${bucket}`]);
}

export function authAttemptRefused(c: Parameters<MiddlewareHandler>[0]) {
  return tooMany(c, { seconds: 60, scope: "user", policy: "12;w=60" });
}
