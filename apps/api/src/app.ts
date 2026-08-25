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
import { billingRouter } from "./routes/billing.js";
import { previewRouter } from "./routes/preview.js";
import { templatesRouter } from "./routes/templates.js";
import { mountOpenApiSpec } from "./lib/openapi.js";

export function createApp() {
  const app = new Hono<{ Bindings: Bindings }>();

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

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Route not found" } }, 404));
  app.onError((err, c) => {
    console.error("unhandled_error", err);
    return c.json({ error: { code: "internal_error", message: "Internal server error" } }, 500);
  });

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

  // OpenAPI spec + Scalar docs
  mountOpenApiSpec(app);
  app.get("/docs", Scalar({ url: "/openapi.json" }));

  return app;
}

export type AppType = ReturnType<typeof createApp>;
