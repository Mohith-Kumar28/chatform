/**
 * Where a campaign's short link (`/r/<code>`) sends a visitor, as an absolute
 * address on the site the request came to.
 *
 * `target` is the path and query the API stored for the code. It is resolved
 * against this site and must stay on it: the stored value is validated when it
 * is written, and checked again here because an open redirect on the apex
 * domain is the kind of thing that is only ever found by somebody else.
 *
 * Whatever the visitor's own address carried rides along (an ad network's
 * `gclid`, a `ref`), without overriding the link's own tags.
 *
 * Kept apart from `edge.ts` so it can be tested without a Worker around it.
 */
export function linkDestination(target: string | null | undefined, request: URL): string {
  const home = new URL("/", request.origin);
  let to = home;
  if (target && target.startsWith("/") && !target.startsWith("//") && !target.includes("\\")) {
    try {
      const parsed = new URL(target, request.origin);
      if (parsed.origin === request.origin) to = parsed;
    } catch {
      to = home;
    }
  }
  for (const [key, value] of request.searchParams) {
    if (!to.searchParams.has(key)) to.searchParams.append(key, value);
  }
  return to.toString();
}
