/**
 * Which browser origins this API serves, and which one a customer comes back to.
 *
 * There are two different questions here and they used to share one variable:
 *
 *   `APP_ORIGIN`  where *this API* answers. Better Auth uses it as `baseURL`, so it has to
 *                 be the API's own public URL and nothing else.
 *   `WEB_ORIGINS` where the *browser app* runs. A comma-separated list, because the same
 *                 deployed API legitimately serves a local dev app and a production one at
 *                 the same time, and both have to work without a redeploy between them.
 *
 * Collapsing these sends a paying customer to `/billing` on the API host, which is a 404.
 */

import type { Bindings } from "../env.js";

/** Every origin allowed to drive this API from a browser. First entry is the default. */
export function webOrigins(env: Bindings): string[] {
  const raw = env.WEB_ORIGINS ?? env.WEB_ORIGIN ?? "";
  const list = raw
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);
  // Falling back to the API's own origin keeps a single-origin deployment working with no
  // extra configuration at all.
  return list.length > 0 ? list : [env.APP_ORIGIN.replace(/\/$/, "")];
}

/**
 * Where to send this particular customer back to after checkout or the portal.
 *
 * Prefers the origin the request actually came from, so a purchase started in local dev
 * returns to local dev and one started in production returns to production — without a
 * redeploy, and without the two configurations fighting.
 *
 * Only ever an origin from `WEB_ORIGINS`. Reflecting an arbitrary `Origin` header would let
 * anyone who can reach the endpoint choose where our checkout redirects to, which is an
 * open redirect handed out for free.
 */
export function returnOrigin(env: Bindings, req: { header(name: string): string | undefined }): string {
  const allowed = webOrigins(env);
  const candidate = (req.header("origin") ?? req.header("referer") ?? "").trim();
  if (candidate) {
    try {
      const origin = new URL(candidate).origin;
      if (allowed.includes(origin)) return origin;
    } catch {
      /* not a URL — fall through to the default */
    }
  }
  return allowed[0]!;
}

/** True when this API is reachable over HTTPS, which decides cookie flags. */
export function isSecureOrigin(env: Bindings): boolean {
  return env.APP_ORIGIN.startsWith("https://");
}

/**
 * Is the browser app on a different site from the API?
 *
 * Cookies only need `SameSite=None` when it is — and `None` requires `Secure`, which means
 * it cannot be used at all when the API is plain-http localhost. Getting this wrong in
 * either direction breaks sign-in: too strict and the cross-origin app never receives a
 * session, too loose and local http dev silently stops setting cookies.
 */
export function needsCrossSiteCookies(env: Bindings): boolean {
  if (!isSecureOrigin(env)) return false;
  const api = safeHost(env.APP_ORIGIN);
  return webOrigins(env).some((o) => safeHost(o) !== api);
}

function safeHost(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
}
