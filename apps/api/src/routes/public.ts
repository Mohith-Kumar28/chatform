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
import { openSession, type FormRow } from "../lib/open-session.js";
import { mountRespondentAuth } from "./respondent-auth.js";
import { getEntitlements, meter, checkQuota } from "../lib/entitlements.js";
import { brandingHiddenFor, clampForRuntime } from "../lib/doc-entitlements.js";

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
    `SELECT f.slug, f.status, f.close_at, f.organization_id, fv.schema_json
     FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
     WHERE f.slug = ? AND f.deleted_at IS NULL LIMIT 1`,
  )
    .bind(slug)
    .first<{ slug: string; status: string; close_at: number | null; organization_id: string; schema_json: string }>();

  if (!formRow || formRow.status !== "published") {
    return c.json({ error: { code: "form_not_found", message: "Form not found or not published" } }, 404);
  }

  const stored = readFormDoc(JSON.parse(formRow.schema_json));
  const ent = await getEntitlements(c.env, formRow.organization_id);
  // The published version is reconciled with the plan in force right now, so a lapse puts
  // the watermark back and drops a verification step the plan no longer includes — without
  // anyone republishing. See `clampForRuntime`.
  const doc = clampForRuntime(stored, ent);
  const closed = isClosed(doc, formRow.close_at) || (await ceilingReached(c.env, formRow.organization_id, ent));
  const config = toPublicConfig(doc, {
    slug: formRow.slug,
    /**
     * The watermark decision, made here and nowhere else.
     *
     * This used to read `doc.settings.branding.hidePoweredBy` straight through with no
     * plan check, so any free user removed the footer by flipping a toggle — the single
     * most-purchased Pro feature, given away. Publishing strips the flag too, but
     * re-deriving it here is what puts the footer back when a subscription lapses,
     * without anyone having to republish.
     */
    brandingHidden: brandingHiddenFor(doc, ent),
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

    const formRow = await c.env.DB.prepare(
      `SELECT f.id, f.slug, f.status, f.close_at, f.organization_id, fv.id AS version_id, fv.schema_json
       FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
       WHERE f.slug = ? AND f.deleted_at IS NULL LIMIT 1`,
    )
      .bind(slug)
      .first<FormRow & { status: string }>();

    if (!formRow || formRow.status !== "published") {
      return c.json({ error: { code: "form_not_found", message: "Form not found or not published" } }, 404);
    }

    /**
     * Every gate now lives in `openSession`, shared with the headless API.
     *
     * They used to live inline here, which is exactly why `/v1` had none of
     * them: a closed, capped, password-protected form would still open sessions
     * over the API, unmetered.
     */
    const opened = await openSession({
      env: c.env,
      form: formRow,
      // An embedded form is still a browser respondent; the origin, when the
      // widget sends one, is what distinguishes it.
      source: body.embed?.origin ? "embed" : "chat",
      hiddenFields: body.hiddenFields ?? {},
      ip: c.req.header("cf-connecting-ip") ?? "",
      country: c.req.header("cf-ipcountry") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      password: body.password,
      turnstileToken: body.turnstileToken,
      /**
       * The browser's own Origin header, and nothing else.
       *
       * The body also carries an `embed.origin`, which the page writes about
       * itself — useful as a hint that this is an embed at all, worthless as
       * proof of where it is. Falling back to it would let any page claim to be
       * an allowed one.
       */
      embedOrigin: c.req.header("origin") ?? null,
    });
    if (!opened.ok) return c.json(opened.body, opened.status);

    const result = await stub(c.env, opened.sessionId).init({
      sessionId: opened.sessionId,
      formId: formRow.id,
      formVersionId: formRow.version_id,
      organizationId: formRow.organization_id,
      slug: formRow.slug,
      brandingHidden: opened.brandingHidden,
      aiDegraded: opened.aiDegraded,
      docJson: opened.runtimeDoc,
      respondentToken: opened.respondentToken,
      hiddenFields: body.hiddenFields ?? {},
      ipHash: opened.ipHash,
      country: c.req.header("cf-ipcountry") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      source: body.embed?.origin ? "embed" : "chat",
    });

    if (!result.ok) {
      return c.json({ error: { code: result.code, message: "Could not start session" } }, 400);
    }

    return c.json({
      sessionId: opened.sessionId,
      sseUrl: `/p/sessions/${opened.sessionId}/events`,
      respondentToken: opened.respondentToken,
    });
  },
);

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

/**
 * Has this organization used up its absolute monthly response ceiling?
 *
 * Checked, never consumed — the reservation happens once the session is really being
 * created. Reads fresh from D1 rather than the cached entitlements, because the counter
 * changes constantly while the plan does not.
 */
async function ceilingReached(
  env: Bindings,
  orgId: string,
  ent: Awaited<ReturnType<typeof getEntitlements>>,
): Promise<boolean> {
  if (!orgId) return false;
  const quota = await checkQuota(env, orgId, "responses", ent);
  return !quota.ok;
}
