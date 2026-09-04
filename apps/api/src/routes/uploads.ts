import { Hono, type Context } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import {
  requireSession,
  requireOrg,
  requireSessionOwner,
  assertChatSessionAccess,
  type GuardVars,
} from "../lib/guards.js";
import { requireScope, type AuthzVars } from "../lib/authorize.js";
import { getEntitlements, storageBytes } from "../lib/entitlements.js";
import { limitReached } from "@repo/entitlements";

/**
 * File uploads — R2 binding based (no S3 credentials needed).
 * Flow: intent (validate + register pending) → PUT raw body → confirm (HEAD-check + flip).
 * Max 25MB per file (Workers body limit headroom).
 */

const MAX_FILE_MB = 25;

/**
 * Who is allowed to upload into a session.
 *
 * `respondent` is a person answering the form, holding the session's own
 * token. `api_key` is a developer driving that session headlessly — without
 * this, a `file_upload` question was simply unanswerable over the API, which
 * made those forms impossible to complete programmatically.
 *
 * The two are alternatives, never a fallback chain: a respondent request that
 * fails its token check must not get a second chance at an organization check,
 * or a leaked session id plus any valid key would be a way in.
 */
export type UploadMode = "respondent" | "api_key";

type UploadCtx = Context<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>;

/**
 * The session path parameter, which differs by mount.
 *
 * `/v1`'s chat router already registers ownership middleware on
 * `/sessions/:sid/*`, and that middleware reads `sid`. Mounting these routes
 * beside it under a different parameter name would leave it reading an
 * undefined value and 404-ing every upload, so the API-key variant speaks the
 * same spelling.
 */
function paramOf(mode: UploadMode): "id" | "sid" {
  return mode === "respondent" ? "id" : "sid";
}

async function resolveSession(c: UploadCtx, mode: UploadMode): Promise<string | null> {
  if (mode === "respondent") return requireSessionOwner(c);
  const orgId = c.get("orgId");
  const sessionId = c.req.param(paramOf(mode));
  if (!orgId || !sessionId) return null;
  return (await assertChatSessionAccess(c.env, sessionId, orgId)) ? sessionId : null;
}

/**
 * 401 for a respondent whose token is wrong, 404 for a key reaching into
 * another tenant — the cross-tenant convention everywhere else in `/v1` is to
 * never confirm that an id exists.
 */
function denied(c: UploadCtx, mode: UploadMode) {
  return mode === "respondent"
    ? c.json({ error: { code: "unauthorized", message: "Invalid session" } }, 401)
    : c.json({ error: { code: "not_found", message: "Session not found" } }, 404);
}

const ALLOWED_MIME = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf", "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "audio/mpeg", "audio/wav", "video/mp4", "video/webm",
]);

/**
 * One implementation, mounted twice.
 *
 * `/p` gets the respondent-token variant and `/v1` the API-key variant. They
 * are the same three steps against the same rows because a file answered over
 * the API has to be indistinguishable from one answered in the chat — the
 * moment they are two implementations, one of them starts drifting.
 */
