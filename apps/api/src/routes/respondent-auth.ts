import type { Context, Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { readFormDoc, type FormDoc, type RespondentIdentity } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import type { SessionDO } from "../do/session-do.js";
import { verifyGoogleIdToken, verifyFirebasePhoneToken } from "../lib/respondent-auth.js";
import { findIdentityHistory } from "../lib/respondent-history.js";
import { clampForRuntime } from "../lib/doc-entitlements.js";
import { getEntitlements } from "../lib/entitlements.js";

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
const phoneTokenSchema = z.object({ idToken: z.string().min(10).max(8000) });

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
 * What we should do about everything this person has already done here.
 *
 * Signing in is the one moment a gated form learns who it is talking to, and
 * until now it spent that knowledge on a single question — has this identity
 * already *completed* the form, and only when `onePerIdentity` was on. Two
 * things it could have answered went unasked.
 *
 * A response they left half-finished: it was found only by a session id in
 * `localStorage`, so a different browser, a cleared cache or an embedded frame
 * whose storage the browser partitions started them again at question one while
 * their real answers sat in the results table as a second partial. The identity
 * on those rows was always enough to find them.
 *
 * And `allowResubmissions: false`, which keys on a hashed IP — a network, not a
 * person, wrong in both directions. It locks out a household and waves through
 * anybody on a different connection. Where a verified identity exists it is the
 * better key, and this checks both: the IP gate in `openSession` still runs for
 * respondents who never sign in.
 *
 * Entitlements are applied first. `identityAlreadyAnswered` read the stored
 * document, so a customer whose plan had lapsed still had these settings
 * enforced against their respondents while the builder showed them switched
 * off. `clampForRuntime` is what the rest of the runtime reads.
 */
interface SignInVerdict {
  blocked: { code: "already_answered"; message: string; completedAt: number | null } | null;
  resume: { submissionId: string; answers: Record<string, unknown> } | null;
}

const NOTHING: SignInVerdict = { blocked: null, resume: null };

async function assessIdentity(
  env: Bindings,
  sessionId: string,
  identity: RespondentIdentity,
): Promise<SignInVerdict> {
  const sess = await env.DB.prepare(
    `SELECT s.form_id AS form_id, s.organization_id AS organization_id, fv.schema_json AS schema_json
       FROM chat_sessions s
       LEFT JOIN form_versions fv ON fv.id = s.form_version_id
      WHERE s.id = ?1`,
  )
    .bind(sessionId)
    .first<{ form_id: string; organization_id: string; schema_json: string | null }>();
  if (!sess?.schema_json) return NOTHING;

  let settings: FormDoc["settings"];
  try {
    const ent = await getEntitlements(env, sess.organization_id);
    settings = clampForRuntime(readFormDoc(JSON.parse(sess.schema_json)), ent).settings;
  } catch (err) {
    // A document we cannot read must not become a lockout, and must not stop
    // somebody signing in either.
    console.error("signin_settings_unreadable", sess.form_id, err);
    return NOTHING;
  }

  const history = await findIdentityHistory(env, sess.form_id, identity, sessionId);

  if (history.finished) {
    /*
     * Two different settings can refuse a second response, and they mean
     * different things: `onePerIdentity` is "one per person, and we checked",
     * `allowResubmissions: false` is "one per respondent, however we can tell".
     * Either being on is enough; neither being on means the author is happy to
     * take another answer, and they get a fresh response rather than a lecture.
     */
    const oncePerPerson = settings.requireAuth.onePerIdentity || !settings.allowResubmissions;
    if (!oncePerPerson) return NOTHING;
    return {
      blocked: {
        code: "already_answered",
        message: "This form takes one response per person, and you have already answered it.",
        completedAt: history.finished.completedAt,
      },
      resume: null,
    };
  }

  return { blocked: null, resume: history.resumable };
}

export function mountRespondentAuth(router: AuthRouter, opts: Options): void {
  const { resolve, stub, base } = opts;

  const attach = async (c: Ctx, identity: RespondentIdentity, sessionId: string) => {
    const verdict = await assessIdentity(c.env, sessionId, identity);
    if (verdict.blocked) {
      /*
       * `completedAt` rides along so the page can say *when* they answered
       * rather than only that they did. "You already answered this" with no
       * date is the kind of message people argue with.
       */
      return c.json(
        {
          error: {
            code: verdict.blocked.code,
            message: verdict.blocked.message,
            completedAt: verdict.blocked.completedAt,
          },
        },
        409,
      );
    }

    const result = await stub(c.env, sessionId).attachIdentity(identity, verdict.resume ?? undefined);
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
      /*
       * So the client can say "picking up where you left off" in its own UI
       * rather than inferring it from a conversation that suddenly has history.
       */
      resumed: Boolean(verdict.resume),
    });
  };

  const unauthorized = (c: Ctx) =>
    c.json({ error: { code: "unauthorized", message: "Invalid session token" } }, 401);

  router.post(
    `${base}/auth/google`,
    describeRoute({
      tags: ["v1"],
      summary: "Verify a respondent with a Google ID token",
      responses: {
        200: { description: "Verified" },
        400: { description: "The token did not check out" },
        409: { description: "This identity has already answered" },
      },
    }),
    zValidator("json", googleSchema),
    async (c) => {
    const sessionId = await resolve(c);
    if (!sessionId) return unauthorized(c);
    const result = await verifyGoogleIdToken(c.env, c.req.valid("json").idToken);
    if (!result.ok) return c.json({ error: { code: result.code, message: result.message } }, 400);
    return attach(c, result.identity, sessionId);
    },
  );

  /**
   * The phone path, and the only one.
   *
   * Firebase sent the SMS and checked the code in the browser, so there is one
   * round trip and it carries the proof. A `/v1` caller runs the same flow in
   * their own page — the SDK is a browser SDK, with a reCAPTCHA step — and
   * posts the token it produces here.
   */
  router.post(
    `${base}/auth/phone/token`,
    describeRoute({
      tags: ["v1"],
      summary: "Verify a respondent with a Firebase phone ID token",
      responses: {
        200: { description: "Verified" },
        400: { description: "The token did not check out" },
        409: { description: "This identity has already answered" },
      },
    }),
    zValidator("json", phoneTokenSchema),
    async (c) => {
      const sessionId = await resolve(c);
      if (!sessionId) return unauthorized(c);
      const result = await verifyFirebasePhoneToken(c.env, c.req.valid("json").idToken);
      if (!result.ok) return c.json({ error: { code: result.code, message: result.message } }, 400);
      return attach(c, result.identity, sessionId);
    },
  );

  /**
   * The same proof, for a number given as an *answer* rather than as a sign-in.
   *
   * Separate from `auth/phone/token` because the outcomes are different: this
   * one attaches no identity, files nothing under a respondent, and only says
   * "the number in this token is the number you typed into that question". The
   * session decides the rest — including refusing a token for some other
   * number, which is the whole check.
   */
  router.post(
    `${base}/verify/phone-token`,
    describeRoute({
      tags: ["v1"],
      summary: "Confirm a phone answer with a Firebase phone ID token",
      responses: {
        200: { description: "The answer is verified and recorded" },
        400: { description: "The token did not check out, or proves a different number" },
      },
    }),
    zValidator("json", phoneTokenSchema),
    async (c) => {
      const sessionId = await resolve(c);
      if (!sessionId) return unauthorized(c);
      const result = await verifyFirebasePhoneToken(c.env, c.req.valid("json").idToken);
      if (!result.ok) return c.json({ error: { code: result.code, message: result.message } }, 400);

      const settled = await stub(c.env, sessionId).verifyPendingPhone(result.identity.phone ?? "");
      if (!settled.accepted) {
        return c.json(
          { error: { code: settled.error ?? "rejected", message: settled.message ?? "Could not verify." } },
          400,
        );
      }
      return c.json({ ok: true });
    },
  );
}
