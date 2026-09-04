import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { featureLocked } from "@repo/entitlements";
import type { Bindings } from "../../env.js";
import { keyOwnsForm, type GuardVars } from "../../lib/guards.js";
import { requireScope, entitlementsFor, type AuthzVars } from "../../lib/authorize.js";
import { idempotent } from "../../lib/idempotency.js";
import { enqueueExport, type ExportFilters, type ExportRow } from "../../lib/exports.js";
import { signDownload } from "../../lib/signed-url.js";
import { audit } from "../../lib/gate-log.js";

/**
 * Bulk export, and the file bytes an answer points at.
 *
 * `response:export` and `file:read` were both in the scope vocabulary with no
 * endpoint behind them — a key could be granted an ability that did not exist.
 * These are those abilities.
 */

export const exportsV1Router = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

const ExportView = z.object({
  id: z.string(),
  object: z.literal("export"),
  form_id: z.string(),
  status: z.enum(["queued", "running", "ready", "failed"]),
  format: z.enum(["csv", "json"]),
  row_count: z.number().nullable(),
  bytes: z.number().nullable(),
  error: z.string().nullable(),
  created_at: z.number(),
  completed_at: z.number().nullable(),
  expires_at: z.number().nullable(),
  /** Present only while the export is ready. Short-lived, so re-read to re-mint. */
  download_url: z.string().nullable(),
  download_expires_at: z.number().nullable(),
});

async function project(env: Bindings, row: ExportRow) {
  const signed = row.status === "ready" && row.r2_key ? await signDownload(env, "export", row.id) : null;
  return {
    id: row.id,
    object: "export" as const,
    form_id: row.form_id,
    status: row.status,
    format: row.format,
    row_count: row.row_count,
    bytes: row.bytes,
    error: row.error,
    created_at: row.created_at,
    completed_at: row.completed_at,
    expires_at: row.expires_at,
    download_url: signed?.url ?? null,
    download_expires_at: signed?.expiresAt ?? null,
  };
}

const CreateExport = z.object({
  format: z.enum(["csv", "json"]).default("csv"),
  status: z.array(z.string()).max(6).optional(),
  source: z.string().max(20).optional(),
  mode: z.enum(["live", "test", "all"]).optional(),
  created_after: z.number().optional(),
  created_before: z.number().optional(),
});

