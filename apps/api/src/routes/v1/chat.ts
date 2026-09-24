import { Hono, type MiddlewareHandler } from "hono";
import { RotatedTokenView, SessionEventsView, SessionStateView, TurnResultView } from "../../lib/v1-schemas.js";
import { resolveRespondent } from "../../lib/respondents.js";
import { describeRoute, resolver } from "hono-openapi";
import { validator } from "../../lib/validator.js";
import { z } from "zod";
import { sha256Hex, toPublicBlock, RefString, readFormDoc } from "@repo/form-schema";
import { HiddenFieldsInput } from "../../lib/inputs.js";
import type { Bindings } from "../../env.js";
import { assertChatSessionAccess, keyOwnsForm, type GuardVars } from "../../lib/guards.js";
import { requireScope, type AuthzVars } from "../../lib/authorize.js";
import { idempotent } from "../../lib/idempotency.js";
import { openSession, type FormRow } from "../../lib/open-session.js";
import type { SessionDO } from "../../do/session-do.js";
import { mountRespondentAuth, type AuthRouter } from "../respondent-auth.js";
import { confirmPaymentForSession, providersForAccounts, startPaymentForSession } from "../../lib/payments/service.js";

/**
 * The conversational API, headless.
 *
 * Everything the hosted chat can do, driven from a customer's own server: open a
 * session, answer, act on it, and either take the result synchronously or attach
 * to the same event stream the browser uses.
 */

export const chatRouter = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

function stub(env: Bindings, sessionId: string) {
  return env.SESSION_DO.get(env.SESSION_DO.idFromName(sessionId)) as unknown as DurableObjectStub<SessionDO>;
}

/**
 * A session may only be driven by the organization that owns its form.
 *
 * Without this, any valid key could drive any session by guessing an id — and
 * session ids are short.
 */
const assertSessionOwnership: MiddlewareHandler<{
  Bindings: Bindings;
  Variables: Partial<GuardVars>;
}> = async (c, next) => {
  const orgId = c.get("orgId");
  const sid = c.req.param("sid")!;
  if (!orgId || !sid || !(await assertChatSessionAccess(c.env, sid, orgId))) {
    return c.json({ error: { code: "not_found", message: "Session not found" } }, 404);
  }
  await next();
};

/**
 * Both spellings of a session path.
 *
 * The original surface put `chat` in the path and integrations were written
 * against it, so `/v1/chat/sessions/…` still answers. Registering each route
 * twice — rather than mounting the whole router under `/chat`, which is what
 * this used to do — keeps `/v1/chat/forms/…` from appearing in the published
 * spec as though it were a real endpoint.
 */
const SESSION_BASES = ["/sessions/:sid", "/chat/sessions/:sid"] as const;

for (const base of SESSION_BASES) {
  chatRouter.use(base, assertSessionOwnership);
  chatRouter.use(`${base}/*`, assertSessionOwnership);
}

const CreateSessionBody = z
  .object({
    hiddenFields: HiddenFieldsInput.optional(),
    /** Your own identifier for this respondent, echoed back in webhooks. */
    externalId: z.string().max(200).optional(),
    /** Seconds the returned respondent token stays usable. */
    expiresIn: z.number().int().min(300).max(2_592_000).optional(),
    respondent: z
      .object({ ipHash: z.string().max(128).optional(), country: z.string().max(8).optional(), userAgent: z.string().max(300).optional() })
      .optional(),
  })
  .prefault({});

const SessionCreated = z.object({
  sessionId: z.string(),
  respondentToken: z.string(),
  expiresAt: z.number(),
  streamUrl: z.string(),
  greeting: z.string().nullable(),
  question: z.unknown().nullable(),
});

/**
 * Opening a session, registered at two paths.
 *
 * The original shape was `/v1/forms/:id/chat/sessions` and integrations were
 * written against it, so it keeps answering. `/v1/forms/:id/sessions` is the
 * shape everything else now uses.
 */
