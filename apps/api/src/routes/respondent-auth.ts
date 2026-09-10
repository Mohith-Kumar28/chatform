import type { Context, Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  readFormDoc,
  toPublicEnding,
  displayAnswer,
  isRequirementUnmet,
  type AnswerMap,
  type ConditionGroup,
  type FormDoc,
  type PublicEnding,
  type RespondentIdentity,
} from "@repo/form-schema";
import type { Bindings } from "../env.js";
import type { SessionDO } from "../do/session-do.js";
import { verifyGoogleIdToken, verifyFirebasePhoneToken } from "../lib/respondent-auth.js";
import { findIdentityHistory } from "../lib/respondent-history.js";
import { clampForRuntime } from "../lib/doc-entitlements.js";
import { getEntitlements } from "../lib/entitlements.js";
import { can } from "@repo/entitlements";

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
  /**
   * Stop and say "you have answered this before" rather than opening a second
   * response the moment we recognise somebody.
   *
   * Hosted chat only. A respondent who comes back to a form that accepts more
   * than one answer used to sign in and land on question one of a blank
   * conversation, which reads as their first response having been lost — so
   * the honest ones retype the whole thing and the form collects a duplicate
   * neither party wanted. Showing what they already sent, and letting them ask
   * for another, is the same outcome with the decision in their hands.
   *
   * Off for `/v1`, deliberately. A headless caller has its own interface and
   * its own record of who has answered; turning a 200 into a 409 there would
   * break every integration to solve a problem those callers do not have.
   */
  acknowledgePriorResponse?: boolean;
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
  blocked: {
    code: "already_answered";
    message: string;
    completedAt: number | null;
    /**
     * Which of the two things actually happened to their last response.
     *
     * The block is the same either way — the author's rule is "one per
     * person", and a person the form turned away has still had their one — but
     * the screen the respondent gets is not. "You already answered this today"
     * in front of somebody who was refused at the last question is simply
     * false, and it is false in the way that makes people think the form ate
     * their work.
     */
    outcome: "completed" | "screened_out";
    /** On a screen-out, the ending that refused them, so the page can say why. */
    ending: PublicEnding | null;
    /** What they told the form, so the page has a transcript to show. */
    answers: { ref: string; title: string; display: string }[];
    /**
     * Whether "Submit another response" is a real offer.
     *
     * False when the author's rule refuses a second one, and the card must not
     * dangle a button the next sign-in would turn down. True when this is the
     * acknowledgement above — the conversation is being held, not refused, and
     * pressing the button is how it proceeds.
     */
    canRepeat: boolean;
  } | null;
  resume: { submissionId: string; answers: Record<string, unknown> } | null;
}

const NOTHING: SignInVerdict = { blocked: null, resume: null };

