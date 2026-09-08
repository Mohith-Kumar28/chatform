import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { diffFormDoc, summarizeChanges } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { ErrorEnvelope } from "../lib/openapi.js";
import { requireSession, requireOrg, requireFormAccess, type GuardVars } from "../lib/guards.js";
import { requirePermission, type AuthzVars } from "../lib/authorize.js";
import { afterResponse, backfillVersionActivity, loadFormHistory, parseStoredDoc } from "../lib/form-activity.js";
import { listVersions, readVersion, restoreVersion } from "../lib/versions-service.js";

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
  async (c) => c.json(await listVersions(c.env, c.get("form")!)),
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
    const version = Number(c.req.param("version"));
    if (!Number.isInteger(version) || version < 1) {
      return c.json({ error: { code: "not_found", message: "No such version" } }, 404);
    }
    const found = await readVersion(c.env, c.get("form")!.id, version, c.req.valid("query").compare);
    if (!found) return c.json({ error: { code: "not_found", message: "No such version" } }, 404);
    return c.json(found);
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
    const version = Number(c.req.param("version"));
    if (!Number.isInteger(version) || version < 1) {
      return c.json({ error: { code: "not_found", message: "No such version" } }, 404);
    }

    const done = await restoreVersion(c.env, form, version, { type: "user", id: c.get("userId") as string });
    if (done === null) return c.json({ error: { code: "not_found", message: "No such version" } }, 404);
    if (done === "invalid") {
      return c.json({ error: { code: "invalid_doc", message: "That version cannot be read" } }, 422);
    }

    const { sideEffects, ...body } = done;
    await afterResponse(c, sideEffects);
    /*
      The restored document comes back with the response so the builder can swap its
      store over immediately. Without it the editor would still be holding the document
      it had a moment ago, and its next autosave would quietly undo the restore.
    */
    return c.json(body);
  },
);
