import type { MiddlewareHandler } from "hono";
import type { Bindings } from "../env.js";

/**
 * One id per request, echoed to the caller and carried into every log line.
 *
 * A support conversation about a public API starts with "what happened to this
 * request", and until now there was no string to start it with — `app.onError`
 * logged an error with nothing to correlate it to.
 *
 * An inbound id is honoured so a customer's own trace id survives the hop, but
 * only if it looks like an id: an arbitrary header value ends up in log lines
 * and in Analytics Engine blobs, which makes it both a log-injection vector and
 * an unbounded-cardinality problem.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const REQUEST_ID_HEADER = "x-request-id";

export function newRequestId(): string {
  return `req_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export interface RequestIdVars {
  requestId: string;
}

export const requestId: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Partial<RequestIdVars>;
}> = async (c, next) => {
  const inbound = c.req.header(REQUEST_ID_HEADER);
  const id = inbound && SAFE_ID.test(inbound) ? inbound : newRequestId();
  c.set("requestId", id);
  c.header(REQUEST_ID_HEADER, id);
  await next();
  // `c.header()` before `next()` is dropped by handlers that construct their own
  // Response (SSE, file downloads, the Better Auth handler), so set it again on
  // the way out. Header set twice with the same value is a no-op.
  c.res.headers.set(REQUEST_ID_HEADER, id);
};