export function createUploadsRouter(mode: UploadMode) {
  const uploadsRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();
  const sid = `:${paramOf(mode)}`;

  // Uploading is a write, and a publishable key legitimately holds `file:write`
  // — that is the browser upload case. Reading files back is a separate scope
  // and a separate route.
  if (mode === "api_key") {
    uploadsRouter.use(`/sessions/${sid}/uploads/*`, requireScope("file", "write"));
  }

uploadsRouter.post(
  `/sessions/${sid}/uploads/intent`,
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
    tags: [mode === "respondent" ? "public" : "v1"],
    summary: "Register an upload — returns a fileId to PUT against",
    responses: {
      200: { description: "Intent created", content: { "application/json": { schema: resolver(z.object({ fileId: z.string(), uploadUrl: z.string() })) } } },
      413: { description: "Too large" },
      415: { description: "Unsupported type" },
    },
  }),
  async (c) => {
    const sessionId = await resolveSession(c, mode);
    if (!sessionId) return denied(c, mode);
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
    if (sess?.organization_id) {
      /**
       * Two plan limits, checked before the R2 key is handed out rather than after the
       * bytes land — there is no way to un-upload something.
       *
       * The message a *respondent* sees never mentions plans or billing: a form's file
       * limit is the form owner's business, and telling a stranger filling in a survey to
       * upgrade would be absurd. `too_large` and `storage_full` are the owner's problem to
       * read in the dashboard.
       */
      const ent = await getEntitlements(c.env, sess.organization_id);
      const perFile = ent.limits.max_upload_mb_per_file;
      if (perFile != null && size > perFile * 1024 * 1024) {
        return c.json({ error: { code: "too_large", message: `This form accepts files up to ${perFile}MB` } }, 413);
      }
      const quota = ent.limits.file_storage_mb;
      if (quota != null) {
        const used = await storageBytes(c.env, sess.organization_id);
        if (used + size > quota * 1024 * 1024) {
          return c.json(
            { error: { code: "storage_full", message: "This form cannot accept more file uploads right now." } },
            507,
          );
        }
      }
    }
    if (!sess) return c.json({ error: { code: "not_found", message: "Session not found" } }, 404);

    const fileId = `file_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const r2Key = `uploads/${sess.organization_id}/${sess.form_id}/${sessionId}/${fileId}-${filename.replace(/[^\w.-]/g, "_").slice(0, 80)}`;

    await c.env.DB.prepare(
      `INSERT INTO files (id, organization_id, form_id, session_id, uploaded_by, r2_key, filename, mime, size_bytes, status, created_at)
       VALUES (?, ?, ?, ?, 'respondent', ?, ?, ?, ?, 'pending', ?)`,
    )
      .bind(fileId, sess.organization_id, sess.form_id, sessionId, r2Key, filename, mime, size, Date.now())
      .run();

    const prefix = mode === "respondent" ? "/p" : "/v1";
    return c.json({ fileId, uploadUrl: `${prefix}/sessions/${sessionId}/uploads/${fileId}` });
  },
);

uploadsRouter.put(
  `/sessions/${sid}/uploads/:fileId`,
  describeRoute({
    tags: [mode === "respondent" ? "public" : "v1"],
    summary: "Upload the bytes for a registered intent",
    description:
      "PUT the raw file body — not multipart, not base64 — to the `uploadUrl` returned by the intent step. The declared size must match within 1KB, and the object is not visible to the form until `confirm`.",
    requestBody: {
      required: true,
      content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
    },
    responses: {
      200: { description: "Bytes stored", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      400: { description: "Declared and actual size differ" },
      404: { description: "No such upload intent" },
      413: { description: "Too large" },
    },
  }),
  async (c) => {
    const sessionId = await resolveSession(c, mode);
    if (!sessionId) return denied(c, mode);
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
  },
);

uploadsRouter.post(
  `/sessions/${sid}/uploads/:fileId/confirm`,
  describeRoute({
    tags: [mode === "respondent" ? "public" : "v1"],
    summary: "Confirm an upload — flips pending → confirmed and notifies the session",
    responses: { 200: { description: "Confirmed", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } }, 400: { description: "Not uploaded" }, 404: { description: "Not found" } },
  }),
  async (c) => {
    const sessionId = await resolveSession(c, mode);
    if (!sessionId) return denied(c, mode);
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

  return uploadsRouter;
}

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

/** Builder-owned assets are public and session-less, so they mount on their own. */
export const assetsRouter = new Hono<{ Bindings: Bindings }>();

/**
 * Serve a builder-owned asset publicly.
 *
 * `POST /assets` has always answered with `url: /p/assets/<id>`, and nothing
 * has ever served that path — so every logo, cover image, and social preview
 * a builder uploaded resolved to a 404 the moment it left the upload dialog.
 *
 * Public by design: these are the images on a published form, and a
 * respondent has no session to authenticate with. That is also why the
 * response is pinned to image and font types only. The respondent-upload
 * download route above force-downloads everything precisely because those
 * bytes come from strangers; these come from the tenant, are MIME-checked at
 * upload, and have to render in an `<img>` to be worth anything.
 */
assetsRouter.get("/assets/:id", async (c) => {
  const row = await c.env.DB.prepare(
    `SELECT r2_key, mime FROM files WHERE id = ?1 AND uploaded_by = 'builder' AND status = 'confirmed'`,
  )
    .bind(c.req.param("id"))
    .first<{ r2_key: string; mime: string }>();
  if (!row) return c.json({ error: { code: "not_found", message: "Asset not found" } }, 404);

  // SVG renders script, so it is never served inline from any origin of ours.
  const renderable = /^(image\/(png|jpeg|gif|webp|avif)|font\/)/.test(row.mime);
  const obj = await c.env.R2.get(row.r2_key);
  if (!obj) return c.json({ error: { code: "not_found", message: "Object missing" } }, 404);

  return new Response(obj.body, {
    headers: {
      "content-type": renderable ? row.mime : "application/octet-stream",
      "x-content-type-options": "nosniff",
      // Assets are immutable: the id changes whenever the bytes do.
      "cache-control": "public, max-age=31536000, immutable",
      "content-security-policy": "sandbox; default-src 'none'",
    },
  });
});

/** The respondent-facing router, mounted under `/p`. */
export const uploadsRouter = createUploadsRouter("respondent");
/** The same three steps for a headless caller, mounted under `/v1`. */
export const uploadsV1Router = createUploadsRouter("api_key");

export default uploadsRouter;