async function assessIdentity(
  env: Bindings,
  sessionId: string,
  identity: RespondentIdentity,
  acknowledgePriorResponse: boolean,
): Promise<SignInVerdict> {
  const sess = await env.DB.prepare(
    `SELECT s.form_id AS form_id, s.organization_id AS organization_id, s.started_over AS started_over,
            fv.schema_json AS schema_json
       FROM chat_sessions s
       LEFT JOIN form_versions fv ON fv.id = s.form_version_id
      WHERE s.id = ?1`,
  )
    .bind(sessionId)
    .first<{
      form_id: string;
      organization_id: string;
      started_over: number | null;
      schema_json: string | null;
    }>();
  if (!sess?.schema_json) return NOTHING;

  let doc: FormDoc;
  let ent: Awaited<ReturnType<typeof getEntitlements>>;
  try {
    ent = await getEntitlements(env, sess.organization_id);
    doc = clampForRuntime(readFormDoc(JSON.parse(sess.schema_json)), ent);
  } catch (err) {
    // A document we cannot read must not become a lockout, and must not stop
    // somebody signing in either.
    console.error("signin_settings_unreadable", sess.form_id, err);
    return NOTHING;
  }
  const settings = doc.settings;

  const history = await findIdentityHistory(env, sess.form_id, identity, sessionId);

  if (history.finished) {
    /*
     * One setting decides this, and the plan decides whether we are the ones
     * who enforce it.
     *
     * `allowResubmissions: false` is the author saying "one response per
     * person". It used to sit beside `requireAuth.onePerIdentity`, which asked
     * the same question in the opposite polarity, and the two were OR'd — so
     * the identity check, the half a customer buys the Business plan for, also
     * ran for anybody on Pro who happened to switch resubmissions off.
     *
     * Now it is the one setting, and the key follows the plan: with
     * `one_response_per_identity` the verified person is what we match on, and
     * without it `openSession` keeps doing the device check it was already
     * doing. Either way the author asked for one response per person and gets
     * the strongest version of that we can honestly offer them.
     */
    const oncePerPerson = !settings.allowResubmissions && can(ent, "one_response_per_identity");

    /*
     * Not refused, but not waved through either.
     *
     * A form that takes more than one response per person still owes a
     * returning respondent the fact that their last one arrived. Dropping
     * them onto question one of an empty conversation is the single most
     * alarming thing this screen can do: the only evidence they have that the
     * form ever worked is the conversation they can no longer see, so the
     * reasonable reading is that it was lost, and the reasonable response is
     * to fill the whole thing in again. The duplicate that produces is not a
     * second opinion, it is the same one typed twice.
     *
     * So the conversation is held here rather than started. The client shows
     * what they sent and offers "Submit another response", and pressing it
     * opens a fresh session flagged `started_over` — which is how the sign-in
     * below this knows the offer has already been made and accepted, and lets
     * them straight through the second time.
     */
    if (!oncePerPerson && !acknowledgePriorResponse) return NOTHING;
    if (!oncePerPerson && sess.started_over) return NOTHING;

    const screenedOut = history.finished.status === "disqualified";
    /*
     * The ending is replayed rather than summarised, whichever one it was.
     *
     * The respondent is looking at this screen because they came back, and a
     * single grey line saying they have "already answered" is the least of
     * what the server knows. Rebuilding the ending here — from the same
     * `toPublicEnding` the live conversation uses, with the requirements
     * narrowed against their own stored answers — means the return visit
     * shows the card they saw the first time: which rule a refusal missed, or
     * the thank-you and its link on a response that was accepted.
     */
    const answers = history.finished.answers;
    /*
     * Cast rather than re-parsed: every value in `submission_answers` was
     * written by `validateAnswer`, so it is already an `AnswerMap` — and a
     * requirement that fails to evaluate must not cost the respondent the
     * screen, which is what re-parsing and throwing would do.
     */
    const state = { answers: answers as AnswerMap, variables: {}, hidden: {} };
    const ending = doc.endings.find((e) => e.ref === history.finished!.endingRef) ?? null;

    return {
      blocked: {
        code: "already_answered",
        message: oncePerPerson
          ? screenedOut
            ? "This form takes one response per person, and yours was not accepted."
            : "This form takes one response per person, and you have already answered it."
          : screenedOut
            ? "Your last response was not accepted. You can send another."
            : "You have already answered this form. You can send another response if you need to.",
        completedAt: history.finished.completedAt,
        outcome: screenedOut ? "screened_out" : "completed",
        ending: ending
          ? toPublicEnding(ending, settings.onComplete, (when: ConditionGroup) =>
              isRequirementUnmet(when, state),
            )
          : null,
        answers: doc.blocks
          .filter((b) => !["welcome", "statement"].includes(b.type))
          .filter((b) => answers[b.ref] !== undefined)
          .map((b) => ({ ref: b.ref, title: b.title, display: displayAnswer(b, answers[b.ref]) })),
        canRepeat: !oncePerPerson,
      },
      resume: null,
    };
  }

  /**
   * They asked to start from nothing, and signing in does not undo that.
   *
   * The session was opened by "Start over", which cleared the screen and
   * declined the device match. Handing their half-finished response back a few
   * turns later — because the sign-in gate finally learned their name — refills
   * everything they just asked to be rid of, which is what the button is for.
   *
   * Only the resume is dropped. `blocked` above is the form author's rule about
   * how many responses one person may leave, and no button a respondent presses
   * is a way around it.
   */
  if (sess.started_over) return NOTHING;

  return { blocked: null, resume: history.resumable };
}

export function mountRespondentAuth(router: AuthRouter, opts: Options): void {
  const { resolve, stub, base } = opts;

  const attach = async (c: Ctx, identity: RespondentIdentity, sessionId: string) => {
    const verdict = await assessIdentity(
      c.env,
      sessionId,
      identity,
      opts.acknowledgePriorResponse === true,
    );
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
            outcome: verdict.blocked.outcome,
            ending: verdict.blocked.ending,
            answers: verdict.blocked.answers,
            canRepeat: verdict.blocked.canRepeat,
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
