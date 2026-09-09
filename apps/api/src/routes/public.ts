import { Hono, type Context } from "hono";
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
import { respondentKey } from "../lib/respondent-key.js";
import { findDeviceResumable } from "../lib/respondent-history.js";
import { mountRespondentAuth } from "./respondent-auth.js";
import { sessionStartLimit, respondentAuthLimit } from "../lib/ratelimit.js";
import { getEntitlements, meter, checkQuota } from "../lib/entitlements.js";
import { brandingHiddenFor, clampForRuntime } from "../lib/doc-entitlements.js";
import { verifyEmailToken } from "../lib/signed-url.js";
import { cancelFollowUps, cancelFollowUpsForAddress, recordFollowUpClick, suppress } from "../lib/followups.js";
import type { RespondentIdentity } from "@repo/form-schema";

const sessionsRouter = new Hono<{ Bindings: Bindings }>();

/**
 * The two expensive things a stranger can do, limited more tightly than the
 * blanket `/p` window in `app.ts`.
 *
 * Opening a session writes rows, meters a response against the org's quota and
 * can send mail; proving an identity fetches a JWKS document before the attempt
 * can even be rejected. Both sit well below the 120/min everything else gets,
 * because a person doing either of them legitimately does it a handful of times
 * and a script does it as fast as it is allowed to.
 *
 * Declared here, before the routes, so they run ahead of the handlers —
 * including the ones `mountRespondentAuth` adds at the bottom of this file.
 */
sessionsRouter.use("/forms/:slug/sessions", sessionStartLimit);
sessionsRouter.use("/sessions/:id/auth/*", respondentAuthLimit);
sessionsRouter.use("/sessions/:id/verify/*", respondentAuthLimit);

const createSessionSchema = z.object({
  turnstileToken: z.string().optional(),
  password: z.string().max(200).optional(),
  hiddenFields: z.record(z.string(), z.string()).optional(),
  embed: z.object({ origin: z.string().optional() }).optional(),
  /**
   * The signed token from a follow-up email. Continues the response it names
   * rather than starting a new one — see `resumeSubmissionId` in `openSession`
   * for which gates that relaxes and which it does not.
   */
  resumeToken: z.string().max(300).optional(),
  /**
   * The device signal from `lib/respondent-signal` in the browser.
   *
   * Optional throughout: it is blocked by extensions, unavailable in hardened
   * browsers, and absent from every non-browser caller. Missing means the
   * server falls back to hashing the IP, which is what it did before this
   * existed.
   */
  deviceSignal: z.string().max(128).optional(),
  /**
   * Start this response from nothing, whatever the device key matches.
   *
   * Sent by "Start over". Without it the device match would hand back the very
   * response the respondent just asked to leave, so clearing the screen would
   * be followed immediately by refilling it. The key is still computed and
   * still stored — the duplicate rule has to keep working — this only declines
   * to resume.
   */
  fresh: z.boolean().optional(),
  /**
   * Which follow-up message the resume link came out of, for attribution.
   *
   * Only ever read alongside a `resumeToken` that verifies against the same
   * response, so it grants nothing on its own — a stranger passing an id here
   * gets a fresh session and no write. Optional forever: links minted before
   * this existed, and links somebody retyped by hand, must still resume.
   */
  followUpId: z.string().max(60).optional(),
});

/**
 * `turnId` is what makes an answer safe to send twice.
 *
 * The browser fires and forgets: the POST returns 202 and the reply arrives on
 * the stream, so a request that times out or dies in flight tells the client
 * nothing about whether the answer landed. Retrying was therefore a choice
 * between losing answers and duplicating them. With a client-minted id the
 * session can recognise the second copy and do nothing, so the client is free
 * to retry — which is the only way a flaky network stops costing submissions.
 *
 * Optional: an older page, the headless API and the SDK all post without one
 * and keep the previous at-most-once behaviour.
 */
const turnId = z.string().min(8).max(64).optional();

