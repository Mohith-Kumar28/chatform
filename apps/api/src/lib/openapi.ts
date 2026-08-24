import type { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";

export const CreateSessionResponse = z.object({
  sessionId: z.string(),
  sseUrl: z.string(),
  respondentToken: z.string(),
});
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;

export const HealthResponse = z.object({
  ok: z.boolean(),
  env: z.string(),
  db: z.string(),
  ts: z.number(),
});

export const ErrorEnvelope = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

/** Mounts GET /openapi.json generating the spec from described routes. */
export function mountOpenApiSpec(app: Hono<{ Bindings: Bindings }>) {
  app.get(
    "/openapi.json",
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "chatform API",
          version: "1.0.0",
          description:
            "Agentic chatbot forms platform. /p/* = public respondent surface, /v1/* = developer API (API key), /api/* = dashboard (session auth).",
        },
        servers: [{ url: "/" }],
        tags: [
          { name: "public", description: "Respondent chat surface" },
          { name: "health", description: "Service health" },
        ],
      },
      exclude: ["/docs", "/openapi.json"],
    }),
  );
}
