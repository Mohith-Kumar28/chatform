import type { MiddlewareHandler } from "hono";
import type { Bindings } from "../env.js";
import { readPresentedKey, hashApiKey } from "./apikeys.js";
import type { GuardVars } from "./guards.js";

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

function tooMany(c: Parameters<MiddlewareHandler>[0], seconds: number, scope: "burst" | "ip") {
  c.header("retry-after", String(seconds));
  c.header("ratelimit-policy", scope === "burst" ? "100;w=10" : "");
  return c.json(
    { error: { code: "rate_limited", message: "Too many requests", scope } },
    429,
  );
}

export const burstLimit: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Partial<GuardVars>;
}> = async (c, next) => {
  const presented = readPresentedKey(c);
  if (!presented) return next(); // no key: `requireApiKey` answers with a 401

  // Publishable keys legitimately burst — one window per respondent on a busy
  // page — so they get their own, roomier binding.
  const binding = presented.startsWith("pk_") ? c.env.RATE_LIMIT_PK : c.env.RATE_LIMIT;
  if (!binding) return next();

  const { success } = await binding.limit({ key: `k:${await bucketFor(presented)}` });
  if (!success) return tooMany(c, 10, "burst");
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
