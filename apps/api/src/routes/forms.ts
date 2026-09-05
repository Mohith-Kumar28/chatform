import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { FormDoc, lintFormDoc, hasErrors, migrateFormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { ErrorEnvelope } from "../lib/openapi.js";
import { hashPassword, isHashedPassword } from "../lib/crypto.js";
import { requireSession, requireOrg, requireFormAccess, type GuardVars } from "../lib/guards.js";
import { requirePermission, requireGauge, entitlementsFor, type AuthzVars } from "../lib/authorize.js";
import { stripForPublish, checkDocLimits } from "../lib/doc-entitlements.js";
import { limitReached } from "@repo/entitlements";
import { requireWorkspace, formSlug } from "../lib/workspace.js";

export const formsRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

// ─── middleware: session, then organization, then per-form ownership ───
formsRouter.use("*", requireSession);
formsRouter.use("*", requireOrg);
// Every `/forms/:id...` route is org-scoped: a form id belonging to another
// tenant 404s here and never reaches a handler.
formsRouter.use("/forms/:id", requireFormAccess);
formsRouter.use("/forms/:id/*", requireFormAccess);

/**
 * Role gates. Note what is NOT here: `PUT /forms/:id/doc` is gated on `form:update` but
 * never on a plan, because authoring is always free. A free user turns on every switch,
 * uploads their logo and sees their form wearing it; publishing is where the plan bites.
 */
formsRouter.post("/forms", requirePermission("form", "create"), requireGauge("forms_count", "forms.create"));
formsRouter.put("/forms/:id/doc", requirePermission("form", "update"));
formsRouter.post("/forms/:id/publish", requirePermission("form", "publish"));
formsRouter.delete("/forms/:id", requirePermission("form", "delete"));

const FormSummary = z.object({
  id: z.string(),
  title: z.string(),
  slug: z.string(),
  status: z.string(),
  responses: z.number(),
  updatedAt: z.number(),
});

const FormFull = FormSummary.extend({
  workingSchema: z.unknown(),
  activeVersion: z.number().nullable(),
});

/**
 * The list carries two things the summary never did: how many questions the
 * form asks, and the opening lines it asks them with.
 *
 * The dashboard card had a title, a status and a response count to work with,
 * so it drew a large translucent first letter and called that the artwork.
 * Both of these come out of the document the form already has — no new column,
 * no migration, and nothing that can drift from the form itself.
 */
const FormListItem = FormSummary.extend({
  questionCount: z.number(),
  preview: z.array(z.string()),
});

/**
 * The opening of the conversation, for the card's thumbnail: the greeting if
 * there is one, then the first question or two.
 *
 * A malformed or legacy document returns empty rather than throwing — a card
 * that cannot draw its preview is a worse card, not a failed request.
 */
function summariseDoc(raw: string | null): { questionCount: number; preview: string[] } {
  if (!raw) return { questionCount: 0, preview: [] };
  try {
    const doc = JSON.parse(raw) as { blocks?: { type?: string; title?: string }[] };
    const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
    // A greeting and a statement are said, not asked. Counting them as
    // questions would put this number one or two above the builder's.
    const isPrelude = (t?: string) => t === "welcome" || t === "statement";
    const questions = blocks.filter((b) => !isPrelude(b.type));
    const preview: string[] = [];
    const greeting = blocks.find((b) => isPrelude(b.type))?.title;
    if (greeting) preview.push(greeting);
    for (const q of questions) {
      if (preview.length >= 3) break;
      if (q.title) preview.push(q.title);
    }
    return { questionCount: questions.length, preview };
  } catch {
    return { questionCount: 0, preview: [] };
  }
}

const CreateFormBody = z.object({
  title: z.string().min(1).max(200),
  workspaceId: z.string().optional(),
  doc: z.unknown().optional(),
});

const UpdateDocBody = z.object({
  doc: z.unknown(),
  theme: z.unknown().optional(),
  settings: z.unknown().optional(),
});

/**
 * Form passwords are hashed before they touch storage. Legacy docs may still
 * carry plaintext; this upgrades them on the next save, and the verifier in
 * `routes/public.ts` accepts both while old rows drain.
 */
async function withHashedPassword(doc: FormDoc): Promise<FormDoc> {
  const pw = doc.settings.password;
  if (!pw.enabled || !pw.value || isHashedPassword(pw.value)) return doc;
  return { ...doc, settings: { ...doc.settings, password: { ...pw, value: await hashPassword(pw.value) } } };
}

function defaultDoc(title: string): string {
  return JSON.stringify({
    schemaVersion: 1,
    title,
    blocks: [
      { id: `blk_${crypto.randomUUID().slice(0, 8)}`, ref: "welcome", type: "welcome", title: `Hey! Let's get started with ${title}.`, required: false },
      { id: `blk_${crypto.randomUUID().slice(0, 8)}`, ref: "q_email", type: "email", title: "What's your email?", required: true },
    ],
    endings: [{ id: `end_${crypto.randomUUID().slice(0, 8)}`, ref: "end_thanks", title: "Thank you! 🎉", bodyMd: "", redirectDelaySec: 5, showSummary: false }],
    logic: [],
    endingRules: [],
    variables: [],
    hiddenFields: [],
    settings: {},
    theme: {},
  });
}

// ─── routes ───

formsRouter.get(
  "/forms",
  describeRoute({ tags: ["dashboard"], summary: "List forms in the active workspace", responses: { 200: { description: "Forms", content: { "application/json": { schema: resolver(z.array(FormListItem)) } } } } }),
  async (c) => {
    const ws = await requireWorkspace(c);
    if (!ws) return c.json([]);
    // `working_schema` joins the select so the card can describe the form.
    // It is the one wide column here; a workspace holds tens of forms, not
    // thousands, and the alternative is a denormalised summary column that
    // can disagree with the document it summarises.
    const rows = await c.env.DB.prepare(
      `SELECT f.id, f.title, f.slug, f.status, f.updated_at, f.working_schema,
              (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id AND s.status = 'completed') AS responses
       FROM forms f WHERE f.workspace_id = ? AND f.deleted_at IS NULL ORDER BY f.updated_at DESC`,
    )
      .bind(ws.wsId)
      .all<{ id: string; title: string; slug: string; status: string; updated_at: number; responses: number; working_schema: string | null }>();
    return c.json(
      (rows.results ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        status: r.status,
        responses: r.responses,
        updatedAt: r.updated_at,
        ...summariseDoc(r.working_schema),
      })),
    );
  },
);

