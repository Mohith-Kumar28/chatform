/**
 * How the worker recognises a request it made to itself.
 *
 * The MCP tools reach the API by re-entering this app rather than by reaching past
 * the `/v1` handlers to the queries underneath — that is what keeps one
 * implementation of validation, tenancy and scope checks instead of two. The cost
 * is that a per-request middleware sees the same call twice, and for the rate
 * limiter that would mean charging a customer two windows for one tool call.
 *
 * The marker lives here, in neither the limiter nor the MCP layer, so that `lib/`
 * does not have to depend on `mcp/` to know about it.
 *
 * It is a UUID minted per isolate and never written to a response, so it cannot be
 * replayed from outside to skip a limit. It is not a capability: it suppresses
 * counting only. Authentication, scopes and entitlements are unaffected and still
 * run on the inner request.
 */
export const INTERNAL_MARKER_HEADER = "x-chatform-internal";

/**
 * Minted on first use, never at module load.
 *
 * `crypto.randomUUID()` in global scope is a *disallowed operation* on Workers —
 * generating random values, timers and I/O are all refused before any handler runs,
 * and the runtime declines to start the worker at all. The test pool is more
 * permissive than the real runtime here, so the whole suite passed while
 * `wrangler dev` would not boot. Lazily is the only way to hold this value.
 */
let marker: string | null = null;

export function internalMarker(): string {
  marker ??= crypto.randomUUID();
  return marker;
}

export function isInternalCall(c: { req: { header(name: string): string | undefined } }): boolean {
  const presented = c.req.header(INTERNAL_MARKER_HEADER);
  // Compared only when the header is present, so an ordinary request never causes
  // the marker to be minted.
  return presented !== undefined && presented === internalMarker();
}
