/**
 * Four tools that reach the whole developer API.
 *
 * The curated tools cover the common jobs; these cover everything else without
 * putting forty-three more schemas in front of the model on every request. Stripe
 * ships the same shape (`api_search`/`api_details`/`api_read`/`api_write`) for ~150
 * endpoints, and Stainless arrived at the same trio independently, which is a good
 * sign it is the pattern rather than a trick.
 *
 * Two invariants live here and nowhere else:
 *
 *  - **Only what the spec publishes.** The path must resolve against the indexed
 *    document, which since the docs cleanup contains only the developer surface.
 *    `/api/*` and `/p/*` are absent from it, so no amount of asking reaches the
 *    dashboard's session-authenticated routes or the respondent channel.
 *  - **No deletes, ever.** Not because the API forbids it — a key with `form:write`
 *    may delete a form over HTTP — but because an agent reading attacker-supplied
 *    free text should not be one confused tool call away from destroying a form or
 *    a response. Tally draws the same line for the same reason.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpCtx } from "../dispatch.js";
import { callApi, describeFailure } from "../dispatch.js";
import { jsonResult, errorResult } from "../shape.js";
import { loadSpecIndex, searchOperations, resolvePath } from "../spec-index.js";

const WRITE_METHODS = ["POST", "PUT", "PATCH"] as const;

export function registerPassthroughTools(server: McpServer, ctx: () => McpCtx): void {
  server.registerTool(
    "chatform_api_search",
    {
      title: "Find an API endpoint",
      description:
        "Search the Chatform API by keyword when no dedicated tool covers what you need. Returns method, " +
        "path, summary and the API key scope each endpoint requires. Follow with chatform_api_details for " +
        "its parameters, then chatform_api_read or chatform_api_write to call it.",
      inputSchema: {
        query: z.string().min(1).describe("Keywords, e.g. 'export responses' or 'rotate session token'."),
        limit: z.number().int().min(1).max(30).optional().describe("Defaults to 12."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, limit }) => {
      const index = await loadSpecIndex(ctx());
      const hits = searchOperations(index, query, limit ?? 12);
      return jsonResult({
        query,
        matches: hits.map((op) => ({
          method: op.method.toUpperCase(),
          path: op.path,
          summary: op.summary,
          required_scope: op.scope ?? null,
          accepts_publishable_key: op.publishable,
        })),
        total_endpoints: index.operations.length,
      });
    },
  );

  server.registerTool(
    "chatform_api_details",
    {
      title: "Get an endpoint's schema",
      description:
        "The full parameter, request body and response schema for one endpoint, as found by " +
        "chatform_api_search. Read this before calling chatform_api_write.",
      inputSchema: {
        method: z.string().describe("GET, POST, PUT, PATCH or DELETE."),
        path: z.string().describe("The templated path exactly as api_search returned it, e.g. /v1/forms/{id}."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ method, path }) => {
      const index = await loadSpecIndex(ctx());
      const op = index.byKey.get(`${method.toLowerCase()} ${path}`) ?? resolvePath(index, method, path);
      if (!op) {
        return errorResult(
          `No endpoint ${method.toUpperCase()} ${path} exists in the Chatform API. Use chatform_api_search to find one.`,
        );
      }
      return jsonResult({
        method: op.method.toUpperCase(),
        path: op.path,
        summary: op.summary,
        description: op.description ?? null,
        required_scope: op.scope ?? null,
        accepts_publishable_key: op.publishable,
        parameters: op.parameters ?? null,
        request_body: op.requestBody ?? null,
        responses: op.responses ?? null,
      });
    },
  );

  server.registerTool(
    "chatform_api_read",
    {
      title: "Call any read endpoint",
      description:
        "Perform a GET against any documented Chatform endpoint. Use a dedicated tool when one exists; " +
        "this is for the rest. Pass the concrete path with ids filled in.",
      inputSchema: {
        path: z.string().describe("Concrete path with ids substituted, e.g. /v1/forms/frm_abc/responses."),
        query: z
          .record(z.string(), z.string())
          .optional()
          .describe("Query parameters as string values, e.g. { limit: '10' }."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ path, query }) => {
      const guard = await checkPath(ctx(), "GET", path);
      if ("error" in guard) return errorResult(guard.error);
      const res = await callApi(ctx(), "GET", guard.path, { query });
      if (res.status >= 400) return errorResult(describeFailure(res));
      return jsonResult(res.body);
    },
  );

  server.registerTool(
    "chatform_api_write",
    {
      title: "Call any write endpoint",
      description:
        "Perform a POST, PUT or PATCH against any documented Chatform endpoint. Read chatform_api_details " +
        "first so the body matches. DELETE is not available through MCP: nothing here can delete a form, a " +
        "response or an answer.",
      inputSchema: {
        method: z.enum(WRITE_METHODS).describe("POST, PUT or PATCH."),
        path: z.string().describe("Concrete path with ids substituted, e.g. /v1/forms/frm_abc/publish."),
        body: z.record(z.string(), z.unknown()).optional().describe("The JSON request body."),
        query: z.record(z.string(), z.string()).optional().describe("Query parameters, if the endpoint takes any."),
        idempotency_key: z
          .string()
          .optional()
          .describe("Optional. Repeating a write with the same key returns the first result instead of acting twice."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ method, path, body, query, idempotency_key }) => {
      const guard = await checkPath(ctx(), method, path);
      if ("error" in guard) return errorResult(guard.error);
      const res = await callApi(ctx(), method, guard.path, {
        query,
        body: body ?? {},
        idempotencyKey: idempotency_key,
      });
      if (res.status >= 400) return errorResult(describeFailure(res));
      return jsonResult(res.body);
    },
  );
}

/**
 * Is this a path we are willing to dispatch, by this method?
 *
 * Rejecting an unknown path with the *reason* matters: an agent told "that is not
 * in the API" will search rather than retry the same guess with a different body.
 */
async function checkPath(
  c: McpCtx,
  method: string,
  path: string,
): Promise<{ path: string } | { error: string }> {
  const upper = method.toUpperCase();
  if (upper === "DELETE") {
    return {
      error:
        "DELETE is not available through the Chatform MCP server. Deleting forms, responses and answers is " +
        "deliberately unavailable to agents; do it from the dashboard or the HTTP API directly.",
    };
  }

  const normalised = path.startsWith("/") ? path.split("?")[0]! : `/${path.split("?")[0]}`;
  const index = await loadSpecIndex(c);
  const op = resolvePath(index, upper, normalised);
  if (!op) {
    return {
      error:
        `${upper} ${normalised} is not a documented Chatform endpoint. Use chatform_api_search to find the ` +
        `right one. Note that the dashboard's own /api/* routes and the respondent /p/* routes are not part ` +
        `of the developer API and cannot be called with an API key.`,
    };
  }
  return { path: normalised };
}
