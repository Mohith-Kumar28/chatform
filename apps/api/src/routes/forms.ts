import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { FormDoc, ThemeDoc, lintFormDoc, hasErrors, migrateFormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { ErrorEnvelope } from "../lib/openapi.js";
import { hashPassword, isHashedPassword } from "../lib/crypto.js";
import { requireSession, requireOrg, requireFormAccess, type GuardVars } from "../lib/guards.js";
import { requirePermission, requireGauge, entitlementsFor, type AuthzVars } from "../lib/authorize.js";
import { stripForPublish, checkDocLimits } from "../lib/doc-entitlements.js";
import { publishFingerprint, hasUnpublishedChanges } from "../lib/publish-state.js";
import { afterResponse, parseStoredDoc, recordDocChange, recordFormEvent, stampVersionStatement } from "../lib/form-activity.js";
import { audit } from "../lib/gate-log.js";
import { apiError, describeSchemaError } from "../lib/api-error.js";
import { saveLimit } from "../lib/ratelimit.js";
import { limitReached } from "@repo/entitlements";
import { requireWorkspace, formSlug } from "../lib/workspace.js";

export const formsRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

// ─── middleware: session, then organization, then per-form ownership ───
formsRouter.use("*", requireSession);
/*
  Ahead of `requireOrg`, and only on the autosave.

  It needs the session to know whose bucket to count against, and it wants to sit
  in front of everything after that: the org lookup, the form lookup and the role
  read are three indexed D1 point reads that a client stuck in a render loop
  should not be able to spend on our behalf. Every other route here is driven by
  a person clicking something, and is limited by how fast a person can click.
*/
formsRouter.use("/forms/:id/doc", saveLimit);
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
// Taking a form off the air is the same authority as putting it on. Anyone who
// can publish can unpublish; nobody else can do either.
formsRouter.post("/forms/:id/unpublish", requirePermission("form", "publish"));
formsRouter.delete("/forms/:id", requirePermission("form", "delete"));
formsRouter.patch("/forms/:id/workspace", requirePermission("form", "update"));

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
  /** The draft revision this document is at. Stated back on save to detect a clash. */
  workingRevision: z.number(),
  /** When the live version went live. Null until the form is published once. */
  publishedAt: z.number().nullable(),
  /** True when the draft differs from what respondents are currently answering. */
  hasUnpublishedChanges: z.boolean(),
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
/**
 * The handful of theme values a card needs to look like the form it stands for.
 *
 * Not the whole `ThemeDoc`: a list of thirty forms would then carry thirty
 * copies of fonts, radii and background images that a 120px thumbnail cannot
 * show. These are the ones that read at that size — the two bubble colours, the
 * ground behind them, and the logo if there is one.
 */
const FormCardTheme = z.object({
  background: z.string(),
  botBubble: z.string(),
  userBubble: z.string(),
  userBubbleText: z.string(),
  accent: z.string(),
  logoUrl: z.string().nullable(),
});

const FormListItem = FormSummary.extend({
  questionCount: z.number(),
  preview: z.array(z.string()),
  /**
   * Null when nobody has designed this form.
   *
   * Not "null when `theme_json` is absent": the builder writes a full theme the
   * first time it saves anything, so absence stops being a useful signal almost
   * immediately. A theme identical to the defaults is the honest test for
   * "never touched", and it is what lets the card keep the brand band for those
   * rather than painting a whole grid in the same default cream.
   */
  theme: FormCardTheme.nullable(),
});

/**
 * The opening of the conversation, for the card's thumbnail: the greeting if
 * there is one, then the first question or two.
 *
 * A malformed or legacy document returns empty rather than throwing — a card
 * that cannot draw its preview is a worse card, not a failed request.
 */
/**
 * What an undesigned form looks like, read from the schema rather than copied.
 *
 * A hardcoded copy was already wrong within a day — the `userBubble` default
 * moved and this file did not hear about it, which would have made every
 * default form look "designed" and quietly retired the brand band. Parsing an
 * empty object gives whatever `ThemeDoc` currently defaults to, so the two
 * cannot disagree.
 */
const THEME_DEFAULTS = ThemeDoc.parse({});
const DEFAULT_CARD_THEME = {
  background: THEME_DEFAULTS.background,
  botBubble: THEME_DEFAULTS.botBubble,
  userBubble: THEME_DEFAULTS.userBubble,
  userBubbleText: THEME_DEFAULTS.userBubbleText,
  accent: THEME_DEFAULTS.accent,
  logoUrl: null,
} as const;

type CardTheme = z.infer<typeof FormCardTheme>;

function summariseDoc(raw: string | null): {
  questionCount: number;
  preview: string[];
  theme: CardTheme | null;
} {
  if (!raw) return { questionCount: 0, preview: [], theme: null };
  try {
    const doc = JSON.parse(raw) as {
      blocks?: { type?: string; title?: string }[];
      theme?: Partial<CardTheme>;
    };
    const blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
    // A greeting and a statement are said, not asked. Counting them as
    // questions would put this number one or two above the builder's.
    const isPrelude = (t?: string) => t === "welcome" || t === "statement";
    const questions = blocks.filter((b) => !isPrelude(b.type));
    const preview: string[] = [];
    const greeting = blocks.find((b) => isPrelude(b.type))?.title;
    if (greeting) preview.push(greeting);
    // Two, because the card draws exactly two bubbles. It used to gather three
    // for a subtitle that joined the tail with dots; that line is gone — the
    // thumbnail already says what the form opens with — so a third entry would
    // be payload nobody reads.
    for (const q of questions) {
      if (preview.length >= 2) break;
      if (q.title) preview.push(q.title);
    }
    // Field by field rather than a spread of `doc.theme`: a legacy document can
    // carry nulls where a colour is expected, and a card drawn with
    // `background: null` is a card drawn with no background at all.
    const t = doc.theme ?? {};
    const pick = (v: unknown, fallback: string) =>
      typeof v === "string" && v.trim() ? v : fallback;
    const theme: CardTheme = {
      background: pick(t.background, DEFAULT_CARD_THEME.background),
      botBubble: pick(t.botBubble, DEFAULT_CARD_THEME.botBubble),
      userBubble: pick(t.userBubble, DEFAULT_CARD_THEME.userBubble),
      userBubbleText: pick(t.userBubbleText, DEFAULT_CARD_THEME.userBubbleText),
      accent: pick(t.accent, DEFAULT_CARD_THEME.accent),
      logoUrl: typeof t.logoUrl === "string" && t.logoUrl.trim() ? t.logoUrl : null,
    };
    const untouched =
      theme.logoUrl === null &&
      (Object.keys(DEFAULT_CARD_THEME) as (keyof CardTheme)[]).every(
        (k) => k === "logoUrl" || theme[k] === DEFAULT_CARD_THEME[k],
      );
    return { questionCount: questions.length, preview, theme: untouched ? null : theme };
  } catch {
    return { questionCount: 0, preview: [], theme: null };
  }
}

const CreateFormBody = z.object({
  title: z.string().min(1).max(200),
  workspaceId: z.string().optional(),
  doc: z.unknown().optional(),
});

const UpdateDocBody = z.object({
  doc: z.unknown(),
  /**
   * The revision this edit was made against, for optimistic concurrency.
   *
   * Optional, and deliberately so: a builder that loaded before this shipped
   * sends nothing, and a save with no stated revision is applied unconditionally
   * rather than refused. That is the old behaviour, kept for exactly as long as
   * a stale tab can live, instead of a deploy that 409s everyone at once.
   */
  baseRevision: z.number().int().nonnegative().optional(),
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
  describeRoute({ tags: ["dashboard"], summary: "List forms in a workspace", responses: { 200: { description: "Forms", content: { "application/json": { schema: resolver(z.array(FormListItem)) } } } } }),
  validator("query", z.object({ ws: z.string().optional() })),
  async (c) => {
    // `?ws=` names the workspace being viewed — a slug from the switcher, or an
    // id. Absent, `requireWorkspace` falls back to the organization's oldest,
    // which is what every link written before workspaces were selectable means.
    const ws = await requireWorkspace(c, c.req.query("ws"));
    if (ws === undefined) return c.json({ error: { code: "not_found", message: "No such workspace" } }, 404);
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
    if (ws === undefined) return c.json({ error: { code: "not_found", message: "No such workspace" } }, 404);
    if (!ws) return c.json({ error: { code: "no_organization", message: "Create an organization first" } }, 403);
    const userId = c.get("userId") as string;
    let workingSchema: string;
    if (body.doc !== undefined) {
      const parsed = FormDoc.safeParse(body.doc);
      if (!parsed.success) {
        const described = describeSchemaError(parsed.error);
        return apiError(c, 422, "invalid_doc", described.message, { issues: described.issues });
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
    await afterResponse(c, recordFormEvent(c.env, {
        formId: id,
        orgId: ws.orgId,
        kind: "created",
        summary: `Created “${body.title}”`,
        actor: { type: "user", id: userId },
        source: body.doc !== undefined ? "template" : "builder",
      }).catch((err) => console.error("form_activity_failed", err)),);
    return c.json({ id, title: body.title, slug, status: "draft", responses: 0, updatedAt: Date.now(), workingSchema: JSON.parse(workingSchema), activeVersion: null, workingRevision: 0, publishedAt: null, hasUnpublishedChanges: false });
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

/**
 * Move a form between workspaces.
 *
 * Without this a second workspace is somewhere new forms can be made and
 * nothing can be moved into, which is not a feature so much as a fork.
 *
 * `requireFormAccess` has already proved the form is this organization's, and
 * the target is resolved inside the same organization — so a move cannot cross
 * a tenant boundary in either direction. `organization_id` is deliberately left
 * alone: it is the same organization, and rewriting a denormalised column that
 * is not changing is how it drifts.
 */
formsRouter.patch(
  "/forms/:id/workspace",
  validator("json", z.object({ workspaceId: z.string() })),
  describeRoute({
    tags: ["dashboard"],
    summary: "Move a form to another workspace",
    responses: {
      200: { description: "Moved", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "No such workspace", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const form = c.get("form")!;
    const target = await requireWorkspace(c, c.req.valid("json").workspaceId);
    if (!target) return c.json({ error: { code: "not_found", message: "No such workspace" } }, 404);
    await c.env.DB.prepare(`UPDATE forms SET workspace_id = ?, updated_at = ? WHERE id = ? AND organization_id = ?`)
      .bind(target.wsId, Date.now(), form.id, form.organization_id)
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
      `SELECT f.id, f.title, f.slug, f.status, f.working_schema, f.updated_at, f.working_revision,
              fv.version, fv.published_at, fv.checksum
       FROM forms f LEFT JOIN form_versions fv ON fv.id = f.active_version_id
       WHERE f.id = ? AND f.deleted_at IS NULL`,
    )
      .bind(id)
      .first<{
        id: string;
        title: string;
        slug: string;
        status: string;
        working_schema: string;
        updated_at: number;
        working_revision: number;
        version: number | null;
        published_at: number | null;
        checksum: string | null;
      }>();
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
      /*
        The draft's own counter, which the editor states back on every save.

        Not `activeVersion`: that names the published version and does not move
        when a draft is saved, so an editor holding it could never have noticed
        another tab. The builder store's `baseVersion` was being fed from it.
      */
      workingRevision: row.working_revision,
      /*
        The publish clock, which is not the save clock. Autosave answers "is my work
        safe"; these answer "is my work live", and the builder header needs both because
        on a published form they are routinely different.
      */
      publishedAt: row.published_at,
      hasUnpublishedChanges: hasUnpublishedChanges({
        workingSchema: row.working_schema,
        planId: (await entitlementsFor(c)).planId,
        activeChecksum: row.checksum,
      }),
    });
  },
);

formsRouter.put(
  "/forms/:id/doc",
  validator("json", UpdateDocBody),
  describeRoute({ tags: ["dashboard"], summary: "Update the working document (autosave target)", responses: { 200: { description: "Saved", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean(), issues: z.array(z.any()), revision: z.number() })) } } }, 409: { description: "Edited elsewhere since `baseRevision`", content: { "application/json": { schema: resolver(ErrorEnvelope) } } }, 429: { description: "Too many saves", content: { "application/json": { schema: resolver(ErrorEnvelope) } } } } }),
  async (c) => {
    const id = c.get("form")!.id;
    const body = c.req.valid("json");
    const parsed = FormDoc.safeParse(migrateFormDoc(body.doc));
    if (!parsed.success) {
      /*
        The path stays in `issues[]`, where the builder can use it to put the
        message under the control that owns it; the sentence in `message` never
        contains one. The two used to be the same string, and the string was the
        path — so someone typing in a box labelled "Notification emails" was
        shown `settings.onComplete.notificationEmails.0: Invalid email address`.
      */
      const { message, issues } = describeSchemaError(parsed.error);
      return apiError(c, 422, "invalid_doc", message, { issues });
    }
    const doc = await withHashedPassword(parsed.data);
    const issues = lintFormDoc(doc);

    /*
      The document as it stood a moment ago, read before it is overwritten. This is the
      only place the previous state still exists, and without it the history could say
      that the form was saved but never what the save did.

      One indexed point read on the autosave path. The alternative — keeping a snapshot
      per save and diffing later — would store a hundred near-identical copies of a form
      to answer a question a sentence answers.
    */
    const stored = await c.env.DB.prepare(`SELECT working_schema, working_revision FROM forms WHERE id = ?`)
      .bind(id)
      .first<{ working_schema: string; working_revision: number }>();
    const previous = parseStoredDoc(stored?.working_schema);
    const currentRevision = stored?.working_revision ?? 0;

    /*
      The name travels with the document.

      `forms.title` is what the dashboard list, the command palette and every
      email subject read; `doc.title` is what respondents see at the top of the
      chat and what the agent is told the form is called. They were written once
      at creation and never again, so nothing in the product could rename a form
      — and a rename that updated only one of them would give the same form two
      names. One write, from the document, which is the copy the author edits.

      The slug is deliberately left alone: it is the public address, and a
      rename must not break a link that is already out there.
    */
    /*
      Conditional on the revision the editor was looking at, so the second of two
      tabs is told rather than obeyed.

      The write used to be unconditional, which made the save a race with no
      loser's consolation: whoever called last won, and the other author's work
      left no trace but a diff in the activity timeline. The counter is bumped in
      the same statement that does the write, so there is no window between
      checking and claiming.

      A caller that states no revision is applied unconditionally, which is what
      keeps a tab opened before this deployed — and the `/v1` API, which has no
      editor to hold one — working exactly as before.
    */
    const expected = body.baseRevision;
    const sql =
      `UPDATE forms SET working_schema = ?, title = ?, updated_at = ?, working_revision = working_revision + 1` +
      ` WHERE id = ?${expected === undefined ? "" : " AND working_revision = ?"}`;
    const bindings: (string | number)[] = [JSON.stringify(doc), doc.title, Date.now(), id];
    if (expected !== undefined) bindings.push(expected);
    const written = await c.env.DB.prepare(sql).bind(...bindings).run();

    if (expected !== undefined && written.meta.changes === 0) {
      /*
        The document itself is not in this body. It is up to ~80KB on a large
        form, and an error envelope is the wrong place to put one — the builder
        already holds a query for it and refetches on the way into the dialog,
        which costs one request on a path that should be rare.
      */
      return apiError(c, 409, "revision_conflict", "Someone else has edited this form since you opened it", {
        revision: currentRevision,
      });
    }

    /*
      Recorded after the response is on its way. Autosave latency is felt as the editor
      stuttering, and a timeline row is never worth that — nor worth failing a save for,
      hence the swallowed rejection.
    */
    await afterResponse(c, recordDocChange(c.env, {
        formId: id,
        orgId: c.get("form")!.organization_id,
        before: previous,
        after: doc,
        actor: { type: "user", id: c.get("userId") ?? null },
        source: "builder",
      }).catch((err) => console.error("form_activity_failed", err)),);

    // The revision this save produced. The editor holds it and states it on the
    // next one, which is what makes the next conflict detectable.
    return c.json({ ok: true, issues, revision: currentRevision + 1 });
  },
);

/**
 * Take a live form off the air without deleting anything.
 *
 * The only way to stop a published form accepting responses used to be a close
 * date in the future or deleting the form, and neither is what somebody wants
 * when a registration has to stop *now* — one needs planning ahead and the
 * other throws the responses away with the form.
 *
 * `active_version_id` is deliberately left alone. The version is still the
 * form's live document, it is simply not being served; that is what makes
 * republishing a single click that puts the same version back rather than
 * cutting a new one, and it keeps every response still pointing at the version
 * it was collected under.
 *
 * Both respondent-facing entry points gate on `status = 'published'` — the
 * config route and session creation, in `routes/public.ts` — so this closes
 * the public link the moment it lands. Conversations already open are not
 * thrown out mid-sentence: like the close date, this is checked when a session
 * is created and never again.
 */
formsRouter.post(
  "/forms/:id/unpublish",
  describeRoute({
    tags: ["dashboard"],
    summary: "Take a published form off the air, keeping its version and responses",
    responses: {
      200: { description: "Unpublished", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "Form not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      409: { description: "The form is not published", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const id = c.get("form")!.id;
    const userId = c.get("userId") as string;
    const orgId = c.get("form")!.organization_id;

    const row = await c.env.DB.prepare(
      `SELECT status FROM forms WHERE id = ? AND deleted_at IS NULL`,
    )
      .bind(id)
      .first<{ status: string }>();
    if (!row) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    /*
      Said rather than silently succeeding, because "unpublish a draft" is
      almost always a stale tab acting on a form somebody else already took
      down, and a cheerful 200 would tell them they did something they did not.
    */
    if (row.status !== "published") {
      return c.json({ error: { code: "not_published", message: "This form is not live" } }, 409);
    }

    await c.env.DB.prepare(`UPDATE forms SET status = 'draft', updated_at = ?2 WHERE id = ?1`)
      .bind(id, Date.now())
      .run();

    await afterResponse(
      c,
      Promise.all([
        recordFormEvent(c.env, {
          formId: id,
          orgId,
          kind: "unpublished",
          summary: "Taken off the air",
          actor: { type: "user", id: userId },
        }),
        audit(c.env, {
          orgId,
          action: "form.unpublished",
          actorType: "user",
          actorId: userId,
          resourceType: "form",
          resourceId: id,
        }),
      ]).catch((err) => console.error("form_activity_failed", err)),
    );

    return c.json({ ok: true });
  },
);

formsRouter.post(
  "/forms/:id/publish",
  describeRoute({ tags: ["dashboard"], summary: "Publish the working document as a new version", responses: { 200: { description: "Published", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean(), version: z.number(), stripped: z.array(z.object({ path: z.string(), feature: z.string(), label: z.string(), requiredPlan: z.string() })) })) } } }, 402: { description: "A plan limit refuses the publish", content: { "application/json": { schema: resolver(ErrorEnvelope) } } }, 422: { description: "Lint errors", content: { "application/json": { schema: resolver(ErrorEnvelope) } } } } }),
  async (c) => {
    const id = c.get("form")!.id;
    const userId = c.get("userId") as string;
    /*
      An optional label for the version, parsed leniently because the body is optional:
      the builder's Publish button sends nothing at all, and a missing body must not be
      the difference between publishing and a 400.
    */
    const publishNote = await c.req
      .json<{ note?: unknown }>()
      .then((b) => (typeof b?.note === "string" ? b.note.trim().slice(0, 200) || null : null))
      .catch(() => null);
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
    /*
      A checksum that checksums something. This used to be `crypto.randomUUID()`, so the
      column named `checksum` could not answer the one question a checksum exists to
      answer — is the draft still what we published? — and nothing in the product could
      tell a customer whether their last edit was live.

      Fingerprinted from the working document rather than the stripped one, and salted
      with the plan: the same draft publishes differently on Free and on Business, so an
      upgrade correctly marks the form publishable again.
    */
    const checksum = publishFingerprint(row.working_schema, ent.planId);
    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO form_versions (id, form_id, version, schema_json, theme_json, settings_json, checksum, note, published_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(verId, id, version, schemaJson, row.theme_json, row.settings_json, checksum, publishNote, Date.now(), userId, Date.now()),
      c.env.DB.prepare(`UPDATE forms SET status = 'published', active_version_id = ?, updated_at = ? WHERE id = ?`).bind(verId, Date.now(), id),
      /*
        Every edit still marked unpublished now belongs to this version. In the same
        batch as the insert on purpose: a publish that succeeded while its changes were
        left looking unpublished would be a history that lies, and the builder would go
        on offering to publish work that is already live.
      */
      stampVersionStatement(c.env, id, verId),
    ]);

    const orgId = c.get("form")!.organization_id;
    await afterResponse(c, Promise.all([
        recordFormEvent(c.env, {
          formId: id,
          orgId,
          kind: "published",
          summary: publishNote ? `Published v${version} — ${publishNote}` : `Published version ${version}`,
          versionId: verId,
          actor: { type: "user", id: userId },
        }),
        // The org-wide activity log had no idea forms existed. A publish is exactly the
        // kind of thing the admin reading that log is trying to account for.
        audit(c.env, {
          orgId,
          action: "form.published",
          actorType: "user",
          actorId: userId,
          resourceType: "form",
          resourceId: id,
          meta: { version, note: publishNote, stripped: stripped.length },
        }),
      ]).catch((err) => console.error("form_activity_failed", err)),);

    return c.json({ ok: true, version, stripped });
  },
);
