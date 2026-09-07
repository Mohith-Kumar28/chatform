import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { diffFormDoc, summarizeChanges } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { ErrorEnvelope } from "../lib/openapi.js";
import { requireSession, requireOrg, requireFormAccess, type GuardVars } from "../lib/guards.js";
import { requirePermission, type AuthzVars } from "../lib/authorize.js";
import { afterResponse, backfillVersionActivity, loadFormHistory, parseStoredDoc, recordFormEvent, resolveActorNames } from "../lib/form-activity.js";
import { audit } from "../lib/gate-log.js";

/**
 * One form's history: what changed, grouped by the publish it went out in, and the
 * ability to put a published version back.
 *
 * Its own router rather than more routes in `forms.ts` — that file is the write path
 * for the builder and is busy enough, and nothing here writes a document except
 * `restore`, which writes it by copying one that already shipped.
 *
 * Not gated on a plan. `audit_logs` is the Business-tier activity log and answers a
 * different question ("who did what in this organization", read by an admin); this one
 * is the safety net under the editor, and a person who is afraid to experiment because
 * undo costs money builds worse forms.
 */

export const formHistoryRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

formHistoryRouter.use("/forms/:id/history", requireSession, requireOrg, requireFormAccess);
formHistoryRouter.use("/forms/:id/versions", requireSession, requireOrg, requireFormAccess);
formHistoryRouter.use("/forms/:id/versions/*", requireSession, requireOrg, requireFormAccess);

formHistoryRouter.get("/forms/:id/history", requirePermission("form", "read"));
formHistoryRouter.get("/forms/:id/versions", requirePermission("form", "read"));
formHistoryRouter.get("/forms/:id/versions/:version", requirePermission("form", "read"));
// Restoring overwrites the draft, so it is an update — not a publish. Putting a version
// back does not put it live; that still takes a deliberate publish.
formHistoryRouter.post("/forms/:id/versions/:version/restore", requirePermission("form", "update"));

