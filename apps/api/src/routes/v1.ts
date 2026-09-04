import { Hono, type MiddlewareHandler } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { readFormDoc, type FormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { ErrorEnvelope } from "../lib/openapi.js";
import { requireApiKey, assertChatSessionAccess, type GuardVars } from "../lib/guards.js";
import { burstLimit } from "../lib/ratelimit.js";
import { apiRequestLog } from "../lib/api-log.js";
import { mountRespondentAuth, type AuthRouter } from "./respondent-auth.js";
import { entitlementsFor, requireScope, type AuthzVars } from "../lib/authorize.js";
import { meter } from "../lib/entitlements.js";
import { featureLocked, limitReached } from "@repo/entitlements";
import type { SessionDO } from "../do/session-do.js";
import { responsesRouter } from "./v1/responses.js";
import { metaRouter } from "./v1/meta.js";
import { chatRouter } from "./v1/chat.js";
import { formsV1Router } from "./v1/forms.js";
import { webhooksV1Router } from "./v1/webhooks.js";
import { exportsV1Router } from "./v1/exports.js";
import { uploadsV1Router } from "./uploads.js";

/**
 * Developer API v1 — API-key auth, headless chat contract.
 * Keys are created in the dashboard (Better Auth apiKey plugin) and sent as
 * `Authorization: Bearer sk_...`.
 */

export const v1Router = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

/**
 * The middleware chain, in the order it must run.
 *
 * 1. telemetry, outermost, so a 401 or a 429 is observable too
 * 2. burst limiting, before any database work
 * 3. key verification (per-key window, origin policy, RateLimit-* headers)
 * 4. the paid-feature gate and the monthly meter
 * 5. per-route scope checks, declared next to each route
 */
v1Router.use("*", apiRequestLog);
v1Router.use("*", burstLimit);
v1Router.use("*", requireApiKey);

/**
 * The headless API is a paid feature, metered per request.
 *
 * Gated here rather than at key creation because a plan can lapse while a key stays
 * valid — and a key that silently keeps working after a downgrade is a feature nobody is
 * paying for. The 402 body is the same envelope a browser gets, so an integrator sees a
 * machine-readable reason rather than a bare 403.
 *
 * Metered on the way in rather than on success: an API request costs us the work whether
 * or not the caller liked the answer, and an error loop must not be free.
 */
v1Router.use("*", async (c, next) => {
  const orgId = c.get("orgId");
  /**
   * Unreachable now that keys are organization-owned, and a 401 rather than a
   * pass-through because it used to be one: `return next()` here meant a key
   * with no resolvable org skipped both the feature gate and the meter.
   */
  if (!orgId) {
    return c.json({ error: { code: "unauthorized", message: "Key has no organization" } }, 401);
  }
  const ent = await entitlementsFor(c as never);
  if (!ent.features.api_access) {
    return c.json(featureLocked("api_access", ent.planId, { surface: "v1" }), 402);
  }
  const result = await meter(c.env, orgId, "api_requests", 1, ent);
  if (!result.ok && result.limitKey && result.limit != null) {
    c.header("retry-after", String(Math.max(1, Math.ceil((result.resetsAt - Date.now()) / 1000))));
    return c.json(
      limitReached({
        limitKey: result.limitKey,
        plan: ent.planId,
        used: result.used,
        limit: result.limit,
        resetsAt: result.resetsAt,
        context: { surface: "v1" },
      }),
      402,
    );
  }
  await next();
});

/**
 * A chat session may only be driven or read by the org that owns its form.
 * Without this any valid API key could drive any session by guessing an id.
 */
const assertSessionOwnership: MiddlewareHandler<{ Bindings: Bindings; Variables: Partial<GuardVars> }> = async (c, next) => {
  const orgId = c.get("orgId");
  const sid = c.req.param("sid");
  if (!orgId || !sid || !(await assertChatSessionAccess(c.env, sid, orgId))) {
    return c.json({ error: { code: "not_found", message: "Session not found" } }, 404);
  }
  await next();
};

v1Router.use("/chat/sessions/:sid", assertSessionOwnership);
v1Router.use("/chat/sessions/:sid/*", assertSessionOwnership);

/**
 * The response lifecycle: open, answer into, complete.
 *
 * Mounted on the same router so it inherits the whole middleware chain —
 * telemetry, burst limiting, verification, the feature gate and the meter —
 * rather than re-declaring any of it.
 */
v1Router.route("/", responsesRouter);

/**
 * Self-description: the block catalog, the event catalog, and who this key is.
 *
 * No scope required — these describe the API rather than touch anyone's data,
 * and a key that cannot read its own capabilities is a key nobody can debug.
 */
v1Router.route("/", metaRouter);

/** Forms, programmatically: list, read, create, edit, publish, delete. */
v1Router.route("/", formsV1Router);

/**
 * Webhook endpoints.
 *
 * The dashboard's own routes are session-guarded, so the `webhook:*` scopes
 * described an ability no key actually had.
 */
v1Router.route("/", webhooksV1Router);

/**
 * Bulk export and the file bytes behind a `file_upload` answer.
 *
 * `response:export` and `file:read` were grantable scopes with no endpoint
 * behind them until this.
 */
v1Router.route("/", exportsV1Router);

/**
 * Uploading a file headlessly.
 *
 * The same intent → PUT → confirm the chat uses, resolved against the key's
 * organization rather than a respondent token. Without it a `file_upload`
 * question could not be answered over the API at all, which made every form
 * containing one impossible to complete programmatically.
 */
v1Router.route("/", uploadsV1Router);

// ─── headless chat ───

/**
 * The conversational surface.
 *
 * Mounted once. The legacy `/v1/chat/sessions/…` spellings are registered inside
 * the router itself — mounting the whole thing under `/chat` as well also
 * produced `/v1/chat/forms/…`, which was never a real path and appeared in the
 * published reference as though it were.
 */
v1Router.route("/", chatRouter);
