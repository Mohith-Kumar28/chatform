import type { MiddlewareHandler } from "hono";
import type { Bindings } from "../env.js";
import { readPresentedKey, hashApiKey } from "./apikeys.js";
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
  { seconds, scope, policy }: { seconds: number; scope: "burst" | "ip"; policy?: string },
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
  const binding = presented.startsWith("pk_") ? c.env.RATE_LIMIT_PK : c.env.RATE_LIMIT;
  if (!binding) return next();

  const { success } = await binding.limit({ key: `k:${await bucketFor(presented)}` });
  if (!success) return tooMany(c, { seconds: 10, scope: "burst", policy: "100;w=10" });
  await next();
};

/**
 * The respondent surface has no key to key on, so it is keyed by address.
 *
 * Three rules here, and each one is load-bearing rather than defensive:
 *
 * 1. **No address, no limit.** Off the Cloudflare edge — Miniflare, the test
 *    suite, a direct request to `wrangler dev` — there is no `cf-connecting-ip`
 *    at all. Bucketing those under a constant like "unknown" would put every
 *    caller in one window, and since `vitest.config.ts` points Miniflare at this
 *    same `wrangler.jsonc`, the first test to open a ninth session would start
 *    failing the suite. In production behind Cloudflare the header is always
 *    there. This is the rule that lets the bindings exist without the tests
 *    knowing.
 * 2. **No binding, no limit** — as `burstLimit` already does.
 * 3. **A throwing limiter is not an outage.** `burstLimit` does not catch, and
 *    on `/v1` that is arguable. Here it is not: a limiter exception would turn a
 *    live form into a 500 for a respondent halfway through answering it, which
 *    is strictly worse than a request that went uncounted.
 */
async function limited(
  c: Parameters<MiddlewareHandler>[0],
  binding: RateLimit | undefined,
  keys: string[],
): Promise<boolean> {
  if (!binding) return false;
  const ip = c.req.header("cf-connecting-ip");
  if (!ip) return false;
  try {
    for (const key of keys) {
      const { success } = await binding.limit({ key });
      if (!success) return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Everything under `/p`, counted per address and — inside a session — per
 * session as well.
 *
 * Two counters rather than one because they fail differently. An office, a
 * school or a phone network behind one address is many respondents who must not
 * exhaust each other; a single runaway tab is one respondent who must not
 * outrun the form. Neither counter alone says both.
 */
export const publicIpLimit: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const ip = c.req.header("cf-connecting-ip");
  const sessionId = c.req.path.match(/^\/p\/sessions\/([^/]+)/)?.[1];
  const keys = [`p:${ip}`, ...(sessionId ? [`ps:${sessionId}`] : [])];
  if (await limited(c, c.env.RATE_LIMIT_P, keys)) {
    return tooMany(c, { seconds: 60, scope: "ip", policy: "120;w=60" });
  }
  await next();
};

/** Opening a session: writes rows, meters a response, and can send mail. */
export const sessionStartLimit: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const ip = c.req.header("cf-connecting-ip");
  if (await limited(c, c.env.RATE_LIMIT_P_START, [`ps:${ip}`])) {
    return tooMany(c, { seconds: 60, scope: "ip", policy: "8;w=60" });
  }
  await next();
};

/** Proving an identity: a JWKS fetch happens before the attempt can even fail. */
export const respondentAuthLimit: MiddlewareHandler<{ Bindings: Bindings }> = async (c, next) => {
  const ip = c.req.header("cf-connecting-ip");
  if (await limited(c, c.env.RATE_LIMIT_P_AUTH, [`pa:${ip}`])) {
    return tooMany(c, { seconds: 60, scope: "ip", policy: "12;w=60" });
  }
  await next();
};

/**
 * Blunt key guessing.
 *
 * Called from the 401 path rather than up front, so a caller with a valid key is
 * never counted against their own address — offices and CI runners share one.
 */
export async function countFailedKeyAttempt(c: {
  env: Bindings;
  req: { header(name: string): string | undefined };
}): Promise<void> {
  const ip = c.req.header("cf-connecting-ip");
  if (!ip || !c.env.RATE_LIMIT) return;
  try {
    await c.env.RATE_LIMIT.limit({ key: `bad:${ip}` });
  } catch {
    // Telemetry for abuse, not a gate. Never fail a request over it.
  }
}
