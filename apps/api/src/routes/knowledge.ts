import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { ErrorEnvelope } from "../lib/openapi.js";
import { requireSession, requireOrg, requireFormAccess, keyOwnsForm, type GuardVars } from "../lib/guards.js";
import { requirePermission, requireScope, type AuthzVars } from "../lib/authorize.js";
import { getEntitlements } from "../lib/entitlements.js";
import { can, limitOf, featureLocked, limitReached, GATE_STATUS, type GateErrorBody } from "@repo/entitlements";
import {
  createSource,
  deleteSource,
  expandCrawl,
  knowledgeBytes,
  countSources,
  listSources,
  CRAWL_PAGE_CAP,
} from "../lib/knowledge-service.js";

/**
 * The knowledge base's CRUD.
 *
 * Knowledge used to ride inside the form document, so it had no endpoints of
 * its own — autosaving the document saved it. It is now rows and vectors, and
 * a 40MB PDF is not something to put through a document autosave, so it needs
 * these.
 *
 * ## Where the plan is enforced
 *
 * At the point of adding, not at publish. The old design stripped over-quota
 * knowledge in `stripForPublish`, which meant an author on the free plan typed
 * a knowledge base, saw it saved, and only discovered it had been discarded
 * when the published form did not know anything. Refusing the upload puts the
 * refusal where the author is looking.
 */

/**
 * Which surface this router is mounted on.
 *
 * One implementation, mounted twice — the same shape `uploads.ts` uses, and for
 * the same reason: a knowledge base built over the API has to be
 * indistinguishable from one built in the builder, and the moment they are two
 * implementations one of them starts drifting.
 */
export type KnowledgeMode = "dashboard" | "api_key";

export function createKnowledgeRouter(mode: KnowledgeMode) {
  const knowledgeRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();
  const tag = mode === "dashboard" ? "dashboard" : "v1";

  if (mode === "dashboard") {
    knowledgeRouter.use("*", requireSession);
    knowledgeRouter.use("*", requireOrg);
    // Same convention as `routes/forms.ts`: a form id from another tenant 404s
    // in the middleware and never reaches a handler.
    knowledgeRouter.use("/forms/:id/knowledge", requireFormAccess);
    knowledgeRouter.use("/forms/:id/knowledge/*", requireFormAccess);
    knowledgeRouter.post("/forms/:id/knowledge/*", requirePermission("form", "update"));
    knowledgeRouter.delete("/forms/:id/knowledge/*", requirePermission("form", "update"));
  } else {
    /*
     * Knowledge is part of authoring a form, so it rides `form:read` and
     * `form:write` rather than earning scopes of its own. A key that may
     * rewrite the questions may certainly change what the agent knows; a
     * read-only key may see the sources and their status, which is what makes
     * an ingest failure diagnosable from outside the dashboard.
     */
    knowledgeRouter.use("/forms/:id/knowledge", requireScope("form", "read"));
    knowledgeRouter.post("/forms/:id/knowledge/*", requireScope("form", "write"));
    knowledgeRouter.delete("/forms/:id/knowledge/*", requireScope("form", "write"));
  }

  /**
   * Ownership, for the key surface.
   *
   * The dashboard's `requireFormAccess` middleware has already 404'd anything
   * cross-tenant by the time a handler runs. A key has no such middleware here,
   * so every handler checks — and answers 404 rather than 403, the convention
   * everywhere in `/v1`: never confirm that another tenant's id exists.
   */
  const owns = (c: { get: (k: "orgId") => string | undefined }, formId: string): boolean =>
    mode === "dashboard" || keyOwnsForm(c as never, formId);

/**
 * What an author may upload as knowledge.
 *
 * The set `toMarkdown` reads, plus audio for Whisper and the plain-text types
 * that need no conversion at all. Deliberately not the asset allow-list: a
 * video is a legitimate answer to a file question and not a legitimate thing
 * to try to embed.
 */
const KNOWLEDGE_MIME = new Set([
  "application/pdf",
  "text/plain", "text/markdown", "text/csv", "text/html", "application/xml", "text/xml", "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp", "image/svg+xml",
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/webm", "audio/mp4", "audio/m4a", "audio/x-m4a",
]);

const MAX_KNOWLEDGE_MB = 25;

const SourceOut = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  origin: z.string().nullable(),
  status: z.string(),
  error: z.string().nullable(),
  bytes: z.number(),
  chunkCount: z.number(),
  createdAt: z.number(),
  indexedAt: z.number().nullable(),
});