const createSessionRoute = (path: string) =>
  chatRouter.post(
  path,
  requireScope("session", "create"),
  idempotent("POST /v1/forms/:id/sessions"),
  validator("json", CreateSessionBody),
  describeRoute({
    tags: ["v1"],
    summary: "Open a conversation on a published form",
    responses: {
      200: { description: "Session", content: { "application/json": { schema: resolver(SessionCreated) } } },
      403: { description: "The form is closed, capped, or over its response ceiling" },
      404: { description: "Form not found" },
    },
  }),
  async (c) => {
    const orgId = c.get("orgId")!;
    // Registering the handler on two path shapes loosens the inferred param
    // type, so this is read rather than assumed.
    const formId = c.req.param("id") ?? "";
    if (!formId || !keyOwnsForm(c, formId)) {
      return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    }
    const body = c.req.valid("json");

    const formRow = await c.env.DB.prepare(
      `SELECT f.id, f.slug, f.status, f.close_at, f.organization_id, f.fingerprint_salt, fv.id AS version_id, fv.schema_json
         FROM forms f JOIN form_versions fv ON fv.id = f.active_version_id
        WHERE f.id = ? AND f.organization_id = ? AND f.status = 'published' AND f.deleted_at IS NULL`,
    )
      .bind(formId, orgId)
      .first<FormRow>();
    if (!formRow) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    /**
     * The same gate stack `/p` runs.
     *
     * `trustedCaller` turns off exactly two of them — the form password and the
     * captcha — because an API key is stronger proof than the first and there is
     * no browser to satisfy the second. The close date, the response ceiling and
     * maxSubmissions still apply: those are the form owner's rules about whether
     * their form is open.
     */
    const opened = await openSession({
      env: c.env,
      form: formRow,
      source: "api",
      hiddenFields: body.hiddenFields ?? {},
      ip: "",
      country: body.respondent?.country ?? null,
      userAgent: body.respondent?.userAgent ?? "api",
      trustedCaller: true,
      respondentIpHash: body.respondent?.ipHash,
      ttlSeconds: body.expiresIn,
      isTest: c.get("environment") === "test",
      apiKeyId: c.get("keyId") ?? null,
    });
    if (!opened.ok) return c.json(opened.body, opened.status);

    const init = await stub(c.env, opened.sessionId).init({
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
      ipHash: opened.ipHash || null,
      fingerprint: opened.device.value || null,
      /*
        Who this is, platform-wide, resolved once as the session opens and
        carried on the session rather than recomputed per response. A visit that
        offered nothing to recognise anybody by resolves to null and stays
        unattributed, which is the honest answer and keeps the count of people
        meaning what it says.
      */
      respondentId: await resolveRespondent(c.env, {
        deviceKey: opened.respondentDeviceKey,
      }),
      respondentDeviceKey: opened.respondentDeviceKey,
      // The source travels with the value, so a reader can tell "no fingerprint"
      // from "a fingerprint that happens to look like nothing".
      fingerprintSource: opened.device.source,
      country: body.respondent?.country ?? null,
      userAgent: body.respondent?.userAgent ?? "api",
      source: "api",
      isTest: c.get("environment") === "test",
    });
    if (!init.ok) return c.json({ error: { code: init.code, message: "Could not start session" } }, 400);

    const status = await stub(c.env, opened.sessionId).getStatus();
    const transcript = await stub(c.env, opened.sessionId).getTranscript();
    const greeting = [...transcript].reverse().find((m) => m.role === "assistant")?.content ?? null;
    const current = status?.currentRef
      ? opened.runtimeDoc.blocks.find((b) => b.ref === status.currentRef)
      : null;
    const question = current ? toPublicBlock(current) : null;
    // The same provider every later `question` carries; see `publicBlockOf` in the session object.
    if (question && current?.type === "payment" && current.method === "gateway" && current.paymentAccountId) {
      const provider = (await providersForAccounts(c.env, orgId, [current.paymentAccountId])).get(current.paymentAccountId);
      if (provider) question.paymentProvider = provider;
    }

    return c.json({
      sessionId: opened.sessionId,
      /**
       * Hand this to a browser rather than the API key.
       *
       * It is scoped to one session and expires, which is what makes a custom
       * front end safe to build: the secret key stays on the customer's server.
       */
      respondentToken: opened.respondentToken,
      expiresAt: opened.expiresAt,
      streamUrl: `/v1/sessions/${opened.sessionId}/events`,
      greeting,
      question,
    });
  },
);