const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(5000), turnId }),
  z.object({ type: z.literal("structured"), ref: z.string(), value: z.unknown(), turnId }),
]);

const actionSchema = z.object({
  /**
   * `resend_code` and `change_answer` only mean anything while a `verify`
   * question is waiting on a code: send another, or give up on this one and
   * answer the question again.
   */
  action: z.enum(["skip", "stop", "restart", "edit", "submit", "resend_code", "change_answer"]),
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
      `SELECT f.id, f.slug, f.status, f.close_at, f.organization_id, f.fingerprint_salt, fv.id AS version_id, fv.schema_json
       FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
       WHERE f.slug = ? AND f.deleted_at IS NULL LIMIT 1`,
    )
      .bind(slug)
      .first<FormRow & { status: string }>();

    if (!formRow || formRow.status !== "published") {
      return c.json({ error: { code: "form_not_found", message: "Form not found or not published" } }, 404);
    }

    /**
     * A follow-up link, verified before anything is created.
     *
     * An invalid or expired token is not an error the respondent can act on —
     * they clicked a link in an email — so it degrades to a fresh session
     * rather than a dead end. They lose their previous answers, which is sad,
     * but a working form is better than a page saying "invalid token".
     */
    /**
     * Which response, if any, this session continues.
     *
     * The emailed link first — it is explicit, it is proof, and it works for a
     * respondent on a machine that has never seen this form. Failing that, the
     * device: same person, same browser, but the session id in `localStorage`
     * is gone because they cleared it, went private, or the form is embedded in
     * a frame whose storage the browser partitions. That case used to start
     * them at question one beside their own half-finished response.
     *
     * A signed-in respondent is handled later and elsewhere — see
     * `assessIdentity` — because until they sign in we do not know who they are.
     */
    const device = respondentKey({
      signal: body.deviceSignal,
      ip: c.req.header("cf-connecting-ip") ?? "",
      salt: formRow.fingerprint_salt,
    });
    const resume =
      (await loadResumable(c.env, formRow.id, body.resumeToken)) ??
      (body.fresh ? null : await findDeviceResumable(c.env, formRow.id, device));

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
      deviceSignal: body.deviceSignal ?? null,
      /**
       * Carried onto the session, not just used here.
       *
       * The device match is declined above, but a gated form meets its
       * respondent later — at sign-in — and the identity lookup there would
       * otherwise hand back the response they pressed "Start over" to leave.
       */
      ...(body.fresh ? { startedOver: true } : {}),
      ...(resume ? { resumeSubmissionId: resume.submissionId } : {}),
    });
    if (!opened.ok) return c.json(opened.body, opened.status);

    /**
     * Put the response back in progress *after* the gates passed.
     *
     * `finalizeResponse` guards on `status = 'in_progress'`, so this is what
     * makes a second, real completion possible for a row that was already
     * finalised as abandoned. Doing it before the gates would leave a response
     * reopened for a session that was then refused.
     */
    if (resume) {
      await c.env.DB.prepare(
        `UPDATE submissions SET status = 'in_progress', completed_at = NULL, updated_at = ?2
          WHERE id = ?1 AND status = 'abandoned'`,
      )
        .bind(resume.submissionId, Date.now())
        .run();
      /**
       * Credit the click before cancelling the rest of the sequence — the
       * cancel is what makes this row stop being `scheduled`, and doing it
       * first would leave the click landing on a row we had just written off.
       */
      if (body.followUpId) {
        await recordFollowUpClick(c.env, body.followUpId, resume.submissionId);
      }
      await cancelFollowUps(c.env, resume.submissionId, "resumed");
      await c.env.Q_WEBHOOKS.send({
        event: "response.resumed",
        organizationId: formRow.organization_id,
        formId: formRow.id,
        submissionId: resume.submissionId,
        sessionId: opened.sessionId,
        source: "chat",
        isTest: false,
      }).catch((err: unknown) => console.error("resume_webhook_failed", resume.submissionId, err));
    }

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
      fingerprint: opened.device.value || null,
      country: c.req.header("cf-ipcountry") ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      source: body.embed?.origin ? "embed" : "chat",
      ...(resume
        ? { resume: { submissionId: resume.submissionId, answers: resume.answers, identity: resume.identity } }
        : {}),
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

