/**
 * How an MCP tool reaches the API: by calling this worker's own `/v1` routes.
 *
 * The alternative was to call the query builders directly, and it is the wrong
 * trade. Every `/v1` handler carries validation, tenancy scoping, the scope
 * guard, entitlement gates and the response projection — a tool that reached
 * past all of that to the SQL would be a second implementation of the API with
 * its own bugs, and the first one to drift would be the one nobody was testing.
 *
 * So `/mcp` deliberately does NOT run the feature gate or the meter itself. The
 * inner request runs the whole `/v1` chain exactly once, which is what keeps
 * `api_requests` honest: one tool call, one metered request. The cost is one
 * extra key verification per call — `/mcp` verifies to answer 401 at connect
 * time, and `/v1` verifies again on dispatch. That is a known, accepted cost;
 * the alternative was double-counting every customer's usage.
 */
import type { Context } from "hono";
import type { Hono } from "hono";
import type { Bindings } from "../env.js";
import type { GuardVars } from "../lib/guards.js";
import { readPresentedKey } from "../lib/apikeys.js";
import { internalMarker, INTERNAL_MARKER_HEADER } from "../lib/internal-call.js";

export type McpCtx = Context<{ Bindings: Bindings; Variables: Partial<GuardVars> }>;

/** The app, handed in at mount time so a tool can re-enter it. */
let self: Hono<never> | null = null;

export function setDispatchTarget(app: Hono<never>): void {
  self = app;
}


/**
 * `c.executionCtx` is a getter that *throws* when there is no execution context —
 * which is the case under the test runner, and for a request the runtime handed us
 * without one. `apiRequestLog` and `deny()` already guard it the same way; reading
 * it unguarded made every tool fail with "This context has no ExecutionContext".
 */
function executionCtxOf(c: McpCtx) {
  try {
    return c.executionCtx;
  } catch {
    return undefined;
  }
}

export interface ApiResult {
  status: number;
  /** Parsed JSON when the response had a body we could read, else null. */
  body: unknown;
}

export interface CallOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Forwarded so a repeated write is de-duplicated by the API's own store. */
  idempotencyKey?: string;
}

/**
 * Call one `/v1` route as the key that presented itself to `/mcp`.
 *
 * The inner request is built from scratch rather than cloned, and that matters:
 * `requireApiKey` refuses a secret key on any request carrying `Origin`
 * (`guards.ts`, `secret_key_in_browser`). A clone of an MCP client's request
 * could carry one and would be rejected for a reason that has nothing to do with
 * the caller. Only the headers listed here cross the boundary.
 */
export async function callApi(
  c: McpCtx,
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  opts: CallOptions = {},
): Promise<ApiResult> {
  if (!self) throw new Error("MCP dispatch target was never set");

  const url = new URL(c.req.url);
  url.pathname = path;
  url.search = "";
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const presented = readPresentedKey(c);
  const headers = new Headers();
  if (presented) headers.set("authorization", `Bearer ${presented}`);
  const requestId = c.get("requestId" as never) as string | undefined;
  if (requestId) headers.set("x-request-id", requestId);
  if (opts.idempotencyKey) headers.set("idempotency-key", opts.idempotencyKey);
  headers.set(INTERNAL_MARKER_HEADER, internalMarker());

  const init: RequestInit = { method, headers };
  if (opts.body !== undefined && method !== "GET") {
    headers.set("content-type", "application/json");
    init.body = JSON.stringify(opts.body);
  }

  const res = await self.fetch(new Request(url, init), c.env, executionCtxOf(c));

  let body: unknown = null;
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("json")) {
    body = await res.json().catch(() => null);
  } else {
    const text = await res.text().catch(() => "");
    body = text === "" ? null : text;
  }
  return { status: res.status, body };
}

/**
 * The message an agent should see when the API refused.
 *
 * Chatform's error envelope is already written for a reader — `insufficient_scope`
 * names the scope it wanted, and a 402 carries the plan and the limit — so the
 * useful thing is to pass that through rather than flatten it to "request
 * failed". An agent that is told which scope is missing can tell the user which
 * box to tick.
 */
export function describeFailure(result: ApiResult): string {
  const err = (result.body as { error?: Record<string, unknown> } | null)?.error;
  if (!err) return `The API returned ${result.status}.`;
  const parts = [`${err.code ?? "error"} (HTTP ${result.status}): ${err.message ?? "no message"}`];
  if (err.required) parts.push(`Required scope: ${String(err.required)}.`);
  if (err.limitKey) parts.push(`Limit: ${String(err.limitKey)}.`);
  if (err.plan) parts.push(`Current plan: ${String(err.plan)}.`);
  if (err.upgradeUrl) parts.push(`Upgrade: ${String(err.upgradeUrl)}`);
  if (err.doc_url) parts.push(`Docs: ${String(err.doc_url)}`);
  return parts.join(" ");
}
