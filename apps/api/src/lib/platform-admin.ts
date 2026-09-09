import type { MiddlewareHandler } from "hono";
import type { Bindings } from "../env.js";
import { getAuth } from "./auth-instance.js";

/**
 * The one guard in this codebase that deliberately crosses tenant boundaries.
 *
 * Every other read path narrows to an organization — `requireOrg` resolves one,
 * `requireFormAccess` re-checks it, and a cross-tenant id answers 404. The platform
 * console is the exception: its whole purpose is to count across all of them. That
 * makes it the one surface where a mistake leaks everybody's data at once, so the
 * gate is deliberately the dumbest thing that could work.
 *
 * Authority is `PLATFORM_ADMIN_EMAILS`, a worker secret. Not a `users.role` column,
 * which is what Better Auth's admin plugin would have added: a column is writable,
 * and the blast radius of a stray UPDATE here is the entire customer base. It would
 * also sit one word away from `members.role`, which already exists and means
 * something completely different (a role *inside* one organization). A secret can
 * only be changed by somebody who can already deploy the worker.
 */

/** Emails from the secret, normalised once per call. Empty when unset. */
function allowlist(env: Bindings): string[] {
  return (env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isPlatformAdmin(env: Bindings, email: string | null | undefined): boolean {
  if (!email) return false;
  const list = allowlist(env);
  // An unset secret means the console does not exist, not that everybody is in it.
  if (list.length === 0) return false;
  return list.includes(email.trim().toLowerCase());
}

export type PlatformAdminVars = {
  userId: string;
  platformAdminEmail: string;
  platformAdmin: true;
};

/**
 * 404, never 403.
 *
 * The same convention `guards.ts` uses for cross-tenant ids, and for the same
 * reason: a 403 confirms that the thing exists and that the caller found it. A
 * signed-in customer poking at `/api/admin/overview` should learn nothing at all,
 * including that there is an admin console to look for.
 */
export const requirePlatformAdmin: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Partial<PlatformAdminVars>;
}> = async (c, next) => {
  const notFound = () => c.json({ error: { code: "not_found", message: "Not found" } }, 404);
  const session = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
  if (!session) return notFound();
  if (!isPlatformAdmin(c.env, session.user.email)) return notFound();
  c.set("userId", session.user.id);
  c.set("platformAdminEmail", session.user.email);
  c.set("platformAdmin", true);
  await next();
};