const DocChangeSchema = z.object({
  op: z.string(),
  target: z.string(),
  label: z.string(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const ActivityEntrySchema = z.object({
  id: z.string(),
  kind: z.string(),
  summary: z.string(),
  changes: z.array(DocChangeSchema),
  changeCount: z.number(),
  actorType: z.string(),
  actorLabel: z.string().nullable(),
  source: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const ActivityGroupSchema = z.object({
  version: z.number().nullable(),
  versionId: z.string().nullable(),
  publishedAt: z.number().nullable(),
  note: z.string().nullable(),
  isActive: z.boolean(),
  entries: z.array(ActivityEntrySchema),
});

const VersionSummary = z.object({
  version: z.number(),
  versionId: z.string(),
  note: z.string().nullable(),
  publishedAt: z.number(),
  authorLabel: z.string().nullable(),
  changeCount: z.number(),
  isActive: z.boolean(),
  /** Responses collected against this exact version. What makes rolling back consequential. */
  responses: z.number(),
});

formHistoryRouter.get(
  "/forms/:id/history",
  validator(
    "query",
    z.object({
      limit: z.coerce.number().int().min(1).max(200).default(60),
      before: z.coerce.number().int().optional(),
    }),
  ),
  describeRoute({
    tags: ["dashboard"],
    summary: "This form's change history, grouped by publish",
    responses: {
      200: {
        description: "Groups, newest first, with unpublished work leading",
        content: {
          "application/json": {
            schema: resolver(z.object({ groups: z.array(ActivityGroupSchema), nextBefore: z.number().nullable() })),
          },
        },
      },
    },
  }),
  async (c) => {
    const { limit, before } = c.req.valid("query");
    const form = c.get("form")!;

    /*
      Versions published before this table existed have no changelog of their own, and
      the published document that would explain them is sitting in `form_versions` the
      whole time. Recovered on the first read of the page that would otherwise show the
      gap, and awaited rather than deferred: a timeline that fills itself in a second
      after you look at it is a timeline you have to reload to trust.

      It costs one query on every subsequent load — the count that finds nothing to do —
      and writes only the first time.
    */
    if (before === undefined) {
      await backfillVersionActivity(c.env, form.id, form.organization_id).catch((err) =>
        console.error("form_activity_backfill_failed", err),
      );
    }

    return c.json(await loadFormHistory(c.env, form.id, { limit, before }));
  },
);

formHistoryRouter.get(
  "/forms/:id/versions",
  describeRoute({
    tags: ["dashboard"],
    summary: "Every published version of this form",
    responses: {
      200: { description: "Versions, newest first", content: { "application/json": { schema: resolver(z.array(VersionSummary)) } } },
    },
  }),
  async (c) => {
    const form = c.get("form")!;
    /**
     * The response count is per version, not per form. It is the number that decides
     * whether a rollback is a tidy-up or a decision with consequences: a version nobody
     * answered can be replaced freely, and one with four hundred responses behind it is
     * a schema those answers were recorded against.
     */
    const rows = await c.env.DB.prepare(
      `SELECT v.id, v.version, v.note, v.published_at, v.created_at, v.created_by,
              (SELECT COUNT(*) FROM submissions s WHERE s.form_version_id = v.id AND s.status = 'completed') AS responses,
              (SELECT COUNT(*) FROM form_activity a WHERE a.form_version_id = v.id AND a.kind = 'edited') AS change_entries
         FROM form_versions v
        WHERE v.form_id = ?
        ORDER BY v.version DESC`,
    )
      .bind(form.id)
      .all<{
        id: string;
        version: number;
        note: string | null;
        published_at: number | null;
        created_at: number;
        created_by: string | null;
        responses: number;
        change_entries: number;
      }>();

    const withNames = await resolveActorNames(
      c.env,
      (rows.results ?? []).map((r) => ({ ...r, actor_id: r.created_by, actor_label: null as string | null })),
    );

    return c.json(
      withNames.map((r) => ({
        version: r.version,
        versionId: r.id,
        note: r.note,
        publishedAt: r.published_at ?? r.created_at,
        authorLabel: r.actor_label,
        changeCount: r.change_entries,
        isActive: r.id === form.active_version_id,
        responses: r.responses,
      })),
    );
  },
);

formHistoryRouter.get(
  "/forms/:id/versions/:version",
  validator("query", z.object({ compare: z.coerce.number().int().min(1).optional() })),
  describeRoute({
    tags: ["dashboard"],
    summary: "One published version, optionally diffed against another",
    responses: {
      200: {
        description: "The published document, plus a diff when `compare` is given",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                version: z.number(),
                versionId: z.string(),
                note: z.string().nullable(),
                publishedAt: z.number(),
                doc: z.unknown(),
                comparedTo: z.number().nullable(),
                changes: z.array(DocChangeSchema),
                summary: z.string().nullable(),
              }),
            ),
          },
        },
      },
      404: { description: "No such version", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const form = c.get("form")!;
    const version = Number(c.req.param("version"));
    if (!Number.isInteger(version) || version < 1) {
      return c.json({ error: { code: "not_found", message: "No such version" } }, 404);
    }
    const { compare } = c.req.valid("query");

    const row = await loadVersion(c.env, form.id, version);
    if (!row) return c.json({ error: { code: "not_found", message: "No such version" } }, 404);

    const doc = parseStoredDoc(row.schema_json);

    /**
     * `compare` defaults to nothing rather than to the previous version. Diffing is a
     * second query and a second parse, and the list screen only needs the document —
     * the caller asks for the comparison when it is about to show one.
     */
    let changes: ReturnType<typeof diffFormDoc> = [];
    let comparedTo: number | null = null;
    if (compare && compare !== version && doc) {
      const other = await loadVersion(c.env, form.id, compare);
      const otherDoc = parseStoredDoc(other?.schema_json ?? null);
      if (otherDoc) {
        // Older on the left: the diff reads as "what this version changed", which is
        // the same direction as everything else on the screen.
        const [before, after] = compare < version ? [otherDoc, doc] : [doc, otherDoc];
        changes = diffFormDoc(before, after);
        comparedTo = compare;
      }
    }

    return c.json({
      version: row.version,
      versionId: row.id,
      note: row.note,
      publishedAt: row.published_at ?? row.created_at,
      doc,
      comparedTo,
      changes,
      summary: comparedTo === null ? null : summarizeChanges(changes),
    });
  },
);

formHistoryRouter.post(
  "/forms/:id/versions/:version/restore",
  describeRoute({
    tags: ["dashboard"],
    summary: "Restore a published version into the working document",
    responses: {
      200: {
        description: "The draft now matches that version",
        content: {
          "application/json": {
            schema: resolver(
              z.object({ ok: z.boolean(), version: z.number(), summary: z.string(), changes: z.array(DocChangeSchema), doc: z.unknown() }),
            ),
          },
        },
      },
      404: { description: "No such version", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      422: { description: "That version cannot be read", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const form = c.get("form")!;
    const userId = c.get("userId") as string;
    const version = Number(c.req.param("version"));
    if (!Number.isInteger(version) || version < 1) {
      return c.json({ error: { code: "not_found", message: "No such version" } }, 404);
    }

    const row = await loadVersion(c.env, form.id, version);
    if (!row) return c.json({ error: { code: "not_found", message: "No such version" } }, 404);

    const restored = parseStoredDoc(row.schema_json);
    if (!restored) {
      return c.json({ error: { code: "invalid_doc", message: "That version cannot be read" } }, 422);
    }

    const current = await c.env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ? AND deleted_at IS NULL`)
      .bind(form.id)
      .first<{ working_schema: string }>();
    const before = parseStoredDoc(current?.working_schema);
    const changes = before ? diffFormDoc(before, restored) : [];

    /**
     * Restoring writes the draft, not the live form.
     *
     * The alternative — swinging `active_version_id` back — is one click and it changes
     * what respondents see mid-session, with no chance to look at what you restored
     * first. This way the recovery is reversible right up until someone publishes it,
     * and the publish is the same deliberate act it always is.
     */
    await c.env.DB.prepare(`UPDATE forms SET working_schema = ?, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(restored), Date.now(), form.id)
      .run();

    const summary =
      changes.length === 0
        ? `Restored version ${version} (no change to the draft)`
        : `Restored version ${version} — ${summarizeChanges(changes)}`;

    await afterResponse(c, Promise.all([
        recordFormEvent(c.env, {
          formId: form.id,
          orgId: form.organization_id,
          kind: "restored",
          summary,
          changes,
          actor: { type: "user", id: userId },
        }),
        audit(c.env, {
          orgId: form.organization_id,
          action: "form.restored",
          actorType: "user",
          actorId: userId,
          resourceType: "form",
          resourceId: form.id,
          meta: { version, changes: changes.length },
        }),
      ]).catch((err) => console.error("form_activity_failed", err)),);

    /*
      The restored document comes back with the response so the builder can swap its
      store over immediately. Without it the editor would still be holding the document
      it had a moment ago, and its next autosave would quietly undo the restore.
    */
    return c.json({ ok: true, version, summary, changes, doc: restored });
  },
);

interface VersionRow {
  id: string;
  version: number;
  note: string | null;
  schema_json: string;
  published_at: number | null;
  created_at: number;
}

function loadVersion(env: Bindings, formId: string, version: number): Promise<VersionRow | null> {
  return env.DB.prepare(
    `SELECT id, version, note, schema_json, published_at, created_at FROM form_versions WHERE form_id = ? AND version = ?`,
  )
    .bind(formId, version)
    .first<VersionRow>();
}
