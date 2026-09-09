import { Hono } from "hono";
import { cors } from "hono/cors";
import { Scalar } from "@scalar/hono-api-reference";
import type { Bindings } from "./env.js";
import { healthRouter } from "./routes/health.js";
import publicRouter from "./routes/public.js";
import uploadsRouter, { filesAdminRouter, assetsRouter } from "./routes/uploads.js";
import { downloadRouter } from "./routes/download.js";
import { viewsRouter } from "./routes/results.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { formsRouter } from "./routes/forms.js";
import { knowledgeRouter } from "./routes/knowledge.js";
import { workspacesRouter } from "./routes/workspaces.js";
import { aiRouter } from "./routes/ai.js";
import { resultsRouter } from "./routes/results.js";
import { v1Router } from "./routes/v1.js";
import { mcpRouter } from "./routes/mcp.js";
import { setDispatchTarget } from "./mcp/dispatch.js";
import { keysRouter } from "./routes/keys.js";
import { webhooksRouter } from "./routes/webhook-admin.js";
import { integrationsRouter, feedRouter } from "./routes/integrations.js";
import { billingRouter, billingPublicRouter } from "./routes/billing.js";
import { previewRouter } from "./routes/preview.js";
import { templatesRouter } from "./routes/templates.js";
import { auditRouter } from "./routes/audit.js";
import { formHistoryRouter } from "./routes/form-history.js";
import { adminRouter } from "./routes/admin/index.js";
import { mountOpenApiSpec } from "./lib/openapi.js";
import { requestId, type RequestIdVars } from "./lib/request-id.js";
import { publicIpLimit } from "./lib/ratelimit.js";
import { attachErrorContext } from "./lib/api-error.js";