createSessionRoute("/forms/:id/sessions");
createSessionRoute("/forms/:id/chat/sessions");

const MessageBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(5000) }),
  z.object({ type: z.literal("structured"), ref: RefString, value: z.unknown() }),
]);

/** Shared by the message and action routes: run it, and answer honestly if it is slow. */
async function respondToTurn(
  c: Parameters<MiddlewareHandler>[0],
  run: () => Promise<Awaited<ReturnType<SessionDO["handleUserTurnSync"]>>>,
) {
  const result = await run();
  if (!result.accepted) {
    return c.json({ error: { code: result.error ?? "rejected", message: "Turn rejected" } }, 400);
  }
  const body = {
    accepted: true,
    complete: result.complete,
    awaitingSubmit: result.awaitingSubmit,
    assistantMessages: result.assistantMessages,
    question: result.question,
    ending: result.ending,
    validation: result.validation,
    answers: result.status?.answers ?? {},
    collected: result.status?.collected ?? 0,
    /**
     * Set when the turn ended on a code step.
     *
     * A caller has to know this before sending anything else: while it is set
     * the session reads the next message as the code for that answer, not as an
     * answer of its own.
     */
    pendingVerification: result.status?.pendingVerification ?? null,
    /**
     * Set when the turn ended on an open checkout. The payment question cannot
     * be answered with a message — `payment_unverified` is all that comes back
     * — so a caller opens `launch` with the gateway, or calls `…/payments/…/confirm`,
     * and the session moves on once the gateway says it was paid. The
     * `payment_required`, `payment_settled` and `payment_failed` events are in
     * `events` as they happened.
     */
    pendingPayment: result.status?.pendingPayment ?? null,
    events: result.events,
    sinceSeq: result.sinceSeq,
  };
  if (result.timedOut) {
    /**
     * 202, not 200 — the turn is not finished — and not 504, because nothing
     * failed. The events already produced are returned, and `sinceSeq` is where
     * to resume.
     */
    return c.json(
      { ...body, status: "processing", pollUrl: `/v1/sessions/${c.req.param("sid") ?? ""}/events?since=${result.sinceSeq}` },
      202,
    );
  }
  return c.json(body);
}

const deadlineFrom = (c: { req: { query(k: string): string | undefined } }) => {
  const raw = Number(c.req.query("deadlineMs"));
  return Number.isFinite(raw) ? { deadlineMs: raw } : {};
};

const messagesRoute = (base: string) =>
  chatRouter.post(
  `${base}/messages`,
  requireScope("session", "write"),
  validator("json", MessageBody),
  describeRoute({
    tags: ["v1"],
    summary: "Send a message or a structured answer, and get the turn's result",
    responses: {
      200: { description: "The turn, with the next question", content: { "application/json": { schema: resolver(TurnResultView) } } },
      202: { description: "Still running; resume from sinceSeq" },
      400: { description: "Rejected" },
    },
  }),
  async (c) => {
    const sid = c.req.param("sid")!;
    const body = c.req.valid("json");
    return respondToTurn(c as never, () =>
      stub(c.env, sid).handleUserTurnSync(
        body.type === "text" ? { type: "text", text: body.text } : { type: "structured", ref: body.ref, value: body.value },
        deadlineFrom(c),
      ),
    );
  },
);