interface Resumable {
  submissionId: string;
  answers: Record<string, unknown>;
  identity: RespondentIdentity | null;
}

/**
 * Verify a follow-up link and load what it points at.
 *
 * Returns null for anything that does not check out, and the caller then opens
 * an ordinary session — a respondent who clicked a link in an email cannot do
 * anything with "invalid token", so the graceful failure is a working form.
 *
 * The token is scoped to a submission, and the submission is re-checked against
 * the form in the URL. Without that, a token minted for one form would resume a
 * response inside another one belonging to a different customer.
 */
async function loadResumable(
  env: Bindings,
  formId: string,
  token: string | undefined,
): Promise<Resumable | null> {
  if (!token) return null;
  const { verdict, id } = await verifyEmailToken(env, "resume", token);
  if (verdict !== "ok" || !id) return null;

  const sub = await env.DB.prepare(
    `SELECT id, form_id, status, is_test, respondent_provider, respondent_subject,
            respondent_email, respondent_phone, respondent_name
       FROM submissions WHERE id = ?`,
  )
    .bind(id)
    .first<{
      id: string;
      form_id: string;
      status: string;
      is_test: number;
      respondent_provider: string | null;
      respondent_subject: string | null;
      respondent_email: string | null;
      respondent_phone: string | null;
      respondent_name: string | null;
    }>();
  if (!sub || sub.form_id !== formId || sub.is_test === 1) return null;
  // A completed response is not resumable: coming back to a form you finished
  // should not quietly reopen it and let a second submission overwrite the first.
  if (sub.status !== "abandoned" && sub.status !== "in_progress") return null;

  const rows = await env.DB.prepare(
    `SELECT block_ref, value_json FROM submission_answers WHERE submission_id = ?`,
  )
    .bind(id)
    .all<{ block_ref: string; value_json: string }>();

  const answers: Record<string, unknown> = {};
  for (const r of rows.results ?? []) {
    try {
      answers[r.block_ref] = JSON.parse(r.value_json);
    } catch {
      // one unreadable answer must not cost them the rest
    }
  }

  /**
   * Carried forward so a form behind a sign-in gate does not ask somebody to
   * verify themselves twice. The identity was already proved once for this
   * response and denormalised onto it precisely because sessions get pruned.
   */
  const identity: RespondentIdentity | null =
    sub.respondent_provider && sub.respondent_subject
      ? ({
          provider: sub.respondent_provider,
          subject: sub.respondent_subject,
          email: sub.respondent_email,
          phone: sub.respondent_phone,
          name: sub.respondent_name,
        } as RespondentIdentity)
      : null;

  return { submissionId: sub.id, answers, identity };
}

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
      ? await stub(c.env, sessionId).handleUserTurn({ type: "text", text: body.text, turnId: body.turnId })
      : await stub(c.env, sessionId).handleUserTurn({
          type: "structured",
          ref: body.ref,
          value: body.value,
          turnId: body.turnId,
        });
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

/**
 * "Tell me again where we are."
 *
 * The client calls this when its own state has stopped agreeing with the
 * stream — typing dots that outlived their turn, a question that never
 * arrived, a socket that went quiet. It re-emits the current step over SSE
 * under fresh sequence numbers, which is the one thing a reconnect cannot do,
 * because replay is deduped by sequence. Read-only with respect to the flow:
 * it never advances the conversation, so a client that calls it too eagerly
 * costs nothing but a repeated event.
 */
sessionsRouter.post("/sessions/:id/resync", async (c) => {
  const sessionId = await requireRespondent(c);
  if (!sessionId) return c.json({ error: { code: "unauthorized", message: "Invalid session token" } }, 401);
  const result = await stub(c.env, sessionId).resync();
  if (!result.ok) return c.json({ error: { code: "not_found", message: "Session not found" } }, 404);
  return c.json({ ok: true }, 202);
});

