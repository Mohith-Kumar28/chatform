import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { sha256Hex, toPublicConfig, type FormDoc, readFormDoc } from "@repo/form-schema";
import { respondentToken, hashToken } from "./helpers.js";
import type { Bindings } from "../env.js";
import { timingSafeEqual, isHashedPassword, verifyPassword } from "../lib/crypto.js";
import { SessionDO } from "../do/session-do.js";
import { CreateSessionResponse, ErrorEnvelope } from "../lib/openapi.js";
import { mountRespondentAuth } from "./respondent-auth.js";

const sessionsRouter = new Hono<{ Bindings: Bindings }>();

const createSessionSchema = z.object({
  turnstileToken: z.string().optional(),
  password: z.string().max(200).optional(),
  hiddenFields: z.record(z.string(), z.string()).optional(),
  embed: z.object({ origin: z.string().optional() }).optional(),
});

const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(5000) }),
  z.object({ type: z.literal("structured"), ref: z.string(), value: z.unknown() }),
]);

const actionSchema = z.object({
  action: z.enum(["skip", "stop", "restart", "edit", "submit"]),
  /** Required for `edit`: which question to go back to. */
  ref: z.string().optional(),
});

/**
 * The slice of a Hono context this guard actually needs. Structural rather
 * than `Context<...>` so the same function serves handlers whose routers
 * declare different Variables.
 */
interface RespondentCtx {
  req: { param: (k: string) => string | undefined; url: string; header: (k: string) => string | undefined };
  env: Bindings;
}

/**
 * Whether the form has stopped accepting responses.
 *
 * The schedule lives in the doc. `forms.close_at` is a denormalized copy kept
 * for indexed queries, but it is only ever written by paths that know about
 * it, so the doc has to win — reading the column alone is what made the
 * close date do nothing at all.
 */
function isClosed(doc: FormDoc, closeAtColumn: number | null): boolean {
  const scheduled = doc.settings.closeRules.closeAt;
  if (scheduled && Date.parse(scheduled) <= Date.now()) return true;
  return !!(closeAtColumn && closeAtColumn < Date.now());
}

/**
 * Asset keys are stored as the R2 path (`assets/<org>/<fileId>-<name>`) but
 * served by file id, so the id is recovered from the key rather than adding a
 * lookup on a path that is otherwise a single query.
 */
function assetIdFromKey(key: string): string {
  const last = key.split("/").pop() ?? key;
  return last.split("-")[0] ?? last;
}

function stub(env: Bindings, sessionId: string): DurableObjectStub<SessionDO> {
  return env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId)) as unknown as DurableObjectStub<SessionDO>;
}

