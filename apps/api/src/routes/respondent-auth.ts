import type { Context, Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { readFormDoc, type RespondentIdentity } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import type { SessionDO } from "../do/session-do.js";
import { verifyGoogleIdToken, startPhoneChallenge, verifyPhoneChallenge } from "../lib/respondent-auth.js";

/**
 * Respondent sign-in routes, mounted twice.
 *
 * The hosted form (`/p`) and the headless API (`/v1`) authorize their callers
 * completely differently — a respondent token versus an API key — but the
 * sign-in flow itself is identical, and a customer driving the conversation
 * over `/v1` needs it just as much as our own chat page does. So the handlers
 * take session resolution as a parameter and everything else is shared.
 */

const googleSchema = z.object({ idToken: z.string().min(10).max(8000) });
const phoneStartSchema = z.object({
  phone: z.string().min(4).max(24),
  /** Dial code to assume when the number was typed without one, e.g. "91". */
  dialHint: z.string().max(4).optional(),
});
const phoneVerifySchema = z.object({ code: z.string().min(4).max(10) });

/**
 * These handlers read `c.env` and `c.req`, and nothing from Variables, so the
 * router is typed at the common denominator. A caller whose router declares
 * Variables casts at the mount site: Hono's generics will not unify two
 * routers with different Variables, and threading that through buys nothing.
 */
export type AuthRouter = Hono<{ Bindings: Bindings }>;
type Ctx = Context<{ Bindings: Bindings }>;

interface Options {
  /** Resolves + authorizes the session for this router. Null means 401. */
  resolve: (c: Ctx) => Promise<string | null>;
  stub: (env: Bindings, sessionId: string) => DurableObjectStub<SessionDO>;
  /** Route prefix, e.g. "/sessions/:id" or "/chat/sessions/:sid". */
  base: string;
}

/**
 * Refuse a second response from someone who already answered, when the form
 * asked for that.
 *
 * `duplicates.strategy` keys on an IP or on an answer, both of which a
 * determined person changes in seconds. A verified identity is the only
 * de-duplication we offer that actually holds, so it is checked here — at the
 * moment the identity becomes known, before any question is asked, rather than
 * at submit time when the respondent has already done the work.
 */
async function identityAlreadyAnswered(
  env: Bindings,
  sessionId: string,
  identity: RespondentIdentity,
): Promise<boolean> {
  const sess = await env.DB.prepare(
    `SELECT s.form_id AS form_id, fv.schema_json AS schema_json
       FROM chat_sessions s
       LEFT JOIN form_versions fv ON fv.id = s.form_version_id
      WHERE s.id = ?1`,
  )
    .bind(sessionId)
    .first<{ form_id: string; schema_json: string | null }>();
  if (!sess?.schema_json) return false;

  let onePer = false;
  try {
    onePer = readFormDoc(JSON.parse(sess.schema_json)).settings.requireAuth.onePerIdentity;
  } catch {
    return false; // a doc we cannot read must not become a lockout
  }
  if (!onePer) return false;

  const prior = await env.DB.prepare(
    `SELECT 1 FROM submissions
      WHERE form_id = ?1 AND status = 'completed'
        AND respondent_provider = ?2 AND respondent_subject = ?3
        AND session_id IS NOT ?4
      LIMIT 1`,
  )
    .bind(sess.form_id, identity.provider, identity.subject, sessionId)
    .first();
  return Boolean(prior);
}

export function mountRespondentAuth(router: AuthRouter, opts: Options): void {
  const { resolve, stub, base } = opts;

  const attach = async (c: Ctx, identity: RespondentIdentity, sessionId: string) => {
    if (await identityAlreadyAnswered(c.env, sessionId, identity)) {
      return c.json(
        {
          error: {
            code: "already_answered",
            message: "This form takes one response per person, and you have already answered it.",
          },
        },
        409,
      );
    }

    const result = await stub(c.env, sessionId).attachIdentity(identity);
    if (!result.accepted) {
      return c.json({ error: { code: result.error ?? "rejected", message: "Could not verify." } }, 400);
    }
    return c.json({
      ok: true,
      identity: {
        provider: identity.provider,
        label: identity.email ?? identity.phone ?? identity.name ?? "Verified",
        name: identity.name,
        pictureUrl: identity.pictureUrl,
      },
    });
  };

  const unauthorized = (c: Ctx) =>
    c.json({ error: { code: "unauthorized", message: "Invalid session token" } }, 401);

  router.post(`${base}/auth/google`, zValidator("json", googleSchema), async (c) => {
    const sessionId = await resolve(c);
    if (!sessionId) return unauthorized(c);
    const result = await verifyGoogleIdToken(c.env, c.req.valid("json").idToken);
    if (!result.ok) return c.json({ error: { code: result.code, message: result.message } }, 400);
    return attach(c, result.identity, sessionId);
  });

  router.post(`${base}/auth/phone/start`, zValidator("json", phoneStartSchema), async (c) => {
    const sessionId = await resolve(c);
    if (!sessionId) return unauthorized(c);
    const body = c.req.valid("json");
    const result = await startPhoneChallenge(c.env, sessionId, body.phone, body.dialHint);
    if (!result.ok) return c.json({ error: { code: result.code, message: result.message } }, 400);
    return c.json({ ok: true, destination: result.destination, devCode: result.devCode });
  });

  router.post(`${base}/auth/phone/verify`, zValidator("json", phoneVerifySchema), async (c) => {
    const sessionId = await resolve(c);
    if (!sessionId) return unauthorized(c);
    const result = await verifyPhoneChallenge(c.env, sessionId, c.req.valid("json").code);
    if (!result.ok) return c.json({ error: { code: result.code, message: result.message } }, 400);
    return attach(c, result.identity, sessionId);
  });
}