sessionsRouter.get("/sessions/:id", async (c) => {
  const sessionId = await requireRespondent(c);
  if (!sessionId) return c.json({ error: { code: "unauthorized", message: "Invalid session token" } }, 401);
  const status = await stub(c.env, sessionId).getStatus();
  if (!status) return c.json({ error: { code: "not_found", message: "Session not found" } }, 404);
  return c.json(status);
});

/**
 * "Don't email me about this" — offered beside the address question itself.
 *
 * This is the one respondent-facing piece of the follow-up feature, and it is
 * required rather than courteous: the opt-out has to be available when the
 * contact details are collected, and on a form somebody abandons, that is the
 * *only* moment it can be. An opt-out in the footer of the reminder, or on a
 * final step they never reach, arrives after the thing it was supposed to
 * prevent.
 *
 * Recorded on the session, because the response row is created lazily by the
 * first answer and may not exist when the question is still on screen.
 */
sessionsRouter.post("/sessions/:id/followup-optout", async (c) => {
  const sessionId = await requireRespondent(c);
  if (!sessionId) return c.json({ error: { code: "unauthorized", message: "Invalid token" } }, 401);
  await c.env.DB.prepare(`UPDATE chat_sessions SET followup_opt_out = 1 WHERE id = ?`)
    .bind(sessionId)
    .run();
  return c.json({ ok: true });
});

/**
 * One-click unsubscribe from a customer's follow-up emails.
 *
 * `GET` and `POST` both work, and neither requires a login or a confirmation
 * step. That is not laziness — it is the requirement. RFC 8058 one-click, which
 * Gmail and Yahoo surface as an unsubscribe control next to the sender's name,
 * sends a bare `POST` with no cookies; and an opt-out somebody has to hunt for
 * is one they report as spam instead, which costs the sending domain far more
 * than the recipient was ever worth.
 *
 * The suppression is scoped to the organization the token names. A respondent
 * declining one customer's nudges has said nothing about anybody else's, and
 * this table is never consulted for transactional mail — someone who opts out
 * here must still be able to reset their password.
 */
const unsubscribeHandler = async (c: Context<{ Bindings: Bindings }>) => {
  const { verdict, id } = await verifyEmailToken(c.env, "unsub", c.req.param("token"));
  /**
   * A bad token still renders as success.
   *
   * The alternative tells whoever is holding it whether it was ever real, and
   * there is nothing the recipient could do about the answer anyway. Nothing is
   * written, so this leaks no state; it just refuses to be an oracle.
   */
  if (verdict === "ok" && id) {
    // `orgId:address` — the address is snapshotted into the token so this works
    // even after the response it came from has been deleted.
    const sep = id.indexOf(":");
    if (sep > 0) {
      const orgId = id.slice(0, sep);
      const address = id.slice(sep + 1);
      await suppress(c.env, orgId, address, "unsubscribe");
      await cancelFollowUpsForAddress(c.env, orgId, address);
    }
  }
  return c.html(UNSUBSCRIBED_PAGE);
};

sessionsRouter.get("/unsubscribe/:token", unsubscribeHandler);
sessionsRouter.post("/unsubscribe/:token", unsubscribeHandler);

/** Deliberately dependency-free: this page must render from a cold worker. */
const UNSUBSCRIBED_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unsubscribed</title>
<style>
  :root { color-scheme: light dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center;
         font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
         background:#faf8f4; color:#3b3530; padding:24px; }
  main { max-width:32rem; text-align:center; }
  h1 { font-size:20px; margin:0 0 8px; letter-spacing:-0.015em; }
  p { margin:0; color:#7b736c; }
  @media (prefers-color-scheme: dark) {
    body { background:#1c1917; color:#e8e3da; } p { color:#a49c94; }
  }
</style></head>
<body><main>
  <h1>You're unsubscribed</h1>
  <p>You won't get any more reminders about this form. Any answers you already gave are untouched.</p>
</main></body></html>`;

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