sessionsRouter.get(
  "/forms/:slug/config",
  describeRoute({
    tags: ["public"],
    summary: "Public rendering config for a published form",
    responses: {
      200: { description: "Public form config" },
      404: { description: "Form not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
  const { slug } = c.req.param();
  const formRow = await c.env.DB.prepare(
    `SELECT f.slug, f.status, f.close_at, fv.schema_json
     FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
     WHERE f.slug = ? AND f.deleted_at IS NULL LIMIT 1`,
  )
    .bind(slug)
    .first<{ slug: string; status: string; close_at: number | null; schema_json: string }>();

  if (!formRow || formRow.status !== "published") {
    return c.json({ error: { code: "form_not_found", message: "Form not found or not published" } }, 404);
  }

  const doc = readFormDoc(JSON.parse(formRow.schema_json));
  const closed = isClosed(doc, formRow.close_at);
  const config = toPublicConfig(doc, {
    slug: formRow.slug,
    brandingHidden: doc.settings.branding.hidePoweredBy,
    closed,
    closedMessage: closed ? doc.settings.closeRules.closedMessageMd : undefined,
    // Without this the social preview image was parsed, stored, and never
    // turned into a URL, so every share card came out blank.
    assetUrl: (key) => `${new URL(c.req.url).origin}/p/assets/${assetIdFromKey(key)}`,
  });
  return c.json(config);
});

sessionsRouter.post(
  "/forms/:slug/sessions",
  describeRoute({
    tags: ["public"],
    summary: "Create a chat session for a published form",
    responses: {
      200: { description: "Session created", content: { "application/json": { schema: resolver(CreateSessionResponse) } } },
      403: { description: "Form closed or captcha failed", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      404: { description: "Form not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  validator("json", createSessionSchema),
  async (c) => {
  const { slug } = c.req.param();
  const body = c.req.valid("json");

  // load active published form version
  const formRow = await c.env.DB.prepare(
    `SELECT f.id, f.slug, f.status, f.close_at, fv.id AS version_id, fv.schema_json
     FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
     WHERE f.slug = ? AND f.deleted_at IS NULL LIMIT 1`,
  )
    .bind(slug)
    .first<{ id: string; slug: string; status: string; close_at: number | null; version_id: string; schema_json: string }>();

  if (!formRow || formRow.status !== "published") {
    return c.json({ error: { code: "form_not_found", message: "Form not found or not published" } }, 404);
  }
  // Every gate below reads the published document.
  //
  // They used to read `form_versions.settings_json`, a column that no write
  // path has ever populated — the settings live inside the doc. So the parsed
  // settings were always `{}` and every one of these checks passed
  // unconditionally: the password gate let anyone in, the captcha never ran,
  // and the close date did nothing.
  const doc = readFormDoc(JSON.parse(formRow.schema_json));
  const settings = doc.settings;

  if (isClosed(doc, formRow.close_at)) {
    return c.json({ error: { code: "form_closed", message: "This form is closed" } }, 403);
  }

  const cap = settings.closeRules.maxSubmissions;
  if (cap) {
    const count = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM submissions WHERE form_id = ?1 AND status = 'completed'`,
    )
      .bind(formRow.id)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= cap) {
      return c.json({ error: { code: "form_closed", message: "This form is closed" } }, 403);
    }
  }

  if (settings.password.enabled) {
    const supplied = body.password ?? "";
    const stored = settings.password.value;
    const ok = isHashedPassword(stored) ? await verifyPassword(supplied, stored) : timingSafeEqual(supplied, stored);
    if (!ok) {
      return c.json({ error: { code: "password_required", message: "This form requires a password" } }, 401);
    }
  }
  // A missing token used to skip verification entirely, so any client could
  // bypass the captcha by simply not sending one. Enabled means required.
  if (settings.captcha.enabled && c.env.TURNSTILE_SECRET_KEY) {
    if (!body.turnstileToken) {
      return c.json({ error: { code: "captcha_required", message: "Captcha verification required" } }, 403);
    }
    const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: c.env.TURNSTILE_SECRET_KEY, response: body.turnstileToken }),
    });
    const vr = (await verify.json()) as { success: boolean };
    if (!vr.success) {
      return c.json({ error: { code: "captcha_failed", message: "Captcha verification failed" } }, 403);
    }
  }

  const sessionId = `chs_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const respondentToken = crypto.randomUUID().replace(/-/g, "");
  const ip = c.req.header("cf-connecting-ip") ?? "";
  const country = c.req.header("cf-ipcountry") ?? null;
  const ipHash = sha256Hex(ip);

  // "One response per person, per day" — offered in the builder since the
  // settings panel was written, and enforced nowhere until now.
  //
  // Scoped to a day rather than forever because an IP identifies a network,
  // not a person: an office or a campus shares one, and a permanent block
  // would lock out everyone behind the first respondent. For a guarantee that
  // actually holds, `requireAuth.onePerIdentity` keys on a verified identity.
  if (settings.duplicates.strategy === "ip_daily" && ip) {
    const since = Date.now() - 24 * 60 * 60 * 1000;
    const prior = await c.env.DB.prepare(
      `SELECT 1 FROM chat_sessions WHERE form_id = ?1 AND ip_hash = ?2 AND created_at > ?3 LIMIT 1`,
    )
      .bind(formRow.id, ipHash, since)
      .first();
    if (prior) {
      return c.json(
        { error: { code: "already_responded", message: "It looks like you have already answered this form today." } },
        409,
      );
    }
  }

  // persist session row (D1) — DO is source of truth during session, D1 is the index
  await c.env.DB.prepare(
    `INSERT INTO chat_sessions (id, form_id, form_version_id, organization_id, respondent_token_hash, status, hidden_fields, ip_hash, country, created_at, last_activity_at)
     SELECT ?, f.id, fv.id, f.organization_id, ?, 'active', ?, ?, ?, ?, ?
     FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id WHERE f.id = ?`,
  )
    .bind(
      sessionId,
      hashToken(respondentToken),
      JSON.stringify(body.hiddenFields ?? {}),
      ipHash,
      country,
      Date.now(),
      Date.now(),
      formRow.id,
    )
    .run();

  // fetch org branding preference
  const orgRow = await c.env.DB.prepare(
    `SELECT o.id FROM forms f JOIN organizations o ON o.id = f.organization_id WHERE f.id = ?`,
  )
    .bind(formRow.id)
    .first<{ id: string }>();
  void orgRow;

  const brandingHidden = settings.branding.hidePoweredBy;

  const result = await stub(c.env, sessionId).init({
    sessionId,
    formId: formRow.id,
    formVersionId: formRow.version_id,
    organizationId: orgRow?.id ?? "",
    slug: formRow.slug,
    brandingHidden,
    docJson: doc,
    respondentToken,
    hiddenFields: body.hiddenFields ?? {},
    ipHash,
    country,
    userAgent: c.req.header("user-agent") ?? null,
  });

  if (!result.ok) {
    return c.json({ error: { code: result.code, message: "Could not start session" } }, 400);
  }

  return c.json({
    sessionId,
    sseUrl: `/p/sessions/${sessionId}/events`,
    respondentToken,
  });
});

async function requireRespondent(c: RespondentCtx): Promise<string | null> {
  const sessionId = c.req.param("id");
  const token = respondentToken(c);
  if (!token || !sessionId) return null;
  const row = await c.env.DB.prepare(`SELECT respondent_token_hash FROM chat_sessions WHERE id = ?`)
    .bind(sessionId)
    .first<{ respondent_token_hash: string }>();
  if (!row || row.respondent_token_hash !== hashToken(token)) return null;
  return sessionId;
}

sessionsRouter.get("/sessions/:id/events", async (c) => {
  const sessionId = await requireRespondent(c);
  if (!sessionId) return c.json({ error: { code: "unauthorized", message: "Invalid session token" } }, 401);
  return stub(c.env, sessionId).stream();
});

sessionsRouter.post("/sessions/:id/messages", zValidator("json", messageSchema), async (c) => {
  const sessionId = await requireRespondent(c);
  if (!sessionId) return c.json({ error: { code: "unauthorized", message: "Invalid session token" } }, 401);
  const body = c.req.valid("json");
  const result =
    body.type === "text"
      ? await stub(c.env, sessionId).handleUserTurn({ type: "text", text: body.text })
      : await stub(c.env, sessionId).handleUserTurn({ type: "structured", ref: body.ref, value: body.value });
  if (!result.accepted) return c.json({ error: { code: result.error ?? "rejected", message: "Turn rejected" } }, 400);
  return c.json({ ok: true }, 202);
});

sessionsRouter.post("/sessions/:id/actions", zValidator("json", actionSchema), async (c) => {
  const sessionId = await requireRespondent(c);
  if (!sessionId) return c.json({ error: { code: "unauthorized", message: "Invalid session token" } }, 401);
  const body = c.req.valid("json");
  const result = await stub(c.env, sessionId).action(body);
  if (!result.accepted) return c.json({ error: { code: result.error ?? "rejected", message: "Action rejected" } }, 400);
  return c.json({ ok: true }, 202);
});

sessionsRouter.get("/sessions/:id", async (c) => {
  const sessionId = await requireRespondent(c);
  if (!sessionId) return c.json({ error: { code: "unauthorized", message: "Invalid session token" } }, 401);
  const status = await stub(c.env, sessionId).getStatus();
  if (!status) return c.json({ error: { code: "not_found", message: "Session not found" } }, 404);
  return c.json(status);
});

mountRespondentAuth(sessionsRouter, {
  base: "/sessions/:id",
  stub,
  resolve: (c) => requireRespondent(c),
});

export default sessionsRouter;