const actionsRoute = (base: string) =>
  chatRouter.post(
  `${base}/actions`,
  requireScope("session", "write"),
  validator(
    "json",
    z.object({
      /**
       * `resend_code` and `change_answer` apply while a `verify` email or phone
       * question is holding an answer until a code comes back: send the code
       * again, or drop it and ask the question afresh. The code itself is an
       * ordinary message.
       *
       * `undo_screen_out` is the only action a finished session accepts: it
       * takes back a refusal and reopens the answer that caused it.
       *
       * `retry_payment` and `cancel_payment` drop an open checkout and put the
       * payment question back. `simulate_payment` is refused outside a builder
       * preview, which a key can never open.
       */
      action: z.enum([
        "skip",
        "stop",
        "restart",
        "edit",
        "submit",
        "resend_code",
        "change_answer",
        "undo_screen_out",
        "retry_payment",
        "cancel_payment",
        "simulate_payment",
      ]),
      /**
       * For `edit`: the question to go back to — one already answered, or the
       * one the flow is waiting on. For `skip`, optional: the question meant, so
       * a skip that arrives after the flow has moved on is refused.
       */
      ref: z.string().optional(),
    }),
  ),
  describeRoute({
    tags: ["v1"],
    summary: "Skip, edit, restart, stop, submit, undo a screen-out, or resend a verification code",
    responses: {
      200: { description: "The turn's result", content: { "application/json": { schema: resolver(TurnResultView) } } },
      202: { description: "Still running" },
      400: { description: "Rejected" },
    },
  }),
  async (c) => {
    /**
     * Without this, a form with `requireSubmit` on — which is the default —
     * could never be completed over the API: the conversation parks on a review
     * step waiting for a submit nobody could send.
     */
    const sid = c.req.param("sid")!;
    const body = c.req.valid("json");
    return respondToTurn(c as never, () => stub(c.env, sid).actionSync(body, deadlineFrom(c)));
  },
);

const stateRoute = (base: string) =>
  chatRouter.get(
  base,
  requireScope("session", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "Session state",
    responses: {
      200: { description: "State", content: { "application/json": { schema: resolver(SessionStateView) } } },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const sid = c.req.param("sid")!;
    const status = await stub(c.env, sid).getStatus();
    if (!status) return c.json({ error: { code: "not_found", message: "Session not found" } }, 404);
    const row = await c.env.DB.prepare(`SELECT expires_at, is_test, source FROM chat_sessions WHERE id = ?`)
      .bind(sid)
      .first<{ expires_at: number | null; is_test: number; source: string }>();
    return c.json({
      ...status,
      sessionId: sid,
      expiresAt: row?.expires_at ?? null,
      mode: row?.is_test === 1 ? "test" : "live",
      source: row?.source ?? "api",
    });
  },
);

const eventsRoute = (base: string) =>
  chatRouter.get(
  `${base}/events`,
  requireScope("session", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "The session's events, streamed or pulled since a sequence number",
    responses: {
      200: {
        description:
          "Server-sent events when `Accept: text/event-stream`, otherwise a JSON page of events since `since`.",
        content: { "application/json": { schema: resolver(SessionEventsView) } },
      },
    },
  }),
  async (c) => {
    const sid = c.req.param("sid")!;
    const since = c.req.query("since");

    /**
     * One path, two transports.
     *
     * `Accept: text/event-stream` gets the same stream the browser gets. Anything
     * else gets a pull from durable storage, which is what a caller resuming
     * after a deadline or a dropped connection needs.
     *
     * Note that during an in-flight turn the pull blocks until the turn lands —
     * Durable Object input gates serialise it — which makes it a long poll. SSE
     * is the genuinely concurrent reader.
     */
    if (since !== undefined) {
      const seq = Number(since);
      if (!Number.isFinite(seq) || seq < 0) {
        return c.json({ error: { code: "invalid_since", message: "`since` must be a sequence number" } }, 400);
      }
      /**
       * Typed through the class rather than the stub.
       *
       * `SSEEnvelope.data` is `unknown`, which the Durable Object RPC types do
       * not accept as serialisable, so the stub resolves this method to `never`.
       * The value crosses the boundary fine — it is JSON — and the DO's own
       * signature is the honest one.
       */
      const page = await (stub(c.env, sid) as unknown as SessionDO).eventsSince(seq);
      const events = page.events as { seq: number }[];
      return c.json({
        events,
        latest_seq: page.latestSeq,
        // True when the page was capped: the caller should ask again from the
        // last sequence they received rather than assume they are caught up.
        has_more: events.length > 0 && page.latestSeq > (events[events.length - 1]?.seq ?? seq),
      });
    }
    return stub(c.env, sid).stream();
  },
);