exportsV1Router.post(
  "/forms/:id/exports",
  requireScope("response", "export"),
  idempotent("POST /v1/forms/:id/exports"),
  validator("json", CreateExport.optional()),
  describeRoute({
    tags: ["v1"],
    summary: "Start an export of a form's responses",
    description:
      "Returns immediately with a queued export. Poll `GET /v1/exports/{id}` until `status` is `ready`, then follow `download_url`.",
    responses: {
      202: { description: "Export queued", content: { "application/json": { schema: resolver(ExportView) } } },
      402: { description: "Exporting unfinished responses needs a plan that includes them" },
      404: { description: "Form not found" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const formId = c.req.param("id");
    if (!keyOwnsForm(c, formId)) {
      return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    }

    const form = await c.env.DB.prepare(
      `SELECT id FROM forms WHERE id = ? AND organization_id = ? AND deleted_at IS NULL`,
    )
      .bind(formId, orgId)
      .first<{ id: string }>();
    if (!form) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    const body = (c.req.valid("json") ?? {}) as z.infer<typeof CreateExport>;
    const filters: ExportFilters = {
      status: body.status,
      source: body.source,
      mode: body.mode,
      created_after: body.created_after,
      created_before: body.created_before,
    };

    /**
     * Taking your own finished data with you is never the thing behind the
     * paywall. What is gated is the same slice gated everywhere else — the
     * unfinished responses — and, as with the read API, an over-limit request
     * is refused rather than quietly narrowed.
     */
    const statuses = body.status ?? ["completed"];
    const wantsPartials = statuses.some((s) => s === "in_progress" || s === "abandoned" || s === "all");
    if (wantsPartials) {
      const ent = await entitlementsFor(c as never);
      if (!ent.features.export_partials) {
        return c.json(featureLocked("export_partials", ent.planId, { surface: "v1.exports" }), 402);
      }
    }

    const id = await enqueueExport(c.env, {
      orgId,
      formId,
      requestedBy: c.get("keyId") ?? null,
      actorType: "api_key",
      format: body.format ?? "csv",
      filters,
    });

    await audit(c.env, {
      orgId,
      actorType: "api_key",
      actorId: c.get("keyId") ?? null,
      action: "export.requested",
      resourceType: "form",
      resourceId: formId,
      meta: { exportId: id, format: body.format ?? "csv", filters },
    }).catch(() => {});

    const row = await c.env.DB.prepare(`SELECT * FROM exports WHERE id = ?`).bind(id).first<ExportRow>();
    return c.json(await project(c.env, row!), 202);
  },
);

exportsV1Router.get(
  "/exports/:id",
  requireScope("response", "export"),
  describeRoute({
    tags: ["v1"],
    summary: "Check an export and get its download link",
    description:
      "Poll until `status` is `ready`, then follow `download_url`. A `failed` export carries the reason in `error`. The link is re-minted on every read, so read again rather than storing one.",
    responses: {
      200: { description: "The export", content: { "application/json": { schema: resolver(ExportView) } } },
      404: { description: "Export not found" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const row = await c.env.DB.prepare(`SELECT * FROM exports WHERE id = ? AND organization_id = ?`)
      .bind(c.req.param("id"), orgId)
      .first<ExportRow>();
    if (!row || !keyOwnsForm(c, row.form_id)) {
      return c.json({ error: { code: "not_found", message: "Export not found" } }, 404);
    }
    return c.json(await project(c.env, row));
  },
);

exportsV1Router.get(
  "/exports",
  requireScope("response", "export"),
  validator("query", z.object({ form_id: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(25) })),
  describeRoute({
    tags: ["v1"],
    summary: "List recent exports",
    description:
      "Newest first, optionally narrowed to one form. Exports are deleted 24 hours after they are requested, so this is a short window rather than a history.",
    responses: { 200: { description: "Exports, newest first" } },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const q = c.req.valid("query");
    const where = [`organization_id = ?`];
    const binds: unknown[] = [orgId];
    if (q.form_id) {
      where.push(`form_id = ?`);
      binds.push(q.form_id);
    }
    const rows = await c.env.DB.prepare(
      `SELECT * FROM exports WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT ?`,
    )
      .bind(...binds, q.limit)
      .all<ExportRow>();
    const visible = (rows.results ?? []).filter((r) => keyOwnsForm(c, r.form_id));
    return c.json({ data: await Promise.all(visible.map((r) => project(c.env, r))) });
  },
);

// ───────────────────────────── files ─────────────────────────────

const FileView = z.object({
  id: z.string(),
  object: z.literal("file"),
  form_id: z.string().nullable(),
  response_id: z.string().nullable(),
  filename: z.string(),
  mime: z.string(),
  size_bytes: z.number(),
  created_at: z.number(),
  download_url: z.string(),
  download_expires_at: z.number(),
});

exportsV1Router.get(
  "/files/:id",
  requireScope("file", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "A respondent's uploaded file, with a short-lived download link",
    description:
      "File-upload answers carry a `fileId`. This resolves one to its metadata and a signed URL that needs no API key — safe to hand to a browser, and expired within minutes.",
    responses: {
      200: { description: "The file", content: { "application/json": { schema: resolver(FileView) } } },
      404: { description: "File not found" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    const row = await c.env.DB.prepare(
      `SELECT f.id, f.form_id, f.filename, f.mime, f.size_bytes, f.created_at, f.session_id,
              (SELECT s.id FROM submissions s WHERE s.session_id = f.session_id LIMIT 1) AS response_id
         FROM files f
        WHERE f.id = ? AND f.organization_id = ? AND f.status = 'confirmed'`,
    )
      .bind(c.req.param("id"), orgId)
      .first<{
        id: string;
        form_id: string | null;
        filename: string;
        mime: string;
        size_bytes: number;
        created_at: number;
        response_id: string | null;
      }>();
    if (!row || (row.form_id && !keyOwnsForm(c, row.form_id))) {
      return c.json({ error: { code: "not_found", message: "File not found" } }, 404);
    }

    const signed = await signDownload(c.env, "file", row.id);
    return c.json({
      id: row.id,
      object: "file" as const,
      form_id: row.form_id,
      response_id: row.response_id,
      filename: row.filename,
      mime: row.mime,
      size_bytes: row.size_bytes,
      created_at: row.created_at,
      download_url: signed.url,
      download_expires_at: signed.expiresAt,
    });
  },
);

export default exportsV1Router;