const ListOut = z.object({
  sources: z.array(SourceOut),
  usage: z.object({
    bytes: z.number(),
    maxBytes: z.number().nullable(),
    count: z.number(),
    maxCount: z.number().nullable(),
  }),
  /** False when the plan has no knowledge base at all — the UI shows the paywall. */
  enabled: z.boolean(),
});

/**
 * Check the plan before writing anything.
 *
 * `addingBytes` is what the new source is expected to cost. For an upload that
 * is the file size, which is an over-estimate of the extracted text — better
 * that way round than admitting a file we then cannot store.
 */
async function gate(
  env: Bindings,
  orgId: string,
  formId: string,
  addingBytes: number,
  addingCount: number,
): Promise<{ body: GateErrorBody; status: 402 | 403 } | null> {
  const ent = await getEntitlements(env, orgId);

  if (!can(ent, "agent_knowledge")) {
    return { body: featureLocked("agent_knowledge", ent.planId), status: GATE_STATUS.feature_locked };
  }

  const maxBytes = limitOf(ent, "knowledge_bytes");
  if (maxBytes != null) {
    const used = await knowledgeBytes(env, formId);
    if (used + addingBytes > maxBytes) {
      return {
        body: limitReached({ limitKey: "knowledge_bytes", plan: ent.planId, used, limit: maxBytes }),
        status: GATE_STATUS.limit_reached,
      };
    }
  }

  const maxCount = limitOf(ent, "knowledge_sources_count");
  if (maxCount != null) {
    const used = await countSources(env, formId);
    if (used + addingCount > maxCount) {
      return {
        body: limitReached({ limitKey: "knowledge_sources_count", plan: ent.planId, used, limit: maxCount }),
        status: GATE_STATUS.limit_reached,
      };
    }
  }
  return null;
}

knowledgeRouter.get(
  "/forms/:id/knowledge",
  describeRoute({
    tags: [tag],
    summary: "List a form's knowledge sources",
    responses: {
      200: { description: "Sources", content: { "application/json": { schema: resolver(ListOut) } } },
    },
  }),
  async (c) => {
    const formId = c.req.param("id");
    if (!owns(c, formId)) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const ent = await getEntitlements(c.env, c.get("orgId")!);
    const sources = await listSources(c.env, formId);
    return c.json({
      sources: sources.map((s) => ({
        id: s.id,
        kind: s.kind,
        title: s.title,
        origin: s.origin,
        status: s.status,
        error: s.error,
        bytes: s.bytes,
        chunkCount: s.chunkCount,
        createdAt: s.createdAt,
        indexedAt: s.indexedAt,
      })),
      usage: {
        bytes: sources.filter((s) => s.status !== "failed").reduce((n, s) => n + s.bytes, 0),
        maxBytes: limitOf(ent, "knowledge_bytes"),
        count: sources.filter((s) => s.status !== "failed").length,
        maxCount: limitOf(ent, "knowledge_sources_count"),
      },
      enabled: can(ent, "agent_knowledge"),
    });
  },
);

