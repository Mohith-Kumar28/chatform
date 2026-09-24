import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { Scalar } from "@scalar/hono-api-reference";
import type { Bindings } from "./env.js";
import { webOrigins } from "./lib/origins.js";
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
import { paymentAccountsRouter, paymentAccountsPublicRouter } from "./routes/payment-accounts.js";
import { paymentWebhooksRouter } from "./routes/payment-webhooks.js";
import { formPaymentsRouter } from "./routes/form-payments.js";
import { previewRouter } from "./routes/preview.js";
import { templatesRouter } from "./routes/templates.js";
import { auditRouter } from "./routes/audit.js";
import { formHistoryRouter } from "./routes/form-history.js";
import { adminRouter } from "./routes/admin/index.js";
import { mountOpenApiSpec } from "./lib/openapi.js";
import { requestId, type RequestIdVars } from "./lib/request-id.js";
import { publicIpLimit } from "./lib/ratelimit.js";
import { attachErrorContext, apiError } from "./lib/api-error.js";

/**
 * A JSON body has no business being larger than this. 256 KB is generous: the
 * largest one a client legitimately sends is a form document, and the comment
 * at `forms.ts:556` puts those around 80 KB.
 */
const MAX_JSON_BODY = 256 * 1024;

/**
 * The routes that carry bytes rather than JSON, and are bounded by their own
 * rules instead.
 *
 * Each of these either streams to R2 against a plan limit — the only way a
 * 100 MB file fits through a 128 MB Worker — or measures itself (the feedback
 * snapshot's own 256 KB check), or belongs to a transport that frames its own
 * payload (`/mcp`). A global ceiling below their real limits would reject
 * legitimate uploads on the `Content-Length` check before the handler ever
 * runs.
 *
 * This has to be a path test rather than a mount-order trick: `app.use("*")`
 * registered ahead of the routers still runs for every one of them.
 */
const SELF_BOUNDED_BODY = [
  /^\/(?:p|v1)\/sessions\/[^/]+\/uploads\/[^/]+$/,
  /^\/api\/assets$/,
  /^\/(?:api|v1)\/forms\/[^/]+\/knowledge\/upload$/,
  /^\/p\/sessions\/[^/]+\/feedback\/[^/]+\/snapshot$/,
  /^\/mcp$/,
];

