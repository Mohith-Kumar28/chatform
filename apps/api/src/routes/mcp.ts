/**
 * `POST /mcp` — the Model Context Protocol surface.
 *
 * Same worker, same keys, same guards as `/v1`. That is the whole design: an MCP
 * server deployed separately would have had to re-implement key verification,
 * burst limiting, the paid-feature gate and the usage meter, and the first one to
 * drift would have been the one nobody noticed.
 *
 * What this layer does NOT do is run the feature gate or the meter. Each tool
 * dispatches into `/v1`, which runs the whole chain itself — so one tool call is
 * one metered `api_requests`, not two. See `mcp/dispatch.ts`.
 *
 * A note on what is missing: no OAuth. Bearer keys work today in Claude Code,
 * Cursor, VS Code and Codex, which is where developers are; claude.ai's connector
 * dialog wants OAuth 2.1 and is a later phase.
 */
import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import type { Bindings } from "../env.js";
import type { GuardVars } from "../lib/guards.js";
import { requireApiKey } from "../lib/guards.js";
import { apiRequestLog } from "../lib/api-log.js";
import { burstLimit } from "../lib/ratelimit.js";
import { buildMcpServer } from "../mcp/server.js";
import type { McpCtx } from "../mcp/dispatch.js";

export const mcpRouter = new Hono<{ Bindings: Bindings; Variables: Partial<GuardVars> }>();

mcpRouter.use("*", apiRequestLog);

/**
 * Rate limited here as well as on the dispatched request, because `initialize`,
 * `tools/list` and the two spec tools never reach `/v1` and would otherwise be
 * unmetered and unlimited. The inner call is suppressed by the marker in
 * `lib/internal-call.ts`, so a tool call still costs exactly one window.
 */
mcpRouter.use("*", burstLimit);

/**
 * Authenticate the connection, not just the tool call.
 *
 * An MCP client expects a 401 when it connects with no credential — that is what
 * makes it prompt for one rather than show an empty tool list.
 */
mcpRouter.use("*", requireApiKey);

/**
 * Publishable keys are refused outright.
 *
 * `/mcp` is a server-side surface. A `pk_` is built to sit in a web page, and its
 * scope ceiling (`form:read`, `session:*`, `file:write`) excludes `response:read`
 * and `analytics:read` — so almost every tool here would fail for it anyway. A
 * clear refusal beats eleven confusing `insufficient_scope` errors.
 */
mcpRouter.use("*", async (c, next) => {
  if ((c.get("keyType") ?? "").startsWith("pk_")) {
    return c.json(
      {
        error: {
          code: "secret_key_required",
          message:
            "The MCP server needs a secret key (sk_…). Publishable keys are restricted to the browser " +
            "surface and cannot read responses or analytics.",
        },
      },
      403,
    );
  }
  await next();
});

mcpRouter.all("/", async (c) => {
  const transport = new StreamableHTTPTransport();
  const server = buildMcpServer(() => c as unknown as McpCtx);
  await server.connect(transport);
  /**
   * `handleRequest` may return undefined for a request it answered by streaming.
   * Falling through to Hono's `notFound` there would emit chatform's REST error
   * envelope into an MCP session, so answer with an empty 202 instead — which is
   * what the spec expects for an accepted notification.
   */
  return (await transport.handleRequest(c)) ?? c.body(null, 202);
});
