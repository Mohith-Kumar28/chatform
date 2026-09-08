/**
 * The MCP server, built per request.
 *
 * Per request rather than once per isolate, and that is not an oversight: a tool
 * handler needs the Hono context of the call it is serving — the presented key,
 * the request id — and an isolate is shared by every organization that happens to
 * hit the same worker instance. A server built once with a captured context would
 * serve one tenant's calls with another tenant's key. Constructing it is cheap;
 * being wrong about this would not be.
 *
 * The transport is stateless Streamable HTTP, so there is no session to keep and
 * nothing to reuse between calls anyway.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpCtx } from "./dispatch.js";
import { registerReadTools } from "./tools/read.js";
import { registerWriteTools } from "./tools/write.js";
import { registerPassthroughTools } from "./tools/passthrough.js";

export const MCP_SERVER_NAME = "chatform";

/**
 * Tools an MCP client may not exceed without being cut off, so we count our own.
 *
 * Cursor enforces a hard 40-tool ceiling and agents hold roughly 45 slots across
 * every server they have connected — Sentry caps itself at 25 for exactly this
 * reason. Chatform is one server among several a user will have, so the budget it
 * is entitled to is small. The test asserts this number.
 */
export const TOOL_BUDGET = 40;

export function buildMcpServer(ctx: () => McpCtx): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, version: "1.0.0" },
    {
      instructions: [
        "Chatform forms are conversations: a respondent is asked one question at a time and the next",
        "question depends on what they said.",
        "",
        "To build or edit a form, call list_blocks first — it publishes the schema for every question type,",
        "which is what a form document must conform to. Then create_form or update_form.",
        "",
        "Prefer a named tool when one fits. chatform_api_search reaches the rest of the API.",
        "",
        "Nothing here can delete a form, a response or an answer.",
      ].join("\n"),
    },
  );

  registerReadTools(server, ctx);
  registerWriteTools(server, ctx);
  registerPassthroughTools(server, ctx);

  return server;
}