export function createApp() {
  const app = new Hono<{ Bindings: Bindings; Variables: Partial<RequestIdVars> }>();

  /**
   * First, and on every path. Registered before the routers so a 404 from
   * `notFound` and a 500 from `onError` carry a correlation id too — those are
   * the responses a support conversation actually starts from.
   */
  app.use("*", requestId);

  app.use(
    "/p/*",
    cors({
      origin: (origin) => origin ?? "*",
      allowHeaders: ["content-type", "x-respondent-token"],
      exposeHeaders: ["retry-after"],
      maxAge: 86400,
    }),
  );
  /**
   * After CORS, so a 429 is a response the page can actually read.
   *
   * A refusal that the browser blocks on origin grounds reaches the client as a
   * network error with no status and no `retry-after`, which is the one thing
   * the chat client cannot tell apart from the connection dropping — it would
   * retry, which is precisely wrong. `retry-after` is already in the
   * `exposeHeaders` list above.
   *
   * Mounted on `/p` rather than globally: `/v1` has `burstLimit` and a
   * per-key sustained window of its own, and counting a developer's request in
   * both places would quietly halve the limit they are paying for.
   */
  app.use("/p/*", publicIpLimit);

  app.use(
    "/api/*",
    cors({
      origin: (origin) => origin ?? "*",
      /**
       * `x-chatform-impersonate` is here because a browser will not send a
       * custom header the preflight did not allow — and it fails *silently*:
       * the `OPTIONS` succeeds, the real request is simply never made, and the
       * page renders an empty state as though the account had no data. It works
       * perfectly from curl, which has no preflight, so this is the one class of
       * bug that cannot be found without driving a real browser.
       */
      allowHeaders: ["content-type", "authorization", "x-chatform-impersonate"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["retry-after"],
      credentials: true,
      maxAge: 86400,
    }),
  );

  /**
   * `/v1` is the only surface a third-party server calls, so it is the only one
   * that needs CORS at all — and it needs it because publishable (`pk_`) keys
   * are used from a browser.
   *
   * The origin is reflected rather than allowlisted here, and that is
   * deliberate: a preflight carries no key, so this layer cannot know which
   * origins a given key permits. CORS is not the security boundary — the
   * per-key origin allowlist checked in `requireApiKey` is, and it refuses the
   * real request. Credentials stay off: a key is a bearer token, and cookies
   * have no business on this surface.
   */
  app.use(
    "/v1/*",
    cors({
      origin: (origin) => origin ?? "*",
      allowHeaders: ["content-type", "authorization", "x-api-key", "idempotency-key", "x-request-id"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: [
        "retry-after",
        "x-request-id",
        "ratelimit-limit",
        "ratelimit-remaining",
        "ratelimit-reset",
        "ratelimit-policy",
        "idempotency-replayed",
      ],
      maxAge: 86400,
    }),
  );

  /**
   * `/mcp` mirrors `/v1`'s CORS, plus the two headers the MCP transport needs.
   *
   * Kept even though `/mcp` is a secret-key surface and a browser has no business
   * presenting one: a preflight carries no key, so refusing it here would only
   * turn a clear 403 from `requireApiKey` into an opaque network error. The
   * per-key checks remain the boundary, exactly as on `/v1`.
   */
  app.use(
    "/mcp",
    cors({
      origin: (origin) => origin ?? "*",
      allowHeaders: [
        "content-type",
        "authorization",
        "x-api-key",
        "mcp-session-id",
        "mcp-protocol-version",
        "last-event-id",
      ],
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      exposeHeaders: ["mcp-session-id", "retry-after", "x-request-id", "ratelimit-remaining", "ratelimit-reset"],
      maxAge: 86400,
    }),
  );

  /** Every `/v1` error body leaves with a request id and a link to its docs. */
  app.use("/v1/*", async (c, next) => {
    await next();
    await attachErrorContext(c);
  });

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Route not found" } }, 404));
  app.onError((err, c) => {
    console.error("unhandled_error", { requestId: c.get("requestId"), path: c.req.path }, err);
    return c.json({ error: { code: "internal_error", message: "Internal server error" } }, 500);
  });

  /**
   * Mounted before every other `/api` router, and that placement is load-bearing.
   *
   * Each mounted router declares `.use("*", requireSession)`, which `app.route("/api", …)`
   * expands to `/api/*` — so those middlewares match every `/api` request, not just the
   * routes of the router that declared them. The Dodo webhook and the public pricing
   * catalogue are rejected with "Sign in required" no matter how they are written unless
   * they are registered first, which is the second reason billing never worked. Registering
   * them here means they answer and return before any session middleware runs.
   */
  app.route("/api", billingPublicRouter);

  /**
   * The platform console, mounted early for exactly the reason above.
   *
   * Every other `/api` router declares `.use("*", requireSession)`, which expands
   * to `/api/*` and therefore runs on requests to routes it does not own. Mounted
   * last, `/api/admin/*` was answering 401 "Sign in required" from some other
   * router's middleware before `requirePlatformAdmin` ever ran — which quietly
   * broke the one property this surface is supposed to have: that it is
   * indistinguishable from a route that does not exist.
   *
   * Its own guard is scoped to `/admin/*` rather than `*`, so mounting it first
   * costs the other routers nothing.
   */
  app.route("/api", adminRouter);

  app.route("/health", healthRouter);
  publicRouter.route("/", uploadsRouter);
  publicRouter.route("/", assetsRouter);
  app.route("/p", feedRouter);
  app.route("/p", viewsRouter);
  app.route("/p", publicRouter);
  app.route("/api", dashboardRouter);
  app.route("/api", formsRouter);
  app.route("/api", knowledgeRouter);
  app.route("/api", workspacesRouter);
  app.route("/api", aiRouter);
  app.route("/api", resultsRouter);
  app.route("/v1", v1Router);
  app.route("/mcp", mcpRouter);
  /**
   * Signed downloads sit outside every auth chain on purpose: the signature is
   * the credential. See `lib/signed-url.ts`.
   */
  app.route("/d", downloadRouter);
  app.route("/api", keysRouter);
  app.route("/api", webhooksRouter);
  app.route("/api", integrationsRouter);
  app.route("/api", billingRouter);
  app.route("/api", previewRouter);
  app.route("/api", templatesRouter);
  app.route("/api", filesAdminRouter);
  app.route("/api", auditRouter);
  app.route("/api", formHistoryRouter);

  // OpenAPI spec + Scalar docs
  mountOpenApiSpec(app);
  app.get("/docs", Scalar({ url: "/openapi.json" }));

  /**
   * MCP tools reach the API by re-entering this app, so they need a handle on it.
   *
   * Set last, after every route is mounted, and after `mountOpenApiSpec` in
   * particular — the passthrough tools index `/openapi.json`, which does not exist
   * as a route until that call has run.
   */
  setDispatchTarget(app as unknown as Parameters<typeof setDispatchTarget>[0]);

  return app;
}

export type AppType = ReturnType<typeof createApp>;
