import { Hono } from "hono";
import { cors } from "hono/cors";
import { Scalar } from "@scalar/hono-api-reference";
import type { Bindings } from "./env.js";
import { healthRouter } from "./routes/health.js";
import publicRouter from "./routes/public.js";
import uploadsRouter, { filesAdminRouter } from "./routes/uploads.js";
import { viewsRouter } from "./routes/results.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { formsRouter } from "./routes/forms.js";
import { aiRouter } from "./routes/ai.js";
import { resultsRouter } from "./routes/results.js";
import { v1Router } from "./routes/v1.js";
import { keysRouter } from "./routes/keys.js";
import { webhooksRouter } from "./routes/webhook-admin.js";
import { billingRouter, billingPublicRouter } from "./routes/billing.js";
import { previewRouter } from "./routes/preview.js";
import { templatesRouter } from "./routes/templates.js";
import { auditRouter } from "./routes/audit.js";
import { mountOpenApiSpec } from "./lib/openapi.js";
import { requestId, type RequestIdVars } from "./lib/request-id.js";
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

  app.use(
    "/api/*",
    cors({
      origin: (origin) => origin ?? "*",
      allowHeaders: ["content-type", "authorization"],
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

  app.route("/health", healthRouter);
  publicRouter.route("/", uploadsRouter);
  app.route("/p", viewsRouter);
  app.route("/p", publicRouter);
  app.route("/api", dashboardRouter);
  app.route("/api", formsRouter);
  app.route("/api", aiRouter);
  app.route("/api", resultsRouter);
  app.route("/v1", v1Router);
  app.route("/api", keysRouter);
  app.route("/api", webhooksRouter);
  app.route("/api", billingRouter);
  app.route("/api", previewRouter);
  app.route("/api", templatesRouter);
  app.route("/api", filesAdminRouter);
  app.route("/api", auditRouter);

  // OpenAPI spec + Scalar docs
  mountOpenApiSpec(app);
  app.get("/docs", Scalar({ url: "/openapi.json" }));

  return app;
}

export type AppType = ReturnType<typeof createApp>;
