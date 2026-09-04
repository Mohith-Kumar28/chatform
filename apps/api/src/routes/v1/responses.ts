import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import {
  readFormDoc,
  toPublicBlock,
  toPublicEnding,
  validateAnswer,
  replayState,
  unsatisfiedRequired,
  answerability,
  progressOf,
  resolveEnding,
  type AnswerMap,
  type FormDoc,
} from "@repo/form-schema";
import type { Bindings } from "../../env.js";
import { type GuardVars } from "../../lib/guards.js";
import { requireScope, type AuthzVars } from "../../lib/authorize.js";
import { idempotent } from "../../lib/idempotency.js";
import {
  openResponse,
  recordAnswerRow,
  deleteAnswerRow,
  finalizeResponse,
  newResponseId,
  type ResponseOwner,
} from "../../lib/submissions.js";
import { meter } from "../../lib/entitlements.js";
import { entitlementsFor } from "../../lib/authorize.js";

/**
 * The response lifecycle.
 *
 * Deliberately not a single "post the whole form" endpoint. That shape would
 * create completed rows with no per-question history, and every partial-response
 * count, drop-off funnel and Summary distribution in the product would quietly
 * start meaning something different for API traffic than for conversations.
 *
 * So a response is opened, answered into, and completed — writing exactly the
 * rows a conversation writes, one per answer, as each arrives. Sending
 * everything at once is a flag on the create call, which runs the same three
 * steps internally: a shortcut through the API, not through the data model.
 */

export const responsesRouter = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

// ─────────────────────────── shared plumbing ───────────────────────────

interface FormContext {
  formId: string;
  versionId: string;
  organizationId: string;
  doc: FormDoc;
}

async function loadPublishedForm(
  env: Bindings,
  formId: string,
  orgId: string,
): Promise<FormContext | null> {
  const row = await env.DB.prepare(
    `SELECT f.id, f.organization_id, fv.id AS version_id, fv.schema_json
       FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
      WHERE f.id = ? AND f.organization_id = ? AND f.status = 'published' AND f.deleted_at IS NULL`,
  )
    .bind(formId, orgId)
    .first<{ id: string; organization_id: string; version_id: string; schema_json: string }>();
  if (!row) return null;
  return {
    formId: row.id,
    versionId: row.version_id,
    organizationId: row.organization_id,
    // readFormDoc, not JSON.parse: a document stored under an older schema
    // version is migrated on read everywhere else, and the API must not be the
    // one surface serving un-migrated shapes.
    doc: readFormDoc(JSON.parse(row.schema_json)),
  };
}

interface ResponseRow {
  id: string;
  form_id: string;
  form_version_id: string | null;
  organization_id: string;
  session_id: string | null;
  status: string;
  source: string;
  is_test: number;
  hidden_fields: string | null;
  meta: string | null;
  started_at: number;
  updated_at: number | null;
  completed_at: number | null;
  duration_ms: number | null;
  expires_at: number | null;
}

async function loadResponse(env: Bindings, id: string, orgId: string): Promise<ResponseRow | null> {
  return env.DB.prepare(`SELECT * FROM submissions WHERE id = ? AND organization_id = ?`)
    .bind(id, orgId)
    .first<ResponseRow>();
}

async function loadAnswers(env: Bindings, responseId: string): Promise<AnswerMap> {
  const rows = await env.DB.prepare(
    `SELECT block_ref, value_json FROM submission_answers WHERE submission_id = ?`,
  )
    .bind(responseId)
    .all<{ block_ref: string; value_json: string }>();
  const out: AnswerMap = {};
  for (const row of rows.results ?? []) {
    try {
      out[row.block_ref] = JSON.parse(row.value_json);
    } catch {
      // A row we cannot parse is a row we cannot replay; skipping it is better
      // than failing the whole request over one corrupt value.
    }
  }
  return out;
}

function ownerOf(env: Bindings, form: FormContext, row: ResponseRow): ResponseOwner {
  return {
    env,
    formId: form.formId,
    formVersionId: row.form_version_id ?? form.versionId,
    organizationId: row.organization_id,
    sessionId: row.session_id,
    source: (row.source as ResponseOwner["source"]) ?? "api",
    isTest: row.is_test === 1,
  };
}

