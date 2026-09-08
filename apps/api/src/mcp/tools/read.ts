/**
 * The read half of the curated surface.
 *
 * Each tool is a named job rather than an endpoint wrapper, because that is what
 * an agent selects on. `list_responses` and `search_responses` hit the same route
 * with different intent, and separating them is what stops a model from having to
 * infer that `q` exists from a parameter list.
 *
 * Inputs are hand-written flat Zod objects, not the spec's schemas. OpenAPI spreads
 * parameters across path, query and body while MCP wants one object, and the
 * clients are stricter than the protocol: Cursor rejects `$ref` and `anyOf`, OpenAI's
 * agents reject `oneOf`, `allOf` and root-level unions. Flat and boring travels.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpCtx } from "../dispatch.js";
import { callApi, describeFailure } from "../dispatch.js";
import { clampLimit, jsonResult, errorResult, projectResponseRow, capAnswers } from "../shape.js";

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/** Every list tool takes the same two, and describing them once keeps them honest. */
const pageArgs = {
  limit: z.number().int().min(1).max(50).optional().describe("Rows per page. Defaults to 10."),
  cursor: z.string().optional().describe("The next_cursor from a previous call."),
};

export function registerReadTools(server: McpServer, ctx: () => McpCtx): void {
  server.registerTool(
    "list_forms",
    {
      title: "List forms",
      description:
        "List the forms in this organization, newest first. Returns id, title, slug and status. " +
        "Use get_form for one form's questions.",
      inputSchema: {
        status: z
          .enum(["draft", "published", "archived", "all"])
          .optional()
          .describe("Defaults to published."),
        ...pageArgs,
      },
      annotations: READ_ONLY,
    },
    async ({ status, limit, cursor }) => {
      const res = await callApi(ctx(), "GET", "/v1/forms", {
        query: { status, limit: clampLimit(limit), cursor },
      });
      if (res.status !== 200) return errorResult(describeFailure(res));
      return jsonResult(res.body);
    },
  );

  server.registerTool(
    "get_form",
    {
      title: "Get a form",
      description:
        "Read one form. The default 'document' view returns the editable question document — this is what " +
        "to read, modify and send back to update_form, and it works on drafts. The 'public' view returns " +
        "the published respondent-facing config instead, and only exists once a form has been published.",
      inputSchema: {
        form_id: z.string().describe("The form id, e.g. frm_abc123."),
        view: z
          .enum(["document", "public"])
          .optional()
          .describe("'document' (default) for the editable draft, 'public' for the published config."),
      },
      annotations: READ_ONLY,
    },
    async ({ form_id, view }) => {
      /**
       * Defaulted to `document`, where `/v1` defaults to `public`.
       *
       * Deliberate, and not a style choice: the public view 404s for any form that
       * has never been published, so an agent asked to look at a draft would be
       * told the form does not exist. `document` is also what it needs in order to
       * edit anything.
       */
      const res = await callApi(ctx(), "GET", `/v1/forms/${encodeURIComponent(form_id)}`, {
        query: { view: view ?? "document" },
      });
      if (res.status !== 200) {
        const hint =
          view === "public"
            ? " If the form has never been published there is no public config yet — read the 'document' view."
            : "";
        return errorResult(describeFailure(res) + hint);
      }
      return jsonResult(res.body);
    },
  );

  server.registerTool(
    "list_blocks",
    {
      title: "List question types",
      description:
        "The catalogue of every question ('block') type a form can contain: its config schema, what a " +
        "respondent's answer looks like, and the validation error codes it can produce. This is the " +
        "contract to write against before calling create_form or update_form.",
      inputSchema: {
        type: z
          .string()
          .optional()
          .describe("One block type, e.g. 'rating'. Omit for the whole catalogue."),
      },
      annotations: READ_ONLY,
    },
    async ({ type }) => {
      const path = type ? `/v1/blocks/${encodeURIComponent(type)}` : "/v1/blocks";
      const res = await callApi(ctx(), "GET", path);
      if (res.status !== 200) return errorResult(describeFailure(res));
      return jsonResult(res.body);
    },
  );

  server.registerTool(
    "get_form_analytics",
    {
      title: "Get form analytics",
      description:
        "Aggregate performance for one form: views, starts, completions, completion rate, drop-off per " +
        "question and answer distributions. Requires the analytics:read scope. On plans without advanced " +
        "analytics the reply carries a 'locked' list — those sections are withheld by the plan, not empty.",
      inputSchema: {
        form_id: z.string().describe("The form id."),
        include_test: z.boolean().optional().describe("Include test-mode traffic."),
      },
      annotations: READ_ONLY,
    },
    async ({ form_id, include_test }) => {
      const res = await callApi(ctx(), "GET", `/v1/forms/${encodeURIComponent(form_id)}/analytics`, {
        query: include_test ? { includeTest: 1 } : {},
      });
      if (res.status !== 200) return errorResult(describeFailure(res));
      const body = res.body as { locked?: string[]; requiredPlan?: string } | null;
      if (body?.locked?.length) {
        return jsonResult({
          ...body,
          note:
            `The ${body.locked.join(" and ")} sections are withheld by the current plan` +
            `${body.requiredPlan ? ` (needs ${body.requiredPlan})` : ""}, not absent from the data.`,
        });
      }
      return jsonResult(body);
    },
  );

  server.registerTool(
    "list_responses",
    {
      title: "List responses",
      description:
        "List a form's responses, newest first. Answers are omitted unless include_answers is set. " +
        "Statuses other than 'completed' need a plan that includes partial responses.",
      inputSchema: {
        form_id: z.string().describe("The form id."),
        status: z
          .string()
          .optional()
          .describe(
            "Comma-separated: completed, in_progress, abandoned, disqualified, or 'all'. Defaults to completed.",
          ),
        include_answers: z.boolean().optional().describe("Include each response's answers. Costs a lot of context."),
        created_after: z.number().int().optional().describe("Unix ms. Only responses started after this."),
        created_before: z.number().int().optional().describe("Unix ms."),
        ...pageArgs,
      },
      annotations: READ_ONLY,
    },
    async ({ form_id, status, include_answers, created_after, created_before, limit, cursor }) => {
      const res = await callApi(ctx(), "GET", `/v1/forms/${encodeURIComponent(form_id)}/responses`, {
        query: {
          status,
          created_after,
          created_before,
          limit: clampLimit(limit),
          cursor,
          ...(include_answers ? { include: "answers" } : {}),
        },
      });
      if (res.status !== 200) return errorResult(describeFailure(res));
      return jsonResult(shapeResponseList(res.body, include_answers === true));
    },
  );

  server.registerTool(
    "search_responses",
    {
      title: "Search responses by text",
      description:
        "Find responses containing a piece of text. IMPORTANT: this is a literal case-insensitive " +
        "substring match over the answers, not semantic or fuzzy search, and results are not ranked by " +
        "relevance. Searching 'unhappy' will not find 'dissatisfied'. For themes across answers, page " +
        "through list_responses with include_answers and read them.",
      inputSchema: {
        form_id: z.string().describe("The form id."),
        query: z.string().min(1).max(200).describe("Literal text to look for in the answers."),
        status: z.string().optional().describe("As in list_responses. Defaults to completed."),
        include_answers: z.boolean().optional().describe("Include the matching responses' answers."),
        ...pageArgs,
      },
      annotations: READ_ONLY,
    },
    async ({ form_id, query, status, include_answers, limit, cursor }) => {
      const res = await callApi(ctx(), "GET", `/v1/forms/${encodeURIComponent(form_id)}/responses`, {
        query: {
          q: query,
          status,
          limit: clampLimit(limit),
          cursor,
          ...(include_answers ? { include: "answers" } : {}),
        },
      });
      if (res.status !== 200) return errorResult(describeFailure(res));
      return jsonResult({
        ...(shapeResponseList(res.body, include_answers === true) as Record<string, unknown>),
        search: { query, kind: "literal substring, unranked" },
      });
    },
  );

  server.registerTool(
    "get_response",
    {
      title: "Get one response",
      description: "Get a single response with all of its answers.",
      inputSchema: { response_id: z.string().describe("The response id, e.g. sbm_abc123.") },
      annotations: READ_ONLY,
    },
    async ({ response_id }) => {
      const res = await callApi(ctx(), "GET", `/v1/responses/${encodeURIComponent(response_id)}`, {
        query: { include: "answers" },
      });
      if (res.status !== 200) return errorResult(describeFailure(res));
      const row = res.body as Record<string, unknown> | null;
      if (row && "answers" in row) return jsonResult({ ...row, answers: capAnswers(row.answers) });
      return jsonResult(row);
    },
  );

  server.registerTool(
    "list_webhooks",
    {
      title: "List webhooks",
      description: "List the webhook endpoints registered for this organization, with the events each subscribes to.",
      inputSchema: { form_id: z.string().optional().describe("Only webhooks scoped to this form.") },
      annotations: READ_ONLY,
    },
    async ({ form_id }) => {
      const res = await callApi(ctx(), "GET", "/v1/webhooks", { query: { form_id } });
      if (res.status !== 200) return errorResult(describeFailure(res));
      return jsonResult(res.body);
    },
  );
}

/** Field-filter a page of responses, keeping the envelope the API returned. */
function shapeResponseList(body: unknown, includeAnswers: boolean): unknown {
  if (body === null || typeof body !== "object") return body;
  const page = body as { data?: unknown[] };
  if (!Array.isArray(page.data)) return body;
  return { ...page, data: page.data.map((row) => projectResponseRow(row, includeAnswers)) };
}