formsRouter.post(
  "/forms",
  validator("json", CreateFormBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Create a form",
    responses: { 200: { description: "Created", content: { "application/json": { schema: resolver(FormFull) } } }, 403: { description: "Limit reached", content: { "application/json": { schema: resolver(ErrorEnvelope) } } } },
  }),
  async (c) => {
    const body = c.req.valid("json");
    const ws = await requireWorkspace(c, body.workspaceId);
    if (!ws) return c.json({ error: { code: "no_organization", message: "Create an organization first" } }, 403);
    const userId = c.get("userId") as string;
    let workingSchema: string;
    if (body.doc !== undefined) {
      const parsed = FormDoc.safeParse(body.doc);
      if (!parsed.success) {
        return c.json({ error: { code: "invalid_doc", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } }, 422);
      }
      workingSchema = JSON.stringify(parsed.data);
    } else {
      // materialize defaults (settings/theme nested objects) by parsing through the schema
      const defaulted = FormDoc.safeParse(JSON.parse(defaultDoc(body.title)));
      workingSchema = JSON.stringify(defaulted.success ? defaulted.data : JSON.parse(defaultDoc(body.title)));
    }
    const id = `frm_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const slug = formSlug(body.title);
    await c.env.DB.prepare(
      `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
    )
      .bind(id, ws.orgId, ws.wsId, userId, body.title, slug, workingSchema, crypto.randomUUID().slice(0, 16), Date.now(), Date.now())
      .run();
    return c.json({ id, title: body.title, slug, status: "draft", responses: 0, updatedAt: Date.now(), workingSchema: JSON.parse(workingSchema), activeVersion: null });
  },
);

formsRouter.delete(
  "/forms/:id",
  describeRoute({ tags: ["dashboard"], summary: "Soft-delete a form", responses: { 200: { description: "Deleted", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } } } }),
  async (c) => {
    const form = c.get("form")!;
    await c.env.DB.prepare(`UPDATE forms SET deleted_at = ?, status = 'archived' WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`)
      .bind(Date.now(), form.id, form.organization_id)
      .run();
    return c.json({ ok: true });
  },
);