function jsonOr<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** The single shape every lifecycle endpoint returns. */
function projectResponse(row: ResponseRow, doc: FormDoc, answers: AnswerMap, include: Set<string>) {
  const hidden = jsonOr<Record<string, string>>(row.hidden_fields, {});
  const meta = jsonOr<Record<string, unknown>>(row.meta, {});
  const { cursor, state, offPath } = replayState(doc, answers, hidden);
  const missing = row.status === "in_progress" ? unsatisfiedRequired(doc, answers, hidden) : [];

  return {
    id: row.id,
    object: "response" as const,
    form_id: row.form_id,
    status: row.status,
    source: row.source,
    mode: row.is_test === 1 ? ("test" as const) : ("live" as const),
    started_at: row.started_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    expires_at: row.expires_at,
    duration_ms: row.duration_ms,
    ending_ref: (meta.endingRef as string | null) ?? null,
    abandon_reason: (meta.abandonReason as string | null) ?? null,
    progress: progressOf(doc, answers, hidden),
    variables: state.variables,
    hidden_fields: hidden,
    next:
      row.status === "in_progress"
        ? cursor.kind === "block"
          ? { kind: "block" as const, block: toPublicBlock(cursor.block) }
          : { kind: "ending" as const, ending: toPublicEnding(cursor.ending, doc.settings.onComplete) }
        : null,
    complete_ready: row.status === "in_progress" && missing.length === 0,
    missing_required: missing,
    off_path_answers: offPath,
    ...(include.has("answers")
      ? {
          answers: Object.entries(answers).map(([ref, value]) => ({
            ref,
            type: doc.blocks.find((b) => b.ref === ref)?.type ?? null,
            value,
          })),
        }
      : {}),
  };
}

