import { Hono } from "hono";
import { cors } from "hono/cors";
import { Scalar } from "@scalar/hono-api-reference";
import type { Bindings } from "./env.js";
import { healthRouter } from "./routes/health.js";
import publicRouter from "./routes/public.js";
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

  app.notFound((c) => c.json({ error: { code: "not_found", message: "Route not found" } }, 404));
  app.onError((err, c) => {
    console.error("unhandled_error", err);
    return c.json({ error: { code: "internal_error", message: "Internal server error" } }, 500);
  });

  app.route("/health", healthRouter);
  app.route("/p", publicRouter);

  // OpenAPI spec + Scalar docs
  mountOpenApiSpec(app);
  app.get("/docs", Scalar({ url: "/openapi.json" }));

  return app;
}

export type AppType = ReturnType<typeof createApp>;
