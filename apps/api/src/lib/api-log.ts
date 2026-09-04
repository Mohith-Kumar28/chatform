import type { MiddlewareHandler } from "hono";
import type { Bindings } from "../env.js";
import type { GuardVars } from "./guards.js";

/**
 * One Analytics Engine data point per developer-API request.
 *
 * Nothing wrote per-request telemetry before, so questions an integrator asks
 * during an incident — "are my calls arriving", "which endpoint is 4xx-ing",
 * "am I being throttled" — had no answer but Workers logs. This is what the
 * dashboard's API activity view reads.
 *
 * Registered outermost, so unauthenticated and rate-limited requests are
 * captured too. Those are the interesting ones.
 */
export const apiRequestLog: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Partial<GuardVars & { requestId: string }>;
}> = async (c, next) => {
  const started = Date.now();
  await next();

  const write = () => {
    try {
      const orgId = c.get("orgId") ?? "";
      c.env.ANALYTICS_API?.writeDataPoint({
        // One index, and it must be the tenant: it is the only axis every
        // question is grouped by, and Analytics Engine allows exactly one.
        indexes: [orgId || "anon"],
        blobs: [
          orgId,
          c.get("keyId") ?? "",
          c.get("keyType") ?? "",
          c.get("environment") ?? "live",
          c.req.method,
          // The route template, never the URL: a path with ids in it would
          // give this dataset unbounded cardinality within a day.
          c.req.routePath,
          String(c.res.status),
          c.res.status >= 400 ? errorCodeOf(c.res) : "",
          c.get("requestId") ?? "",
          (c.req.header("origin") ?? "").slice(0, 128),
        ],
        doubles: [Date.now() - started, 1],
      });
    } catch (err) {
      // Telemetry must never be the reason a request fails.
      console.error("api_log_failed", err);
    }
  };

  /**
   * `c.executionCtx` is a getter that throws when there is no execution context
   * — a queue consumer, a scheduled handler, some test paths — so it is reached
   * defensively, the same way `deny()` does it.
   */
  try {
    c.executionCtx.waitUntil(Promise.resolve().then(write));
  } catch {
    write();
  }
};

/**
 * The error code, read from the response we are about to return.
 *
 * Set by the handlers as a header rather than parsed out of the body: reading
 * the body here would mean cloning and awaiting every error response just to
 * label it.
 */
function errorCodeOf(res: Response): string {
  return res.headers.get("x-error-code") ?? "";
}
