import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { readFormDoc, toPublicConfig } from "@repo/form-schema";
import type { Bindings } from "../../env.js";
import { keyOwnsForm, type GuardVars } from "../../lib/guards.js";
import { requireScope, entitlementsFor, type AuthzVars } from "../../lib/authorize.js";
import { idempotent } from "../../lib/idempotency.js";
import { parseDoc, publishForm, saveWorkingDoc } from "../../lib/forms-service.js";
import { clampForRuntime, brandingHiddenFor } from "../../lib/doc-entitlements.js";
import { decodeCursor, paginate } from "../../lib/cursor.js";
import { getEntitlements } from "../../lib/entitlements.js";

/**
 * Forms, programmatically.
 *
 * Everything the builder writes, writeable over HTTP — which is what makes the
 * product driveable by a customer's own tooling rather than only by a person in
 * a browser.
 */

export const formsV1Router = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

interface FormRecord {
  id: string;
  title: string;
  slug: string;
  status: string;
  active_version_id: string | null;
  created_at: number;
  updated_at: number;
}

const ListQuery = z.object({
  status: z.enum(["draft", "published", "archived", "all"]).default("published"),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

formsV1Router.get(
  "/forms",
  requireScope("form", "read"),
  validator("query", ListQuery),
  describeRoute({
    tags: ["v1"],
    summary: "List forms",
    responses: { 200: { description: "A page of forms" }, 400: { description: "Malformed cursor" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const q = c.req.valid("query");

    const where = [`organization_id = ?`, `deleted_at IS NULL`];
    const binds: unknown[] = [orgId];
    if (q.status !== "all") {
      where.push(`status = ?`);
      binds.push(q.status);
    }
    // A key pinned to specific forms may not enumerate the others.
    const pinned = c.get("keyMeta")?.formIds;
    if (pinned?.length) {
      where.push(`id IN (${pinned.map(() => "?").join(",")})`);
      binds.push(...pinned);
    }
    if (q.cursor) {
      const cursor = decodeCursor(c.env, q.cursor);
      if (!cursor) return c.json({ error: { code: "invalid_cursor", message: "That cursor is not valid" } }, 400);
      where.push(`(updated_at < ? OR (updated_at = ? AND id < ?))`);
      binds.push(cursor.sort, cursor.sort, cursor.id);
    }

    const rows = await c.env.DB.prepare(
      `SELECT id, title, slug, status, active_version_id, created_at, updated_at FROM forms
        WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, id DESC LIMIT ?`,
    )
      .bind(...binds, q.limit + 1)
      .all<FormRecord>();

    const page = paginate(c.env, rows.results ?? [], q.limit, "updated", (r) => r.updated_at);
    return c.json({
      data: page.data.map((f) => ({
        id: f.id,
        title: f.title,
        slug: f.slug,
        status: f.status,
        published: f.active_version_id !== null,
        created_at: f.created_at,
        updated_at: f.updated_at,
      })),
      has_more: page.has_more,
      next_cursor: page.next_cursor,
    });
  },
);

formsV1Router.get(
  "/forms/:id",
  requireScope("form", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "Read a form — its public config, or the document behind it",
    responses: { 200: { description: "Form" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const id = c.req.param("id");
    if (!keyOwnsForm(c, id)) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const view = c.req.query("view") === "document" ? "document" : "public";

    if (view === "document") {
      const row = await c.env.DB.prepare(
        `SELECT working_schema, slug, status FROM forms WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
      )
        .bind(id, orgId)
        .first<{ working_schema: string; slug: string; status: string }>();
      if (!row) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
      return c.json({ id, slug: row.slug, status: row.status, doc: readFormDoc(JSON.parse(row.working_schema)) });
    }

    const row = await c.env.DB.prepare(
      `SELECT fv.schema_json, f.slug FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
        WHERE f.id = ? AND f.organization_id = ? AND f.status = 'published' AND f.deleted_at IS NULL`,
    )
      .bind(id, orgId)
      .first<{ schema_json: string; slug: string }>();
    if (!row) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    /**
     * The same projection a respondent gets, clamped by the same plan.
     *
     * The old handler read `hidePoweredBy` straight off the document and
     * hardcoded the result, so a free organization that flipped the toggle got
     * `brandingHidden: true` from the API while `/p` correctly put the watermark
     * back — two surfaces disagreeing about the same form.
     */
    const ent = await getEntitlements(c.env, orgId);
    const doc = clampForRuntime(readFormDoc(JSON.parse(row.schema_json)), ent);
    return c.json(toPublicConfig(doc, { slug: row.slug, brandingHidden: brandingHiddenFor(doc, ent) }));
  },
);

formsV1Router.post(
  "/forms",
  requireScope("form", "write"),
  idempotent("POST /v1/forms"),
  validator("json", z.object({ title: z.string().min(1).max(200), doc: z.unknown().optional() })),
  describeRoute({
    tags: ["v1"],
    summary: "Create a form",
    responses: { 201: { description: "Created" }, 422: { description: "The document is invalid" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const userId = c.get("userId") ?? null;
    const body = c.req.valid("json");

    const workspace = await c.env.DB.prepare(
      `SELECT id FROM workspaces WHERE organization_id = ? ORDER BY created_at ASC LIMIT 1`,
    )
      .bind(orgId)
      .first<{ id: string }>();
    if (!workspace) {
      return c.json({ error: { code: "no_workspace", message: "This organization has no workspace" } }, 422);
    }

    let doc;
    if (body.doc !== undefined) {
      const parsed = parseDoc(body.doc);
      if (!parsed.ok) return c.json({ error: { code: parsed.code, message: parsed.message } }, parsed.status);
      doc = parsed.doc;
    } else {
      const { FormDoc } = await import("@repo/form-schema");
      /**
       * A blank form is still materialised through the schema.
       *
       * Storing an unvalidated shell is what once made every consumer reading
       * nested settings crash — the defaults have to be real.
       */
      doc = FormDoc.parse({
        title: body.title,
        blocks: [{ id: `blk_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`, ref: "q_first", type: "short_text", title: "Your first question" }],
        endings: [{ id: `end_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`, ref: "end_thanks", title: "Thanks!" }],
      });
    }

    const id = `frm_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const slug = `${body.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "form"}-${crypto.randomUUID().slice(0, 6)}`;
    const now = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
    )
      .bind(id, orgId, workspace.id, userId, body.title, slug, JSON.stringify(doc), crypto.randomUUID().slice(0, 12), now, now)
      .run();

    return c.json({ id, title: body.title, slug, status: "draft", published: false, created_at: now, updated_at: now }, 201);
  },
);

formsV1Router.put(
  "/forms/:id/doc",
  requireScope("form", "write"),
  validator("json", z.object({ doc: z.unknown() })),
  describeRoute({
    tags: ["v1"],
    summary: "Replace the working document, returning lint issues",
    responses: { 200: { description: "Saved, with issues" }, 404: { description: "Not found" }, 422: { description: "Invalid" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const id = c.req.param("id");
    if (!keyOwnsForm(c, id)) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    const exists = await c.env.DB.prepare(
      `SELECT id FROM forms WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
    )
      .bind(id, orgId)
      .first();
    if (!exists) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    const parsed = parseDoc(c.req.valid("json").doc);
    if (!parsed.ok) return c.json({ error: { code: parsed.code, message: parsed.message } }, parsed.status);
    await saveWorkingDoc(c.env, id, parsed.doc);
    /**
     * Issues are returned, not enforced. Saving a draft with problems in it is
     * the normal state of building one; publishing is where they become errors.
     */
    return c.json({ ok: true, issues: parsed.issues });
  },
);

formsV1Router.post(
  "/forms/:id/publish",
  requireScope("form", "publish"),
  idempotent("POST /v1/forms/:id/publish"),
  describeRoute({
    tags: ["v1"],
    summary: "Publish the working document as a new immutable version",
    responses: {
      200: { description: "Published" },
      402: { description: "A plan limit refuses the publish" },
      404: { description: "Not found" },
      422: { description: "Lint errors" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const id = c.req.param("id");
    if (!keyOwnsForm(c, id)) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    const owned = await c.env.DB.prepare(
      `SELECT id FROM forms WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
    )
      .bind(id, orgId)
      .first();
    if (!owned) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    const ent = await entitlementsFor(c as never);
    const result = await publishForm(c.env, { formId: id, userId: c.get("userId") ?? null, ent });
    if (!result.ok) return c.json(result.body as never, result.status);
    return c.json({ ok: true, version: result.version, versionId: result.versionId, stripped: result.stripped });
  },
);

formsV1Router.delete(
  "/forms/:id",
  requireScope("form", "write"),
  describeRoute({
    tags: ["v1"],
    summary: "Delete a form (soft — responses are kept)",
    responses: { 200: { description: "Deleted" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const id = c.req.param("id");
    if (!keyOwnsForm(c, id)) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const res = await c.env.DB.prepare(
      `UPDATE forms SET deleted_at = ?, status = 'archived' WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
    )
      .bind(Date.now(), id, orgId)
      .run();
    if ((res.meta?.changes ?? 0) === 0) {
      return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    }
    // Soft, so the responses collected against it stay readable and exportable.
    return c.json({ ok: true, deleted: true });
  },
);