export function createApp() {
  const app = new Hono<{ Bindings: Bindings; Variables: Partial<RequestIdVars> }>();

  /**
   * First, and on every path. Registered before the routers so a 404 from
   * `notFound` and a 500 from `onError` carry a correlation id too — those are
   * the responses a support conversation actually starts from.
   */
  app.use("*", requestId);

  /**
   * Security headers on every response, including the ones the routers never
   * see — a 404 and a 500 both leave through here.
   *
   * Mounted **after `requestId`**, and that is load-bearing rather than tidy.
   * `secureHeaders` mutates `c.res.headers` directly, and a response handed
   * back from `stub.fetch()` — the SSE stream out of `SessionDO` — has
   * immutable headers in workerd. What makes this legal is that `requestId`
   * calls `c.header()` before `next()`, which forces Hono to re-instantiate a
   * mutable response. Move this above it and the event stream starts throwing
   * "Can't modify immutable headers".
   *
   * `crossOriginResourcePolicy` is off deliberately. Its default is
   * `same-origin`, and this worker serves images cross-origin by design:
   * `GET /p/assets/:id` is loaded from `chatform.in` into `api.chatform.in` by
   * the chat runtime, the builder preview, the embed preview and the public
   * form config's own `assetUrl`. Leaving the default on blanks every form
   * logo, avatar, background and inline image. The asset routes already carry
   * the headers that matter for them — `nosniff` and a sandbox CSP — set
   * per-response at the point of serving.
   */
  app.use(
    "*",
    secureHeaders({
      crossOriginResourcePolicy: false,
      // A cross-origin isolated API would break the same asset loads.
      crossOriginEmbedderPolicy: false,
    }),
  );

  /**
   * One ceiling on every JSON body, before any handler reads one.
   *
   * The middleware only reads the stream when a request arrives chunked; with
   * a `Content-Length` it compares the header and returns. Either way the
   * bytes reach the handler unchanged, which is what keeps the Dodo webhook's
   * HMAC-over-raw-bytes valid.
   */
  const limitBody = bodyLimit({
    maxSize: MAX_JSON_BODY,
    onError: (c) =>
      c.json(
        { error: { code: "too_large", message: `Request body may not exceed ${MAX_JSON_BODY} bytes` } },
        413,
      ),
  });
  app.use("*", async (c, next) =>
    SELF_BOUNDED_BODY.some((route) => route.test(c.req.path)) ? next() : limitBody(c, next),
  );

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
   * Gateway webhooks, registered ahead of the `/p` IP limiter below so they
   * answer before it runs.
   *
   * Cashfree, Razorpay and Stripe deliver every merchant's events from a small
   * pool of their own addresses. Counted per address, a 120-a-minute window
   * becomes a ceiling on how many respondents across the whole platform can
   * pay in a minute, and each 429 is a settlement pushed back to the gateway's
   * retry schedule. The HMAC signature is what stands in front of these
   * routes instead — see `routes/payment-webhooks.ts`.
   */
  app.route("/p", paymentWebhooksRouter);

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

  /**
   * The dashboard surface, and the only one that carries the session cookie.
   *
   * The origin is checked against `WEB_ORIGINS`, not reflected. Reflecting it
   * here was a hole rather than a convenience: in production the API is on
   * `api.chatform.in` and the app on `chatform.in`, which are different hosts,
   * so `needsCrossSiteCookies` is true and the session cookie is issued
   * `SameSite=None`. A browser therefore sends it on requests from *any* site
   * — and with the origin reflected beside `credentials: true`, any page a
   * signed-in customer happened to visit could read the response. Every
   * cookie-authenticated route is behind that: their forms, every respondent's
   * answers and transcripts, deletes, publishes, API keys, billing. Nothing
   * else stood in the way, because `requireSession` reads the cookie and asks
   * nothing about where the request came from, and Better Auth's
   * `trustedOrigins` only covers `/api/auth/*`.
   *
   * `null` rather than a throw for an origin that is not allowed: the header is
   * simply absent, the browser refuses the read, and a request with no `Origin`
   * at all — curl, a server, our own worker — is unaffected.
   */
  app.use(
    "/api/*",
    cors({
      origin: (origin, c) => {
        if (!origin) return null;
        return webOrigins(c.env as Bindings).includes(origin.replace(/\/$/, "")) ? origin : null;
      },
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
    /**
     * A refusal a middleware raised on purpose is not a crash.
     *
     * Without this branch every `HTTPException` — a 413 from `bodyLimit`, and
     * anything else a middleware throws — was logged as `unhandled_error` and
     * answered with a 500, telling the caller the server had broken when in
     * fact it had declined. Nothing in this worker threw `HTTPException`
     * before, which is why the gap went unnoticed.
     */
    if (err instanceof HTTPException) {
      /**
       * A middleware that built its own response meant it; pass it through.
       *
       * The rest carry only a status and a message, and `getResponse()` renders
       * those as `text/plain` — so `POST` with `content-type: application/json`
       * and an empty body answered `Malformed JSON in request body` as text,
       * with no code to branch on and no request id to quote. Most HTTP clients
       * set that header on every POST, so it was easy to hit and impossible to
       * handle.
       */
      if (err.res) return err.res;
      const code = err.status === 413 ? "payload_too_large" : err.status === 400 ? "malformed_json" : "request_refused";
      return apiError(c, err.status, code, err.message || "The request was refused");
    }
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
   * The payment-gateway OAuth callbacks, for the same reason: the gateway
   * redirects the admin's browser here, and the signed single-use `state` is
   * the credential rather than a session — which the routers below would
   * demand before it could be read.
   */
  app.route("/api", paymentAccountsPublicRouter);

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
  app.route("/api", paymentAccountsRouter);
  app.route("/api", formPaymentsRouter);
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
