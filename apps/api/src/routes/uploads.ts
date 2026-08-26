import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, requireSessionOwner, type GuardVars } from "../lib/guards.js";

/**
 * File uploads — R2 binding based (no S3 credentials needed).
 * Flow: intent (validate + register pending) → PUT raw body → confirm (HEAD-check + flip).
 * Max 25MB per file (Workers body limit headroom).
 */

const MAX_FILE_MB = 25;

export const uploadsRouter = new Hono<{ Bindings: Bindings }>();

const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf", "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "audio/mpeg", "audio/wav", "video/mp4", "video/webm",
]);

uploadsRouter.post(
  "/sessions/:id/uploads/intent",
  validator(
    "json",
    z.object({
      ref: z.string(),
      filename: z.string().min(1).max(300),
      mime: z.string().min(3).max(120),
      size: z.number().int().min(1).max(MAX_FILE_MB * 1024 * 1024),
    }),
  ),
  describeRoute({
    tags: ["public"],
    summary: "Register an upload — returns a fileId to PUT against",
    responses: {
      200: { description: "Intent created", content: { "application/json": { schema: resolver(z.object({ fileId: z.string(), uploadUrl: z.string() })) } } },
      413: { description: "Too large" },
      415: { description: "Unsupported type" },
    },
  }),
  async (c) => {
    const sessionId = await requireSessionOwner(c);
    if (!sessionId) return c.json({ error: { code: "unauthorized", message: "Invalid session" } }, 401);
    const { ref, filename, mime, size } = c.req.valid("json");

    if (!ALLOWED_MIME.has(mime)) {
      return c.json({ error: { code: "unsupported_type", message: `File type ${mime} is not allowed` } }, 415);
    }
    if (size > MAX_FILE_MB * 1024 * 1024) {
      return c.json({ error: { code: "too_large", message: `Max ${MAX_FILE_MB}MB` } }, 413);
    }

    const sess = await c.env.DB.prepare(`SELECT form_id, organization_id FROM chat_sessions WHERE id = ?`)
      .bind(sessionId)
      .first<{ form_id: string; organization_id: string }>();
    if (!sess) return c.json({ error: { code: "not_found", message: "Session not found" } }, 404);

    const fileId = `file_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const r2Key = `uploads/${sess.organization_id}/${sess.form_id}/${sessionId}/${fileId}-${filename.replace(/[^\w.-]/g, "_").slice(0, 80)}`;

    await c.env.DB.prepare(
      `INSERT INTO files (id, organization_id, form_id, session_id, uploaded_by, r2_key, filename, mime, size_bytes, status, created_at)
       VALUES (?, ?, ?, ?, 'respondent', ?, ?, ?, ?, 'pending', ?)`,
    )
      .bind(fileId, sess.organization_id, sess.form_id, sessionId, r2Key, filename, mime, size, Date.now())
      .run();

    return c.json({ fileId, uploadUrl: `/p/sessions/${sessionId}/uploads/${fileId}` });
  },
);

uploadsRouter.put("/sessions/:id/uploads/:fileId", async (c) => {
  const sessionId = await requireSessionOwner(c);
  if (!sessionId) return c.json({ error: { code: "unauthorized", message: "Invalid session" } }, 401);
  const fileId = c.req.param("fileId");

  const file = await c.env.DB.prepare(`SELECT r2_key, size_bytes, status FROM files WHERE id = ? AND session_id = ?`)
    .bind(fileId, sessionId)
    .first<{ r2_key: string; size_bytes: number; status: string }>();
  if (!file || file.status !== "pending") return c.json({ error: { code: "not_found", message: "Upload intent not found" } }, 404);

  const body = await c.req.arrayBuffer();
  if (body.byteLength > MAX_FILE_MB * 1024 * 1024) {
    return c.json({ error: { code: "too_large", message: `Max ${MAX_FILE_MB}MB` } }, 413);
  }
  if (Math.abs(body.byteLength - file.size_bytes) > 1024) {
    return c.json({ error: { code: "size_mismatch", message: "Uploaded size differs from declared" } }, 400);
  }

  await c.env.R2.put(file.r2_key, body, {
    httpMetadata: { contentType: c.req.header("content-type") ?? "application/octet-stream" },
  });
  return c.json({ ok: true });
});

uploadsRouter.post(
  "/sessions/:id/uploads/:fileId/confirm",
  describeRoute({
    tags: ["public"],
    summary: "Confirm an upload — flips pending → confirmed and notifies the session",
    responses: { 200: { description: "Confirmed", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } }, 400: { description: "Not uploaded" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const sessionId = await requireSessionOwner(c);
    if (!sessionId) return c.json({ error: { code: "unauthorized", message: "Invalid session" } }, 401);
    const fileId = c.req.param("fileId");

    const file = await c.env.DB.prepare(`SELECT r2_key, filename, mime, size_bytes, status, session_id FROM files WHERE id = ? AND session_id = ?`)
      .bind(fileId, sessionId)
      .first<{ r2_key: string; filename: string; mime: string; size_bytes: number; status: string; session_id: string }>();
    if (!file || file.status !== "pending") return c.json({ error: { code: "not_found", message: "Upload intent not found" } }, 404);

    const obj = await c.env.R2.head(file.r2_key);
    if (!obj) return c.json({ error: { code: "not_uploaded", message: "File body missing — PUT first" } }, 400);
    if (obj.size > MAX_FILE_MB * 1024 * 1024) {
      await c.env.R2.delete(file.r2_key);
      return c.json({ error: { code: "too_large", message: `Max ${MAX_FILE_MB}MB` } }, 413);
    }

    await c.env.DB.prepare(`UPDATE files SET status = 'confirmed', confirmed_at = ? WHERE id = ?`).bind(Date.now(), fileId).run();

    // notify the session DO so it can emit upload_received + proceed
    const { SessionDO } = await import("../do/session-do.js");
    const stub = c.env.SESSION_DO.get(c.env.SESSION_DO.idFromName(sessionId)) as unknown as InstanceType<typeof SessionDO>;
    await stub.notifyUpload(fileId, {
      fileId,
      filename: file.filename,
      mime: file.mime,
      size: obj.size,
      r2Key: file.r2_key,
    });

    return c.json({ ok: true, file: { fileId, filename: file.filename, mime: file.mime, size: obj.size, r2Key: file.r2_key } });
  },
);

// ─── dashboard: list + download files for a form ───

export const filesAdminRouter = new Hono<{ Bindings: Bindings; Variables: Partial<GuardVars> }>();

filesAdminRouter.use("*", requireSession);
filesAdminRouter.use("*", requireOrg);

/**
 * Builder-owned assets: question media, cover images, favicons.
 *
 * Distinct from respondent uploads, which are scoped to a chat session. These
 * belong to the organization and are served publicly, because a respondent
 * must be able to see the image attached to a question.
 */
const ASSET_MIME = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "video/mp4", "video/webm",
  "application/pdf", "text/csv", "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const MAX_ASSET_MB = 25;

filesAdminRouter.post("/assets", async (c) => {
  const orgId = c.get("orgId");
  const userId = c.get("userId");
  if (!orgId || !userId) return c.json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);

  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return c.json({ error: { code: "no_file", message: "Send a file" } }, 400);
  }
  if (!ASSET_MIME.has(file.type)) {
    return c.json({ error: { code: "unsupported_type", message: `${file.type} is not allowed` } }, 415);
  }
  if (file.size > MAX_ASSET_MB * 1024 * 1024) {
    return c.json({ error: { code: "too_large", message: `Max ${MAX_ASSET_MB}MB` } }, 413);
  }

  const fileId = `ast_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  const r2Key = `assets/${orgId}/${fileId}-${safeName}`;

  await c.env.R2.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });
  await c.env.DB.prepare(
    `INSERT INTO files (id, organization_id, uploaded_by, uploader_user_id, r2_key, filename, mime, size_bytes, status, created_at, confirmed_at)
     VALUES (?, ?, 'builder', ?, ?, ?, ?, ?, 'confirmed', ?, ?)`,
  )
    .bind(fileId, orgId, userId, r2Key, safeName, file.type, file.size, Date.now(), Date.now())
    .run();

  return c.json({
    fileId,
    key: r2Key,
    url: `/p/assets/${fileId}`,
    filename: safeName,
    mime: file.type,
    sizeBytes: file.size,
  });
});

filesAdminRouter.get("/files/:id/download", async (c) => {
  const fileId = c.req.param("id");
  const orgId = c.get("orgId");
  // Scope by organization: a file id from another tenant must 404.
  const row = await c.env.DB.prepare(
    `SELECT r2_key, filename, mime FROM files WHERE id = ? AND organization_id = ? AND status = 'confirmed'`,
  )
    .bind(fileId, orgId ?? "")
    .first<{ r2_key: string; filename: string; mime: string }>();
  if (!row) return c.json({ error: { code: "not_found", message: "File not found" } }, 404);
  const obj = await c.env.R2.get(row.r2_key);
  if (!obj) return c.json({ error: { code: "not_found", message: "Object missing" } }, 404);
  // Respondent-supplied bytes are never served with a renderable content type
  // from an origin that holds auth cookies. Force download + sandbox.
  return new Response(obj.body, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${row.filename.replace(/[""\r\n]/g, "")}"`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
    },
  });
});

export default uploadsRouter;