/**
 * Open a verified checkout on the form admin's own gateway for the payment
 * question the session is on — the headless Pay button.
 *
 * The same contract as the hosted page's: the amount comes from the session,
 * never the caller, and the respondent must already be signed in through
 * `…/auth/*`. Hand `launch` to the gateway's own checkout in the respondent's
 * browser; the session settles when the gateway confirms, not when you say so.
 */
const startPaymentRoute = (base: string) =>
  chatRouter.post(
  `${base}/payments`,
  requireScope("session", "write"),
  validator(
    "json",
    z.object({
      ref: z.string().min(1).max(64),
      /** Only after a `phone_required` refusal: an E.164 number for the gateway's receipt. */
      phone: z.string().min(1).max(32).optional(),
    }),
  ),
  describeRoute({
    tags: ["v1"],
    summary: "Open a verified checkout for the current payment question",
    responses: {
      200: { description: "Checkout opened, or the one already open" },
      402: { description: "The organization's plan does not include payments" },
      409: {
        description:
          "Not payable right now: `stale_ref`, `payment_unavailable`, `preview_live_account`, `live_account_in_test_mode` (a `*_test_` key on a live account), `already_paid`",
      },
      422: { description: "`phone_required`: the gateway needs a number for the receipt — start again with `phone`" },
      429: { description: "`too_many_attempts`" },
    },
  }),
  async (c) => {
    const sid = c.req.param("sid")!;
    const { ref, phone } = c.req.valid("json");
    const result = await startPaymentForSession(c.env, sid, ref, { phone });
    return c.json(result.body as object, result.status);
  },
);

const confirmPaymentRoute = (base: string) =>
  chatRouter.post(
  `${base}/payments/:recordId/confirm`,
  requireScope("session", "write"),
  describeRoute({
    tags: ["v1"],
    summary: "Re-check a checkout with the gateway, and settle it if it was paid",
    responses: {
      200: { description: "Where the payment stands: `{ recordId, status, settled }`" },
      404: { description: "No such payment on this session" },
      502: { description: "The gateway could not be reached" },
    },
  }),
  async (c) => {
    const sid = c.req.param("sid")!;
    const result = await confirmPaymentForSession(c.env, sid, c.req.param("recordId") ?? "");
    return c.json(result.body as object, result.status);
  },
);

const rotateRoute = (base: string) =>
  chatRouter.post(
  `${base}/token/rotate`,
  requireScope("session", "write"),
  describeRoute({
    tags: ["v1"],
    summary: "Issue a fresh respondent token, invalidating the old one",
    responses: {
      200: { description: "The new token", content: { "application/json": { schema: resolver(RotatedTokenView) } } },
      404: { description: "Not found" },
    },
  }),
  async (c) => {
    const sid = c.req.param("sid")!;
    const token = crypto.randomUUID().replace(/-/g, "");
    const res = await c.env.DB.prepare(
      `UPDATE chat_sessions SET respondent_token_hash = ?, token_rotated_at = ?, last_activity_at = ? WHERE id = ?`,
    )
      .bind(sha256Hex(token), Date.now(), Date.now(), sid)
      .run();
    if ((res.meta?.changes ?? 0) === 0) {
      return c.json({ error: { code: "not_found", message: "Session not found" } }, 404);
    }
    return c.json({ respondentToken: token, rotatedAt: Date.now() });
  },
);

/**
 * Respondent sign-in, relayed.
 *
 * Ownership is already scoped above, so the caller here is the customer's
 * server: they collect a Google ID token or drive the OTP from their own UI and
 * pass it through.
 */
for (const base of SESSION_BASES) {
  messagesRoute(base);
  actionsRoute(base);
  stateRoute(base);
  eventsRoute(base);
  rotateRoute(base);
  startPaymentRoute(base);
  confirmPaymentRoute(base);
  mountRespondentAuth(chatRouter as unknown as AuthRouter, {
    base,
    stub: (env, sessionId) => stub(env, sessionId),
    resolve: async (c) => c.req.param("sid") ?? null,
  });
}

export { readFormDoc };