function includeSet(c: { req: { query(k: string): string | undefined } }): Set<string> {
  return new Set((c.req.query("include") ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

// ─────────────────────────────── schemas ───────────────────────────────

const AnswerInput = z.record(z.string(), z.unknown());

const CreateResponseBody = z
  .object({
    answers: AnswerInput.optional(),
    hiddenFields: z.record(z.string(), z.string()).optional(),
    /** Finish in the same call. Still writes one row per answer. */
    complete: z.boolean().default(false),
    /**
     * `flow` refuses answers the conversation has not reached, so an API
     * response's funnel means what a chat response's funnel means. `free` is for
     * bulk import, where the flow was walked somewhere else — or years ago.
     */
    mode: z.enum(["flow", "free"]).default("flow"),
    /** Seconds until an unfinished response is swept to abandoned. */
    expiresIn: z.number().int().min(300).max(2_592_000).default(86_400),
    respondent: z
      .object({ ipHash: z.string().max(128).optional(), country: z.string().max(8).optional(), userAgent: z.string().max(300).optional() })
      .optional(),
  })
  .prefault({});

const AppendAnswersBody = z.union([
  z.object({ answers: z.array(z.object({ ref: z.string(), value: z.unknown() })).min(1).max(200) }),
  z.object({ ref: z.string(), value: z.unknown() }),
]);

// ────────────────────────────── endpoints ──────────────────────────────

/**
 * Validate a batch in flow order, all or nothing.
 *
 * A partial write on a rejected batch leaves the caller unable to tell what
 * landed, which is worse than rejecting the whole thing.
 */
function validateBatch(
  doc: FormDoc,
  existing: AnswerMap,
  incoming: { ref: string; value: unknown }[],
  hidden: Record<string, string>,
  mode: "flow" | "free",
): { ok: true; accepted: { ref: string; type: string; value: unknown }[] } | { ok: false; issues: { ref: string; code: string; message: string }[] } {
  const issues: { ref: string; code: string; message: string }[] = [];
  const accepted: { ref: string; type: string; value: unknown }[] = [];
  // A working copy, so each answer is judged against the state its predecessors
  // in this same batch produced — exactly as the conversation would.
  const working: AnswerMap = { ...existing };

  for (const item of incoming) {
    const block = doc.blocks.find((b) => b.ref === item.ref);
    if (!block) {
      issues.push({ ref: item.ref, code: "unknown_block", message: `No question with ref "${item.ref}"` });
      continue;
    }
    if (mode === "flow") {
      const reachable = answerability(doc, working, item.ref, hidden);
      if (!reachable.ok) {
        issues.push({
          ref: item.ref,
          code: reachable.code,
          message:
            reachable.code === "block_not_visible"
              ? "This question is hidden by its own visibility rule for these answers."
              : "The flow has not reached this question yet.",
        });
        continue;
      }
    }
    const result = validateAnswer(block, item.value);
    if (!result.ok) {
      issues.push({ ref: item.ref, code: result.code ?? "type", message: result.hint ?? "Invalid answer" });
      continue;
    }
    // The canonical value, never the raw input: this is what makes an API answer
    // byte-identical to the same answer given in a conversation.
    working[item.ref] = result.value as AnswerMap[string];
    accepted.push({ ref: item.ref, type: block.type, value: result.value });
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, accepted };
}

responsesRouter.post(
  "/forms/:id/responses",
  requireScope("response", "write"),
  idempotent("POST /v1/forms/:id/responses"),
  validator("json", CreateResponseBody),
  describeRoute({
    tags: ["v1"],
    summary: "Open a response (optionally with answers, optionally completing it)",
    responses: {
      201: { description: "Response" },
      404: { description: "Form not found" },
      422: { description: "An answer was rejected, or required questions are unanswered" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const body = c.req.valid("json");
    const form = await loadPublishedForm(c.env, c.req.param("id"), orgId);
    if (!form) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    const isTest = c.get("environment") === "test";
    const startedAt = Date.now();
    const hidden = body.hiddenFields ?? {};
    const owner: ResponseOwner = {
      env: c.env,
      formId: form.formId,
      formVersionId: form.versionId,
      organizationId: form.organizationId,
      sessionId: null,
      source: "api",
      isTest,
    };

    const incoming = Object.entries(body.answers ?? {}).map(([ref, value]) => ({ ref, value }));
    const validated = validateBatch(form.doc, {}, incoming, hidden, body.mode);
    if (!validated.ok) {
      return c.json(
        { error: { code: "invalid_answer", message: "One or more answers were rejected", issues: validated.issues } },
        422,
      );
    }

    const responseId = newResponseId();
    await openResponse(owner, {
      responseId,
      hiddenFields: hidden,
      variables: {},
      userAgent: body.respondent?.userAgent ?? null,
      country: body.respondent?.country ?? null,
      startedAt,
      expiresAt: startedAt + body.expiresIn * 1000,
      apiKeyId: c.get("keyId") ?? null,
    });

    /**
     * A response is a response the moment it is opened, whether or not an answer
     * has arrived — the same as a conversation, which counts as a start when the
     * session opens. Test-mode responses are excluded: rehearsing an integration
     * must not spend the customer's month.
     */
    if (!isTest) {
      const ent = await entitlementsFor(c as never);
      await meter(c.env, orgId, "responses", 1, ent);
    }

    for (const answer of validated.accepted) {
      await recordAnswerRow(owner, {
        responseId,
        block: { ref: answer.ref, type: answer.type },
        value: answer.value,
      });
    }

    if (body.complete) {
      const answers = await loadAnswers(c.env, responseId);
      const missing = unsatisfiedRequired(form.doc, answers, hidden);
      if (missing.length > 0) {
        return c.json(
          {
            error: {
              code: "incomplete",
              message: "Required questions are unanswered",
              issues: missing.map((m) => ({ ref: m.ref, code: "required", message: `"${m.title}" is required` })),
            },
          },
          422,
        );
      }
      const { state } = replayState(form.doc, answers, hidden);
      const ending = resolveEnding(form.doc, state);
      await finalizeResponse(owner, {
        responseId,
        status: "completed",
        endingRef: ending.ref,
        answers,
        variables: state.variables,
        startedAt,
        collectedCount: Object.keys(answers).length,
      });
    }

    const row = (await loadResponse(c.env, responseId, orgId))!;
    const answers = await loadAnswers(c.env, responseId);
    return c.json(projectResponse(row, form.doc, answers, new Set(["answers"])), 201);
  },
);

responsesRouter.post(
  "/responses/:id/answers",
  requireScope("response", "write"),
  validator("json", AppendAnswersBody),
  describeRoute({
    tags: ["v1"],
    summary: "Record one or more answers on an open response",
    responses: {
      200: { description: "Updated response" },
      404: { description: "Response not found" },
      409: { description: "The response is no longer open" },
      422: { description: "An answer was rejected" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const body = c.req.valid("json");
    const row = await loadResponse(c.env, c.req.param("id"), orgId);
    if (!row) return c.json({ error: { code: "not_found", message: "Response not found" } }, 404);
    if (row.status !== "in_progress") {
      return c.json({ error: { code: "response_not_open", message: `This response is ${row.status}` } }, 409);
    }

    const form = await loadPublishedForm(c.env, row.form_id, orgId);
    if (!form) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    const hidden = jsonOr<Record<string, string>>(row.hidden_fields, {});
    const existing = await loadAnswers(c.env, row.id);
    const incoming = "answers" in body ? body.answers : [{ ref: body.ref, value: body.value }];
    const mode = (jsonOr<Record<string, unknown>>(row.meta, {}).flowEnforced === false ? "free" : "flow") as
      | "flow"
      | "free";

    const validated = validateBatch(form.doc, existing, incoming, hidden, mode);
    if (!validated.ok) {
      return c.json(
        { error: { code: "invalid_answer", message: "One or more answers were rejected", issues: validated.issues } },
        422,
      );
    }

    const owner = ownerOf(c.env, form, row);
    for (const answer of validated.accepted) {
      /**
       * Awaited, unlike the conversation path, which hands this to `waitUntil`
       * so the stream is never blocked. A 200 returned before the row exists
       * would mean the caller's very next read could miss the answer they just
       * wrote.
       */
      await recordAnswerRow(owner, {
        responseId: row.id,
        block: { ref: answer.ref, type: answer.type },
        value: answer.value,
      });
    }

    const fresh = (await loadResponse(c.env, row.id, orgId))!;
    const answers = await loadAnswers(c.env, row.id);
    return c.json({
      ...projectResponse(fresh, form.doc, answers, includeSet(c)),
      recorded: validated.accepted.map((a) => ({ ref: a.ref, value: a.value })),
    });
  },
);

responsesRouter.delete(
  "/responses/:id/answers/:ref",
  requireScope("response", "write"),
  describeRoute({
    tags: ["v1"],
    summary: "Retract one answer, moving the flow back to it",
    responses: { 200: { description: "Updated response" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const row = await loadResponse(c.env, c.req.param("id"), orgId);
    if (!row) return c.json({ error: { code: "not_found", message: "Response not found" } }, 404);
    if (row.status !== "in_progress") {
      return c.json({ error: { code: "response_not_open", message: `This response is ${row.status}` } }, 409);
    }
    const form = await loadPublishedForm(c.env, row.form_id, orgId);
    if (!form) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    // Later answers are kept, matching the conversation's `edit` action: one of
    // them may still be valid, and re-asking everything is a worse experience
    // than re-asking what actually changed.
    await deleteAnswerRow(ownerOf(c.env, form, row), row.id, c.req.param("ref"));

    const fresh = (await loadResponse(c.env, row.id, orgId))!;
    const answers = await loadAnswers(c.env, row.id);
    return c.json(projectResponse(fresh, form.doc, answers, includeSet(c)));
  },
);

responsesRouter.post(
  "/responses/:id/complete",
  requireScope("response", "write"),
  idempotent("POST /v1/responses/:id/complete"),
  validator("json", z.object({ endingRef: z.string().optional() }).optional()),
  describeRoute({
    tags: ["v1"],
    summary: "Complete a response",
    responses: {
      200: { description: "Completed response with its ending" },
      404: { description: "Not found" },
      409: { description: "Already finished" },
      422: { description: "Required questions are unanswered" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const row = await loadResponse(c.env, c.req.param("id"), orgId);
    if (!row) return c.json({ error: { code: "not_found", message: "Response not found" } }, 404);
    if (row.status !== "in_progress") {
      return c.json({ error: { code: "response_not_open", message: `This response is ${row.status}` } }, 409);
    }
    const form = await loadPublishedForm(c.env, row.form_id, orgId);
    if (!form) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    const hidden = jsonOr<Record<string, string>>(row.hidden_fields, {});
    const answers = await loadAnswers(c.env, row.id);
    const missing = unsatisfiedRequired(form.doc, answers, hidden);
    if (missing.length > 0) {
      /**
       * There is deliberately no `allowIncomplete` flag. "I want the data but
       * they did not finish" already has a name and a status — abandon — and
       * giving completion a second meaning would make the completion rate
       * unreadable.
       */
      return c.json(
        {
          error: {
            code: "incomplete",
            message: "Required questions are unanswered",
            issues: missing.map((m) => ({ ref: m.ref, code: "required", message: `"${m.title}" is required` })),
          },
        },
        422,
      );
    }

    const body = (await c.req.json().catch(() => ({}))) as { endingRef?: string };
    const { state, cursor } = replayState(form.doc, answers, hidden);
    let ending = cursor.kind === "ending" ? cursor.ending : resolveEnding(form.doc, state);
    if (body?.endingRef) {
      const explicit = form.doc.endings.find((e) => e.ref === body.endingRef);
      if (!explicit) {
        return c.json({ error: { code: "unknown_ending", message: `No ending with ref "${body.endingRef}"` } }, 422);
      }
      ending = explicit;
    }

    const { changed } = await finalizeResponse(ownerOf(c.env, form, row), {
      responseId: row.id,
      status: "completed",
      endingRef: ending.ref,
      answers,
      variables: state.variables,
      startedAt: row.started_at,
      collectedCount: Object.keys(answers).length,
    });
    if (!changed) {
      return c.json({ error: { code: "response_not_open", message: "This response is already finished" } }, 409);
    }

    const fresh = (await loadResponse(c.env, row.id, orgId))!;
    return c.json({
      ...projectResponse(fresh, form.doc, answers, new Set(["answers"])),
      ending: toPublicEnding(ending, form.doc.settings.onComplete),
    });
  },
);

responsesRouter.post(
  "/responses/:id/abandon",
  requireScope("response", "write"),
  validator("json", z.object({ reason: z.string().max(100).optional() }).optional()),
  describeRoute({
    tags: ["v1"],
    summary: "Abandon an unfinished response",
    responses: { 200: { description: "Abandoned response" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const row = await loadResponse(c.env, c.req.param("id"), orgId);
    if (!row) return c.json({ error: { code: "not_found", message: "Response not found" } }, 404);
    if (row.status !== "in_progress") {
      return c.json({ error: { code: "response_not_open", message: `This response is ${row.status}` } }, 409);
    }
    const form = await loadPublishedForm(c.env, row.form_id, orgId);
    if (!form) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    const hidden = jsonOr<Record<string, string>>(row.hidden_fields, {});
    const answers = await loadAnswers(c.env, row.id);
    const { state } = replayState(form.doc, answers, hidden);
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };

    await finalizeResponse(ownerOf(c.env, form, row), {
      responseId: row.id,
      status: "abandoned",
      endingRef: null,
      abandonReason: body?.reason ?? "api_abandoned",
      answers,
      variables: state.variables,
      startedAt: row.started_at,
      collectedCount: Object.keys(answers).length,
    });

    const fresh = (await loadResponse(c.env, row.id, orgId))!;
    return c.json(projectResponse(fresh, form.doc, answers, new Set(["answers"])));
  },
);

responsesRouter.get(
  "/responses/:id",
  requireScope("response", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "Read one response",
    responses: { 200: { description: "Response" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const row = await loadResponse(c.env, c.req.param("id"), orgId);
    if (!row) return c.json({ error: { code: "not_found", message: "Response not found" } }, 404);
    const form = await loadPublishedForm(c.env, row.form_id, orgId);
    if (!form) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    const answers = await loadAnswers(c.env, row.id);
    const include = includeSet(c);
    include.add("answers"); // a single read defaults to including them
    return c.json(projectResponse(row, form.doc, answers, include));
  },
);

responsesRouter.get(
  "/responses/:id/next",
  requireScope("response", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "Where the flow is waiting on this response",
    responses: { 200: { description: "The next question, or the ending" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const row = await loadResponse(c.env, c.req.param("id"), orgId);
    if (!row) return c.json({ error: { code: "not_found", message: "Response not found" } }, 404);
    const form = await loadPublishedForm(c.env, row.form_id, orgId);
    if (!form) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    const hidden = jsonOr<Record<string, string>>(row.hidden_fields, {});
    const answers = await loadAnswers(c.env, row.id);
    const projected = projectResponse(row, form.doc, answers, new Set());
    return c.json({
      next: projected.next,
      progress: projected.progress,
      answered: Object.keys(answers),
      missing_required: projected.missing_required,
      complete_ready: projected.complete_ready,
    });
  },
);

export const ResponseObject = z.object({ id: z.string(), object: z.literal("response") });
