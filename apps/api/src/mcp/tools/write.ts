/**
 * The write half of the curated surface.
 *
 * Six tools, no deletes. The absence is the design: an agent reading respondent
 * free text is reading attacker-supplied input, and the blast radius of a confused
 * tool call should not include destroying a form or a month of responses. Tally
 * draws the line in the same place.
 *
 * Nothing here generates a form with a model. The client already *is* one: it reads
 * the question-type contract from `list_blocks`, writes the document itself, and
 * sends it to `create_form`. So "build me an onboarding form" costs chatform no
 * model spend at all — the caller's own subscription pays for the authoring. That
 * is strictly better than exposing the dashboard's `/api/ai/*` routes, which are
 * session-only and metered against the form owner.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpCtx } from "../dispatch.js";
import { callApi, describeFailure } from "../dispatch.js";
import { jsonResult, errorResult } from "../shape.js";

/**
 * A form document, taken as JSON rather than as a typed schema.
 *
 * `FormDoc` is a discriminated union over 26 block types. Inlined as a tool input
 * schema it would be enormous — and unusable: Cursor rejects `anyOf` and `$ref`
 * outright, and OpenAI's agents reject `oneOf` and root-level unions. So the shape
 * is *discoverable* (`list_blocks`) rather than declared, and the API's own
 * validator remains the single authority on whether a document is valid.
 */
const docArg = z
  .unknown()
  .describe("The complete form document, as JSON. Get its shape from list_blocks and get_form.");

