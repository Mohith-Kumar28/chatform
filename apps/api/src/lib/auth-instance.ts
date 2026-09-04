import type { Bindings } from "../env.js";
import { createAuth, type Auth } from "./auth.js";

/**
 * One Better Auth instance per environment.
 *
 * Construction is not free — a Drizzle adapter plus the organization and
 * api-key plugins — and it used to run on every request in six routers. It
 * lives in its own module rather than in `guards.ts` so that `apikeys.ts` can
 * reach it without the two importing each other.
 */
const authCache = new WeakMap<Bindings, Auth>();

export function getAuth(env: Bindings): Auth {
  let auth = authCache.get(env);
  if (!auth) {
    auth = createAuth(env);
    authCache.set(env, auth);
  }
  return auth;
}
