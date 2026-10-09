import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import { readFormDoc, sha256Hex, type FormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { SessionDO } from "../do/session-do.js";
import { getAuth } from "../lib/auth-instance.js";
import { validator } from "../lib/validator.js";
import { ErrorEnvelope } from "../lib/openapi.js";
import { SESSION_LOCATION, sessionObjectId, mintSessionId } from "../lib/session-location.js";
import { verifyTurnstile } from "../lib/open-session.js";
import {
  ANON_DAILY_LIMIT,
  USER_DAILY_LIMIT,
  claimDemo,
  demoQuotaKey,
  refundDemo,
} from "../lib/template-demo-quota.js";

/**
 * Trying a template live, from its public page at `/form-templates/<slug>`.
 *
 * Public, signed in or not, so it is mounted ahead of the session-guarded
 * routers (as `importRouter` is). The conversation is a preview session, the
 * same kind the builder's preview runs: it talks to the real runtime and the
 * real model, and it writes nothing to submissions, analytics or any
 * organization's quota. It belongs to the system organization from migration
 * 0053, so its model spend shows up there on the admin cost pages.
 *
 * What it costs is capped per person per day (`lib/template-demo-quota.ts`):
 * by user id when signed in, by FingerprintJS device id when not, and never by
 * IP address.
 */
export const TEMPLATE_DEMO_ORG = "org_template_demos";
export const TEMPLATE_DEMO_FORM = "frm_template_demo";

/** Long enough to walk any template in the catalogue with a few detours, short enough to stop a runaway. */
const DEMO_TURN_LIMIT = 60;
/** A template try is one short conversation; this is several times what one really uses. */
const DEMO_TOKEN_BUDGET = 150_000;

export const templateDemoRouter = new Hono<{ Bindings: Bindings }>();

export const DemoSessionBody = z.object({
  /** The visitor's FingerprintJS id, from `getRespondentSignal()`. Hashed before it is stored. */
  deviceSignal: z.string().max(200).optional(),
  turnstileToken: z.string().max(4000).optional(),
});

const DemoSession = z.object({
  sessionId: z.string(),
  sseUrl: z.string(),
  respondentToken: z.string(),
  /** Live tries left today, after this one. */
  remaining: z.number(),
  limit: z.number(),
});

templateDemoRouter.post(
  "/templates/:slug/demo-sessions",
  validator("json", DemoSessionBody),
  describeRoute({
    tags: ["dashboard"],
    summary: "Try an official template live",
    description:
      "Public. Starts a preview conversation with an official template, for the try-it panel on its public page. " +
      `Nothing is stored as a response. Limited to ${ANON_DAILY_LIMIT} a day for a signed-out device and ${USER_DAILY_LIMIT} a day for a signed-in user.`,
    responses: {
      200: { description: "The session to connect the chat to", content: { "application/json": { schema: resolver(DemoSession) } } },
      400: { description: "No device id was sent by a signed-out visitor", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      404: { description: "No official template has this slug", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      429: { description: "Today's live tries are used up", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const { deviceSignal, turnstileToken } = c.req.valid("json");
    const slug = c.req.param("slug");

    const template = await c.env.DB.prepare(
      `SELECT schema_json FROM form_templates WHERE slug = ? AND official = 1 AND organization_id IS NULL`,
    )
      .bind(slug)
      .first<{ schema_json: string }>();
    if (!template) return c.json({ error: { code: "not_found", message: "Template not found" } }, 404);

    const session = await getAuth(c.env)
      .api.getSession({ headers: c.req.raw.headers })
      .catch(() => null);
    const userId = session?.user?.id ?? null;
    const signedIn = userId !== null;
    const key = await demoQuotaKey(
      c.env,
      signedIn ? { kind: "user", userId } : { kind: "device", signal: deviceSignal ?? "" },
    );
    if (!key) {
      return c.json(
        {
          error: {
            code: "device_required",
            message: "We couldn't start a live try in this browser. Sign in to try it, or use the template to make your own.",
          },
        },
        400,
      );
    }

    const limit = signedIn ? USER_DAILY_LIMIT : ANON_DAILY_LIMIT;
    const claim = await claimDemo(c.env, key, limit);
    if (!claim.ok) {
      return c.json(
        {
          error: {
            code: "demo_daily_limit",
            message: signedIn
              ? `You've used today's ${limit} live tries. Come back tomorrow, or use this template to make it your own.`
              : `You've used today's ${limit} live tries. Come back tomorrow, or sign in and use this template to make your own.`,
            signedIn,
            limit,
          },
        },
        429,
      );
    }

    /*
     * A signed-out visitor who fails the bot check still gets the template,
     * with scripted questions instead of the model. Refusing them would turn a
     * false positive into a dead end (see `verifyTurnstile`); running the model
     * for a script would turn a rotated fingerprint into our bill.
     */
    let aiDegraded = false;
    if (!signedIn && c.env.TURNSTILE_SECRET_KEY) {
      aiDegraded = (await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, turnstileToken)) === "rejected";
    }

    const doc: FormDoc = readFormDoc(JSON.parse(template.schema_json));
    doc.settings.agent.sessionTokenBudget = Math.min(doc.settings.agent.sessionTokenBudget ?? DEMO_TOKEN_BUDGET, DEMO_TOKEN_BUDGET);

    const sessionId = mintSessionId(c.env.SESSION_DO);
    const respondentToken = crypto.randomUUID().replace(/-/g, "");
    const now = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO chat_sessions (id, form_id, organization_id, respondent_token_hash, status, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    )
      .bind(sessionId, TEMPLATE_DEMO_FORM, TEMPLATE_DEMO_ORG, sha256Hex(respondentToken), now, now)
      .run();

    const stub = c.env.SESSION_DO.get(sessionObjectId(c.env.SESSION_DO, sessionId), SESSION_LOCATION) as unknown as InstanceType<typeof SessionDO>;
    const init = await stub.init({
      sessionId,
      formId: TEMPLATE_DEMO_FORM,
      formVersionId: "preview",
      organizationId: TEMPLATE_DEMO_ORG,
      slug,
      brandingHidden: true,
      aiDegraded,
      docJson: doc,
      respondentToken,
      hiddenFields: {},
      country: null,
      userAgent: "template-demo",
      turnLimit: DEMO_TURN_LIMIT,
    });
    if (!init.ok) {
      await refundDemo(c.env, key);
      return c.json({ error: { code: init.code, message: "We couldn't start this template. Try again in a moment." } }, 400);
    }

    console.log("template_demo_started", { slug, signedIn, aiDegraded, remaining: claim.remaining });
    return c.json({
      sessionId,
      sseUrl: `/p/sessions/${sessionId}/events`,
      respondentToken,
      remaining: claim.remaining,
      limit,
    });
  },
);