export function registerWriteTools(server: McpServer, ctx: () => McpCtx): void {
  server.registerTool(
    "create_form",
    {
      title: "Create a form",
      description:
        "Create a new form. Pass a title alone for an empty draft, or a complete document to create it " +
        "fully formed. Read list_blocks first so the document matches what chatform accepts. New forms " +
        "start as drafts — call publish_form to make one live.",
      inputSchema: {
        title: z.string().min(1).max(200).describe("The form's title."),
        doc: docArg.optional(),
        idempotency_key: z
          .string()
          .optional()
          .describe("Optional. Retrying with the same key returns the first result instead of creating twice."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ title, doc, idempotency_key }) => {
      const res = await callApi(ctx(), "POST", "/v1/forms", {
        body: doc === undefined ? { title } : { title, doc },
        idempotencyKey: idempotency_key,
      });
      if (res.status >= 400) return errorResult(describeFailure(res));
      return jsonResult(res.body);
    },
  );

  server.registerTool(
    "update_form",
    {
      title: "Replace a form's questions",
      description:
        "Replace a form's working document. This overwrites the whole draft, so read it with get_form " +
        "first, change what you need, and send the complete document back — a partial document silently " +
        "removes every question missing from it. Returns lint issues without refusing the save; publishing " +
        "is where issues become errors. Changes are not live until publish_form.",
      inputSchema: {
        form_id: z.string().describe("The form id."),
        doc: docArg,
      },
      /**
       * `destructiveHint: true`, and not reluctantly — this discards the previous
       * draft, which is exactly what the hint is for. Hosts use it to decide
       * whether to ask the user first, and they should ask about this one.
       */
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ form_id, doc }) => {
      const res = await callApi(ctx(), "PUT", `/v1/forms/${encodeURIComponent(form_id)}/doc`, { body: { doc } });
      if (res.status >= 400) return errorResult(describeFailure(res));
      return jsonResult(res.body);
    },
  );

  server.registerTool(
    "publish_form",
    {
      title: "Publish a form",
      description:
        "Publish the working document as a new immutable version, making it live for respondents. Fails " +
        "if the document has errors, or with a plan-limit refusal. Publishing adds a version; it never " +
        "removes one.",
      inputSchema: {
        form_id: z.string().describe("The form id."),
        idempotency_key: z.string().optional().describe("Optional. Guards against publishing twice on a retry."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ form_id, idempotency_key }) => {
      const res = await callApi(ctx(), "POST", `/v1/forms/${encodeURIComponent(form_id)}/publish`, {
        idempotencyKey: idempotency_key,
      });
      if (res.status >= 400) return errorResult(describeFailure(res));
      return jsonResult(res.body);
    },
  );

  server.registerTool(
    "submit_response",
    {
      title: "Submit a response",
      description:
        "Record a response programmatically — for importing existing data, or for answering on someone's " +
        "behalf. The form must be published. In the default 'flow' mode answers the conversation would not " +
        "have reached yet are refused, so the funnel stays meaningful; use 'free' for bulk import where the " +
        "flow was walked elsewhere.",
      inputSchema: {
        form_id: z.string().describe("The form id. The form must be published."),
        answers: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Answers keyed by question ref, e.g. { \"q_email\": \"maya@northwind.co\" }."),
        complete: z.boolean().optional().describe("Finish the response in the same call. Defaults to false."),
        mode: z
          .enum(["flow", "free"])
          .optional()
          .describe("'flow' (default) enforces reachability; 'free' accepts any answer, for imports."),
        hidden_fields: z.record(z.string(), z.string()).optional().describe("Hidden field values."),
        idempotency_key: z.string().optional().describe("Optional. Guards against a double submit on retry."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ form_id, answers, complete, mode, hidden_fields, idempotency_key }) => {
      const res = await callApi(ctx(), "POST", `/v1/forms/${encodeURIComponent(form_id)}/responses`, {
        body: {
          ...(answers ? { answers } : {}),
          ...(hidden_fields ? { hiddenFields: hidden_fields } : {}),
          ...(complete === undefined ? {} : { complete }),
          ...(mode ? { mode } : {}),
        },
        idempotencyKey: idempotency_key,
      });
      if (res.status >= 400) {
        const hint =
          res.status === 404
            ? " A form must be published before responses can be submitted to it — call publish_form."
            : "";
        return errorResult(describeFailure(res) + hint);
      }
      return jsonResult(res.body);
    },
  );

  server.registerTool(
    "export_responses",
    {
      title: "Export responses",
      description:
        "Start an export of a form's responses as CSV or JSON. Returns immediately with a queued export — " +
        "poll it with check_export until the status is 'ready', then use the download_url. Exports expire " +
        "after about a day. The API writes csv and json; the typed .xlsx workbook is dashboard-only.",
      inputSchema: {
        form_id: z.string().describe("The form id."),
        format: z.enum(["csv", "json"]).optional().describe("Defaults to csv."),
        status: z
          .array(z.string())
          .max(6)
          .optional()
          .describe("Response statuses to include. Anything but completed needs a plan with partial responses."),
        idempotency_key: z.string().optional().describe("Optional. Guards against queueing the same export twice."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ form_id, format, status, idempotency_key }) => {
      const res = await callApi(ctx(), "POST", `/v1/forms/${encodeURIComponent(form_id)}/exports`, {
        body: { ...(format ? { format } : {}), ...(status ? { status } : {}) },
        idempotencyKey: idempotency_key,
      });
      if (res.status >= 400) return errorResult(describeFailure(res));
      return jsonResult({
        ...(res.body as Record<string, unknown>),
        next_step: "Poll check_export with this id until status is 'ready', then follow download_url.",
      });
    },
  );

  server.registerTool(
    "check_export",
    {
      title: "Check an export",
      description:
        "Check a queued export and get its download link once ready, or list recent exports. The link is " +
        "short-lived and re-minted on each read, so read this again rather than reusing an old link.",
      inputSchema: {
        export_id: z.string().optional().describe("The export id. Omit to list recent exports."),
        form_id: z.string().optional().describe("When listing, only exports of this form."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ export_id, form_id }) => {
      const res = export_id
        ? await callApi(ctx(), "GET", `/v1/exports/${encodeURIComponent(export_id)}`)
        : await callApi(ctx(), "GET", "/v1/exports", { query: { form_id } });
      if (res.status >= 400) return errorResult(describeFailure(res));
      return jsonResult(res.body);
    },
  );

  server.registerTool(
    "use_template",
    {
      title: "Start a form from a template",
      description:
        "Create a draft form from one of the official templates. Faster and more reliable than authoring the " +
        "same form from scratch — read list_templates first, and get_template to see the questions before " +
        "committing. The result is a draft; publish_form makes it live.",
      inputSchema: {
        slug: z.string().describe("The template slug, from list_templates."),
        workspace: z.string().optional().describe("Workspace slug or id. Omit for the organization's first."),
        idempotency_key: z.string().optional().describe("Optional. Guards against creating two on a retry."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ slug, workspace, idempotency_key }) => {
      const res = await callApi(ctx(), "POST", `/v1/templates/${encodeURIComponent(slug)}/use`, {
        query: { workspace },
        idempotencyKey: idempotency_key,
      });
      if (res.status >= 400) return errorResult(describeFailure(res));
      return jsonResult(res.body);
    },
  );

  /**
   * The undo. Restoring writes the draft, not the live form — which is why this is
   * not marked destructive: nothing a respondent can see changes until someone
   * publishes, so the act is recoverable right up to that point.
   */
  server.registerTool(
    "restore_form_version",
    {
      title: "Roll a form back to a published version",
      description:
        "Copy a published version back into the working document. This does NOT change what respondents see — " +
        "it replaces the draft, and you must call publish_form to make it live. Read list_form_versions first: " +
        "the response count on each version is what tells you whether a rollback matters.",
      inputSchema: {
        form_id: z.string().describe("The form id."),
        version: z.number().int().min(1).describe("The version number, from list_form_versions."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ form_id, version }) => {
      const res = await callApi(
        ctx(),
        "POST",
        `/v1/forms/${encodeURIComponent(form_id)}/versions/${version}/restore`,
      );
      if (res.status >= 400) return errorResult(describeFailure(res));
      return jsonResult({
        ...(res.body as Record<string, unknown>),
        note: "The draft now matches that version. Respondents still see the previously published one until publish_form.",
      });
    },
  );

  server.registerTool(
    "create_spreadsheet_feed",
    {
      title: "Create a live spreadsheet feed",
      description:
        "Create or update a CSV URL that Google Sheets or Excel can re-read on a schedule, so a sheet stays " +
        "current instead of being re-exported by hand. The URL is unauthenticated — it is the whole credential — " +
        "so treat it as a secret. Send rotate to invalidate the previous one.",
      inputSchema: {
        form_id: z.string().describe("The form id."),
        include_partials: z
          .boolean()
          .optional()
          .describe("Include unfinished responses. Needs a plan that allows exporting partials."),
        rotate: z.boolean().optional().describe("Mint a new URL and invalidate the old one."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ form_id, include_partials, rotate }) => {
      const res = await callApi(ctx(), "PUT", `/v1/forms/${encodeURIComponent(form_id)}/integrations/spreadsheet`, {
        body: {
          ...(include_partials === undefined ? {} : { includePartials: include_partials }),
          ...(rotate === undefined ? {} : { rotate }),
        },
      });
      if (res.status >= 400) return errorResult(describeFailure(res));
      return jsonResult(res.body);
    },
  );

  /**
   * Deliberately last, and deliberately blunt in its description.
   *
   * An MCP client is already a model: it can read `list_blocks` and write a document
   * itself for nothing. This tool bills the *form owner* for a second model call, so
   * the description says so plainly rather than leaving an agent to pick the
   * expensive path because the name sounded more capable. It also needs the
   * `ai:generate` scope, which the agent key preset does not include.
   */
  server.registerTool(
    "generate_form_with_ai",
    {
      title: "Generate a form with Chatform's own model",
      description:
        "Ask Chatform's form-designer model to draft a document from a prompt. COSTS MONEY: this spends the " +
        "organization's monthly AI generation allowance and needs the ai:generate scope, which most keys do not " +
        "have. If you can write the document yourself — read list_blocks and call create_form — do that instead; " +
        "it is free. Use this when the caller explicitly asks for Chatform's own generator, or when a form needs " +
        "the flow-branching the designer model is tuned for. Returns a document without saving it.",
      inputSchema: {
        prompt: z.string().min(5).max(2000).describe("What the form is for, in plain language."),
        question_count: z
          .number()
          .int()
          .min(2)
          .max(19)
          .optional()
          .describe("Force a length. Omit to let the model size the form against the request."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async ({ prompt, question_count }) => {
      const res = await callApi(ctx(), "POST", "/v1/ai/generate-form", {
        body: { prompt, ...(question_count === undefined ? {} : { questionCount: question_count }) },
      });
      if (res.status >= 400) {
        const hint =
          res.status === 403
            ? " This key lacks ai:generate. You can author the document yourself with list_blocks and create_form at no cost."
            : "";
        return errorResult(describeFailure(res) + hint);
      }
      return jsonResult({
        ...(res.body as Record<string, unknown>),
        next_step: "Nothing was saved. Pass this doc to create_form, or to update_form for an existing form.",
      });
    },
  );

  /**
   * The natural next move after `list_webhook_deliveries` shows a failure.
   *
   * Not destructive — it re-sends an event that already happened, so the worst case
   * is a duplicate the receiver should already be deduplicating on delivery id.
   */
  server.registerTool(
    "replay_webhook_delivery",
    {
      title: "Replay a failed delivery",
      description:
        "Re-send one webhook delivery that failed. Find the delivery id with list_webhook_deliveries. The " +
        "receiver sees a fresh attempt of the same event, so it should deduplicate on the delivery id.",
      inputSchema: {
        webhook_id: z.string().describe("The webhook id."),
        delivery_id: z.string().describe("The delivery id from list_webhook_deliveries."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ webhook_id, delivery_id }) => {
      const res = await callApi(
        ctx(),
        "POST",
        `/v1/webhooks/${encodeURIComponent(webhook_id)}/deliveries/${encodeURIComponent(delivery_id)}/replay`,
      );
      if (res.status >= 400) return errorResult(describeFailure(res));
      return jsonResult(res.body);
    },
  );

  server.registerTool(
    "create_webhook",
    {
      title: "Create a webhook",
      description:
        "Register a URL to receive event deliveries. The signing secret is returned ONCE, in this reply — " +
        "it cannot be read again. Use chatform_api_read on /v1/events for the event names you can subscribe to.",
      inputSchema: {
        url: z.string().url().max(2000).describe("The HTTPS endpoint to deliver to."),
        events: z
          .array(z.string())
          .min(1)
          .max(20)
          .describe("Event names, e.g. [\"response.completed\"]. See /v1/events for the catalogue."),
        form_id: z.string().max(64).optional().describe("Scope to one form. Omit for every form in the organization."),
        idempotency_key: z.string().optional().describe("Optional. Guards against creating two on a retry."),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ url, events, form_id, idempotency_key }) => {
      const res = await callApi(ctx(), "POST", "/v1/webhooks", {
        body: { url, events, ...(form_id ? { formId: form_id } : {}) },
        idempotencyKey: idempotency_key,
      });
      if (res.status >= 400) return errorResult(describeFailure(res));
      return jsonResult(res.body);
    },
  );
}
