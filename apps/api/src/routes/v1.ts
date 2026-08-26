import { Hono, type MiddlewareHandler } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { migrateFormDoc, type FormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { ErrorEnvelope } from "../lib/openapi.js";
import { requireApiKey, assertChatSessionAccess, type GuardVars } from "../lib/guards.js";

/**
 * Developer API v1 — API-key auth, headless chat contract.
 * Keys are created in the dashboard (Better Auth apiKey plugin) and sent as
 * `Authorization: Bearer sk_...`.
 */

export const v1Router = new Hono<{ Bindings: Bindings; Variables: Partial<GuardVars> }>();

v1Router.use("*", requireApiKey);

/**
 * A chat session may only be driven or read by the org that owns its form.
 * Without this any valid API key could drive any session by guessing an id.
 */
const assertSessionOwnership: MiddlewareHandler<{ Bindings: Bindings; Variables: Partial<GuardVars> }> = async (c, next) => {
  const orgId = c.get("orgId");
  const sid = c.req.param("sid");
  if (!orgId || !sid || !(await assertChatSessionAccess(c.env, sid, orgId))) {
    return c.json({ error: { code: "not_found", message: "Session not found" } }, 404);
  }
  await next();
};

v1Router.use("/chat/sessions/:sid", assertSessionOwnership);
v1Router.use("/chat/sessions/:sid/*", assertSessionOwnership);

// ─── forms (read) ───

v1Router.get(
  "/forms",
  describeRoute({
    tags: ["v1"],
    summary: "List published forms (API key)",
    responses: { 200: { description: "Forms", content: { "application/json": { schema: resolver(z.array(z.object({ id: z.string(), title: z.string(), slug: z.string() }))) } } } },
  }),
  async (c) => {
    const userId = c.get("userId");
    const rows = await c.env.DB.prepare(
      `SELECT f.id, f.title, f.slug FROM forms f
       JOIN members m ON m.organization_id = f.organization_id AND m.user_id = ?
       WHERE f.status = 'published' AND f.deleted_at IS NULL ORDER BY f.updated_at DESC LIMIT 100`,
    )
      .bind(userId)
      .all<{ id: string; title: string; slug: string }>();
    return c.json(rows.results ?? []);
  },
);

v1Router.get(
  "/forms/:id",
  describeRoute({
    tags: ["v1"],
    summary: "Get a published form's public config",
    responses: { 200: { description: "Form config" }, 404: { description: "Not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } } },
  }),
  async (c) => {
    const id = c.req.param("id");
    const orgId = c.get("orgId");
    const row = await c.env.DB.prepare(
      `SELECT fv.schema_json, f.slug FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
       WHERE f.id = ? AND f.organization_id = ? AND f.status = 'published' AND f.deleted_at IS NULL`,
    )
      .bind(id, orgId ?? "")
      .first<{ schema_json: string; slug: string }>();
    if (!row) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const { toPublicConfig } = await import("@repo/form-schema");
    const doc = migrateFormDoc(JSON.parse(row.schema_json)) as FormDoc;
    return c.json(toPublicConfig(doc, { slug: row.slug, brandingHidden: doc.settings?.branding?.hidePoweredBy === true }));
  },
);

// ─── headless chat ───

const ChatSessionResponse = z.object({
  sessionId: z.string(),
  greeting: z.string().nullable(),
  firstQuestion: z.unknown().nullable(),
});

v1Router.post(
  "/forms/:id/chat/sessions",
  validator("json", z.object({ externalId: z.string().optional(), hiddenFields: z.record(z.string(), z.string()).optional() }).optional()),
  describeRoute({
    tags: ["v1"],
    summary: "Start a chat session (headless)",
    responses: { 200: { description: "Session", content: { "application/json": { schema: resolver(ChatSessionResponse) } } }, 404: { description: "Form not found" } },
  }),
  async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json().catch(() => ({}));
    const row = await c.env.DB.prepare(
      `SELECT f.id, f.slug, fv.id AS version_id, fv.schema_json, f.organization_id
       FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
       WHERE f.id = ? AND f.organization_id = ? AND f.status = 'published' AND f.deleted_at IS NULL`,
    )
      .bind(id, c.get("orgId") ?? "")
      .first<{ id: string; slug: string; version_id: string; schema_json: string; organization_id: string }>();
    if (!row) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    const sessionId = `chs_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const respondentToken = crypto.randomUUID().replace(/-/g, "");
    const { sha256Hex } = await import("@repo/form-schema");

    await c.env.DB.prepare(
      `INSERT INTO chat_sessions (id, form_id, form_version_id, organization_id, respondent_token_hash, status, hidden_fields, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    )
      .bind(sessionId, row.id, row.version_id, row.organization_id, sha256Hex(respondentToken), JSON.stringify(body.hiddenFields ?? {}), Date.now(), Date.now())
      .run();

    const { SessionDO } = await import("../do/session-do.js");
    const stub = c.env.SESSION_DO.get(c.env.SESSION_DO.idFromName(sessionId)) as unknown as InstanceType<typeof SessionDO>;
    const init = await stub.init({
      sessionId,
      formId: row.id,
      formVersionId: row.version_id,
      organizationId: row.organization_id,
      slug: row.slug,
      brandingHidden: true,
      docJson: migrateFormDoc(JSON.parse(row.schema_json)) as FormDoc,
      respondentToken,
      hiddenFields: body.hiddenFields ?? {},
      ipHash: null,
      country: null,
      userAgent: "api-v1",
    });
    if (!init.ok) return c.json({ error: { code: init.code, message: "Session init failed" } }, 400);

    const status = await stub.getStatus();
    const transcript = await stub.getTranscript();
    const lastAssistant = [...transcript].reverse().find((m) => m.role === "assistant");
    const { toPublicBlock } = await import("@repo/form-schema");
    const doc = migrateFormDoc(JSON.parse(row.schema_json)) as FormDoc;
    const current = status?.currentRef ? doc.blocks.find((b: { ref: string }) => b.ref === status.currentRef) : null;
    return c.json({
      sessionId,
      respondentToken,
      greeting: lastAssistant?.content ?? null,
      firstQuestion: current ? toPublicBlock(current) : null,
    });
  },
);

v1Router.post(
  "/chat/sessions/:sid/messages",
  validator(
    "json",
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("text"), text: z.string().min(1).max(5000) }),
      z.object({ type: z.literal("structured"), ref: z.string(), value: z.unknown() }),
    ]),
  ),
  describeRoute({
    tags: ["v1"],
    summary: "Send a message / structured answer — synchronous response with next question",
    responses: { 200: { description: "Turn result" }, 400: { description: "Rejected" } },
  }),
  async (c) => {
    const sid = c.req.param("sid");
    const body = c.req.valid("json");
    const { SessionDO } = await import("../do/session-do.js");
    const stub = c.env.SESSION_DO.get(c.env.SESSION_DO.idFromName(sid)) as unknown as InstanceType<typeof SessionDO>;

    const before = await stub.getTranscript();
    const result =
      body.type === "text"
        ? await stub.handleUserTurn({ type: "text", text: body.text })
        : await stub.handleUserTurn({ type: "structured", ref: body.ref, value: body.value });
    if (!result.accepted) {
      return c.json({ error: { code: result.error ?? "rejected", message: "Turn rejected" } }, 400);
    }
    await new Promise((r) => setTimeout(r, 50));
    const after = await stub.getTranscript();
    const status = await stub.getStatus();
    const newMessages = after.slice(before.length).map((m) => ({ role: m.role, content: m.content }));

    // resolve next question from the form doc
    const sess = await c.env.DB.prepare(`SELECT form_version_id FROM chat_sessions WHERE id = ?`).bind(sid).first<{ form_version_id: string | null }>();
    let nextQuestion: unknown = null;
    let ending: unknown = null;
    if (sess?.form_version_id && status?.currentRef) {
      const fv = await c.env.DB.prepare(`SELECT schema_json FROM form_versions WHERE id = ?`).bind(sess.form_version_id).first<{ schema_json: string }>();
      if (fv) {
        const doc = JSON.parse(fv.schema_json);
        const { toPublicBlock } = await import("@repo/form-schema");
        const current = doc.blocks.find((b: { ref: string }) => b.ref === status.currentRef);
        if (current) nextQuestion = toPublicBlock(current);
      }
    }
    if (status?.status === "completed") {
      ending = { title: "Complete" };
    }

    return c.json({
      accepted: true,
      assistantMessages: newMessages.filter((m) => m.role === "assistant"),
      nextQuestion,
      ending,
      complete: status?.status === "completed",
      collected: status?.collected ?? 0,
      answers: status?.answers ?? {},
    });
  },
);

v1Router.get(
  "/chat/sessions/:sid",
  describeRoute({ tags: ["v1"], summary: "Get session state (status, answers, progress)", responses: { 200: { description: "Session state", content: { "application/json": { schema: resolver(z.any()) } } } } }),
  async (c) => {
    const sid = c.req.param("sid");
    const { SessionDO } = await import("../do/session-do.js");
    const stub = c.env.SESSION_DO.get(c.env.SESSION_DO.idFromName(sid)) as unknown as InstanceType<typeof SessionDO>;
    const status = await stub.getStatus();
    if (!status) return c.json({ error: { code: "not_found", message: "Session not found" } }, 404);
    return c.json(status);
  },
);