knowledgeRouter.post(
  "/forms/:id/knowledge/text",
  validator("json", z.object({ title: z.string().min(1).max(200), body: z.string().min(1).max(500_000) })),
  describeRoute({
    tags: [tag],
    summary: "Add pasted text as knowledge",
    responses: {
      200: { description: "Added", content: { "application/json": { schema: resolver(z.object({ id: z.string() })) } } },
      402: { description: "Plan limit", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const formId = c.req.param("id");
    if (!owns(c, formId)) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const body = c.req.valid("json");
    const denied = await gate(c.env, c.get("orgId")!, formId, new TextEncoder().encode(body.body).length, 1);
    if (denied) return c.json(denied.body, denied.status);

    const id = await createSource(c.env, {
      organizationId: c.get("orgId")!,
      formId,
      kind: "text",
      title: body.title,
      rawText: body.body,
    });
    return c.json({ id });
  },
);

knowledgeRouter.post(
  "/forms/:id/knowledge/link",
  validator("json", z.object({ url: z.url().max(2000), title: z.string().max(200).optional() })),
  describeRoute({
    tags: [tag],
    summary: "Add a web page as knowledge",
    responses: {
      200: { description: "Added", content: { "application/json": { schema: resolver(z.object({ id: z.string() })) } } },
      402: { description: "Plan limit", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const formId = c.req.param("id");
    if (!owns(c, formId)) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const { url, title } = c.req.valid("json");
    if (!/^https?:$/.test(new URL(url).protocol)) {
      return c.json({ error: { code: "bad_url", message: "Only http and https pages can be read." } }, 400);
    }
    // A page's size is unknown until it is read; charge a nominal amount so a
    // form at its ceiling cannot add unlimited links.
    const denied = await gate(c.env, c.get("orgId")!, formId, 0, 1);
    if (denied) return c.json(denied.body, denied.status);

    const id = await createSource(c.env, {
      organizationId: c.get("orgId")!,
      formId,
      kind: "link",
      title: title || new URL(url).hostname,
      origin: url,
    });
    return c.json({ id });
  },
);

knowledgeRouter.post(
  "/forms/:id/knowledge/crawl",
  validator("json", z.object({ url: z.url().max(2000), pages: z.number().int().min(1).max(CRAWL_PAGE_CAP).optional() })),
  describeRoute({
    tags: [tag],
    summary: "Crawl a site and add its pages as knowledge",
    responses: {
      200: {
        description: "Pages queued",
        content: { "application/json": { schema: resolver(z.object({ ids: z.array(z.string()) })) } },
      },
      402: { description: "Plan limit", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const formId = c.req.param("id");
    if (!owns(c, formId)) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const { url, pages } = c.req.valid("json");
    const cap = Math.min(pages ?? CRAWL_PAGE_CAP, CRAWL_PAGE_CAP);
    const denied = await gate(c.env, c.get("orgId")!, formId, 0, cap);
    if (denied) return c.json(denied.body, denied.status);

    const ids = await expandCrawl(c.env, {
      organizationId: c.get("orgId")!,
      formId,
      seedUrl: url,
      cap,
    });
    return c.json({ ids });
  },
);

/**
 * File upload as one multipart POST, matching `POST /api/assets` rather than
 * the respondent three-step in `uploads.ts`.
 *
 * The three-step exists because a respondent's upload has to be registered
 * against a chat session before the bytes arrive. An author in the builder has
 * no session to register against, and `/api/assets` already established the
 * simpler shape for builder-side uploads.
 */
knowledgeRouter.post(
  "/forms/:id/knowledge/upload",
  describeRoute({
    tags: [tag],
    summary: "Upload a document, image or recording as knowledge",
    responses: {
      200: { description: "Added", content: { "application/json": { schema: resolver(z.object({ id: z.string() })) } } },
      413: { description: "Too large", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      415: { description: "Unsupported type", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const formId = c.req.param("id");
    if (!owns(c, formId)) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const orgId = c.get("orgId")!;
    // A key has no user behind it; the file is attributed to the organization.
    const userId = c.get("userId") ?? null;

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: { code: "no_file", message: "Send a file" } }, 400);
    }
    if (file.size > MAX_KNOWLEDGE_MB * 1024 * 1024) {
      return c.json({ error: { code: "too_large", message: `Max ${MAX_KNOWLEDGE_MB}MB per file` } }, 413);
    }
    if (!KNOWLEDGE_MIME.has(file.type)) {
      return c.json(
        {
          error: {
            code: "unsupported_type",
            message: "We can read PDFs, Word, Excel, CSV, text, images and audio.",
          },
        },
        415,
      );
    }

    const denied = await gate(c.env, orgId, formId, file.size, 1);
    if (denied) return c.json(denied.body, denied.status);

    const fileId = `ast_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    const r2Key = `knowledge/${orgId}/${formId}/${fileId}-${safeName}`;

    await c.env.R2.put(r2Key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
    await c.env.DB.prepare(
      `INSERT INTO files (id, organization_id, form_id, uploaded_by, uploader_user_id, r2_key, filename, mime, size_bytes, status, created_at, confirmed_at)
       VALUES (?, ?, ?, 'builder', ?, ?, ?, ?, ?, 'confirmed', ?, ?)`,
    )
      .bind(fileId, orgId, formId, userId, r2Key, safeName, file.type, file.size, Date.now(), Date.now())
      .run();

    const id = await createSource(c.env, {
      organizationId: orgId,
      formId,
      kind: kindForMime(file.type),
      title: (form.get("title") as string | null) || safeName,
      origin: safeName,
      fileId,
    });
    return c.json({ id });
  },
);

knowledgeRouter.delete(
  "/forms/:id/knowledge/:sourceId",
  describeRoute({
    tags: [tag],
    summary: "Remove a knowledge source",
    responses: {
      200: { description: "Removed", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
    },
  }),
  async (c) => {
    const formId = c.req.param("id");
    if (!owns(c, formId)) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    await deleteSource(c.env, formId, c.req.param("sourceId"));
    return c.json({ ok: true });
  },
);

  return knowledgeRouter;
}

export const knowledgeRouter = createKnowledgeRouter("dashboard");
export const knowledgeV1Router = createKnowledgeRouter("api_key");

/** Which extractor the consumer should reach for. */
function kindForMime(mime: string): "file" | "image" | "audio" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}