formsRouter.get(
  "/forms/:id",
  describeRoute({ tags: ["dashboard"], summary: "Get a form with its working document", responses: { 200: { description: "Form", content: { "application/json": { schema: resolver(FormFull) } } }, 404: { description: "Not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } } } }),
  async (c) => {
    const id = c.get("form")!.id;
    const row = await c.env.DB.prepare(
      `SELECT f.id, f.title, f.slug, f.status, f.working_schema, f.updated_at, fv.version
       FROM forms f LEFT JOIN form_versions fv ON fv.id = f.active_version_id
       WHERE f.id = ? AND f.deleted_at IS NULL`,
    )
      .bind(id)
      .first<{ id: string; title: string; slug: string; status: string; working_schema: string; updated_at: number; version: number | null }>();
    if (!row) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    // normalize legacy docs (missing settings/theme sub-objects) through the schema
    // Migrate on read. Stored rows are never rewritten in place — published
    // versions must render forever exactly as they were published.
    const rawDoc = migrateFormDoc(JSON.parse(row.working_schema));
    const normalized = FormDoc.safeParse(rawDoc);
    return c.json({
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      responses: 0,
      updatedAt: row.updated_at,
      workingSchema: normalized.success ? normalized.data : rawDoc,
      activeVersion: row.version,
    });
  },
);

formsRouter.put(
  "/forms/:id/doc",
  validator("json", UpdateDocBody),
  describeRoute({ tags: ["dashboard"], summary: "Update the working document (autosave target)", responses: { 200: { description: "Saved", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean(), issues: z.array(z.any()) })) } } } } }),
  async (c) => {
    const id = c.get("form")!.id;
    const body = c.req.valid("json");
    const parsed = FormDoc.safeParse(migrateFormDoc(body.doc));
    if (!parsed.success) {
      return c.json({ error: { code: "invalid_doc", message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") } }, 422);
    }
    const doc = await withHashedPassword(parsed.data);
    const issues = lintFormDoc(doc);
    await c.env.DB.prepare(`UPDATE forms SET working_schema = ?, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(doc), Date.now(), id)
      .run();
    return c.json({ ok: true, issues });
  },
);

formsRouter.post(
  "/forms/:id/publish",
  describeRoute({ tags: ["dashboard"], summary: "Publish the working document as a new version", responses: { 200: { description: "Published", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean(), version: z.number(), stripped: z.array(z.object({ path: z.string(), feature: z.string(), label: z.string(), requiredPlan: z.string() })) })) } } }, 402: { description: "A plan limit refuses the publish", content: { "application/json": { schema: resolver(ErrorEnvelope) } } }, 422: { description: "Lint errors", content: { "application/json": { schema: resolver(ErrorEnvelope) } } } } }),
  async (c) => {
    const id = c.get("form")!.id;
    const userId = c.get("userId") as string;
    const row = await c.env.DB.prepare(`SELECT working_schema, theme_json, settings_json FROM forms WHERE id = ? AND deleted_at IS NULL`).bind(id).first<{ working_schema: string; theme_json: string | null; settings_json: string | null }>();
    if (!row) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const parsed = FormDoc.safeParse(migrateFormDoc(JSON.parse(row.working_schema)));
    if (!parsed.success) return c.json({ error: { code: "invalid_doc", message: "Working document is invalid" } }, 422);
    const issues = lintFormDoc(parsed.data);
    if (hasErrors(issues)) {
      return c.json({ error: { code: "lint_failed", message: issues.filter((i) => i.level === "error").map((i) => i.message).join("; ") } }, 422);
    }

    const ent = await entitlementsFor(c);

    /**
     * Hard document limits refuse the publish rather than truncating.
     *
     * Silently dropping someone's 140th question would be data loss; telling them the
     * number and letting them decide is not.
     */
    const overLimit = checkDocLimits(parsed.data, ent);
    if (overLimit.length > 0) {
      const first = overLimit[0]!;
      return c.json(limitReached({ limitKey: first.limitKey, plan: ent.planId, used: first.used, limit: first.limit, context: { surface: "publish" } }), 402);
    }

    /**
     * Gated settings are removed from the version being published, and every removal is
     * reported. The working document is untouched, so an upgrade republishes the full
     * thing with no re-authoring, and no uploaded asset is deleted.
     *
     * Reporting rather than silently dropping is deliberate on two counts: it is honest,
     * and it is the highest-intent upsell moment in the product — they have just built the
     * thing and can see it.
     */
    const { doc: publishable, stripped } = stripForPublish(parsed.data, ent);
    const schemaJson = JSON.stringify(publishable);

    const max = await c.env.DB.prepare(`SELECT COALESCE(MAX(version), 0) AS v FROM form_versions WHERE form_id = ?`).bind(id).first<{ v: number }>();
    const version = (max?.v ?? 0) + 1;
    const verId = `ver_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const checksum = crypto.randomUUID().slice(0, 16);
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO form_versions (id, form_id, version, schema_json, theme_json, settings_json, checksum, published_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(verId, id, version, schemaJson, row.theme_json, row.settings_json, checksum, Date.now(), userId, Date.now()),
      c.env.DB.prepare(`UPDATE forms SET status = 'published', active_version_id = ?, updated_at = ? WHERE id = ?`).bind(verId, Date.now(), id),
    ]);
    return c.json({ ok: true, version, stripped });
  },
);
