/**
 * Where a freshly authenticated browser is allowed to go.
 *
 * Only a same-origin path: anything that is not a single leading slash (a
 * protocol, a `//host`, a backslash Chrome will normalise into one) falls back.
 * This value decides where somebody lands on the screens where they are most
 * primed to trust what happens next, so it is the one open redirect worth
 * being strict about. `/signin`, the `/auth/*` bridge and the Better Auth UI
 * views all read it through here.
 */
export function safeNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}

/** The page the browser is on, path plus query and hash, for a `?next=`. */
export function currentPath(): string {
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
}

/**
 * Fired by the API client on a 401. `AuthGuard` listens, re-asks for the
 * session, and sends a signed-out user to `/signin?next=` the same way a cold
 * load would. Only guarded pages listen, so a public form's 401 goes nowhere.
 */
export const UNAUTHORIZED_EVENT = "chatform:unauthorized";
