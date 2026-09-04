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
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      issues: z
        .array(
          z.object({
            ref: z.string().optional(),
            path: z.string().optional(),
            code: z.string(),
            message: z.string(),
          }),
        )
        .optional(),
      request_id: z.string().optional(),
      doc_url: z.string().optional(),
    })
    .loose(),
});

/**
 * How each surface authenticates, stamped by path prefix rather than declared
 * per route.
 *
 * Doing it in one place is what keeps the spec from drifting away from the
 * middleware that actually enforces it — a `security` block copied onto forty
 * routes is forty chances to describe a guard that is not there.
 */
const SECURITY_BY_PREFIX: [string, Record<string, string[]>[]][] = [
  ["/v1/", [{ secretKey: [] }, { publishableKey: [] }, { apiKeyHeader: [] }]],
  ["/api/", [{ sessionCookie: [] }]],
  ["/p/", [{ respondentToken: [] }]],
];

function stampSecurity(doc: { paths?: Record<string, Record<string, unknown>> }) {
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    const security = SECURITY_BY_PREFIX.find(([prefix]) => path.startsWith(prefix))?.[1];
    if (!security) continue;
    for (const [method, operation] of Object.entries(item)) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      const op = operation as { security?: unknown };
      if (op && typeof op === "object" && op.security === undefined) op.security = security;
    }
  }
}

/** Mounts GET /openapi.json generating the spec from described routes. */
export function mountOpenApiSpec(app: Hono<{ Bindings: Bindings; Variables: Record<string, unknown> }>) {
  /**
   * Registered before the generator, not after.
   *
   * Hono runs a second handler on the same path only if the first calls
   * `next()`, and the generator returns a response outright — so a wrapper
   * registered afterwards would never run at all.
   */
  app.use("/openapi.json", async (c, next) => {
    await next();
    if (!c.res.ok) return;
    const doc = (await c.res.json()) as { paths?: Record<string, Record<string, unknown>> };
    stampSecurity(doc);
    c.res = new Response(JSON.stringify(doc, null, 2), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

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
        /**
         * Absolute, and production first.
         *
         * A relative `/` makes the reference's "try it" panel useless: it
         * resolves against whatever host the docs are served from, which is
         * never the API.
         */
        servers: [
          { url: "https://api.chatform.in", description: "Production" },
          { url: "http://localhost:8787", description: "Local development" },
        ],
        tags: [
          { name: "v1", description: "Developer API — API key auth" },
          { name: "public", description: "Respondent chat surface" },
          { name: "dashboard", description: "Dashboard — session auth" },
          { name: "billing", description: "Plans, usage and checkout" },
          { name: "health", description: "Service health" },
        ],
        components: {
          securitySchemes: {
            secretKey: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "sk_live_…",
              description:
                "A server-side secret key. Never send one from a browser — a request carrying an Origin header is refused for this reason.",
            },
            publishableKey: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "pk_live_…",
              description: "A browser-safe key, restricted to the origins listed on it.",
            },
            apiKeyHeader: {
              type: "apiKey",
              in: "header",
              name: "x-api-key",
              description: "The same keys, in the header most integrators reach for first.",
            },
            respondentToken: {
              type: "apiKey",
              in: "header",
              name: "x-respondent-token",
              description: "Scoped to one chat session, and it expires. This is what a browser should hold.",
            },
            sessionCookie: {
              type: "apiKey",
              in: "cookie",
              name: "better-auth.session_token",
              description: "The dashboard's own session.",
            },
          },
        },
      },
      exclude: ["/docs", "/openapi.json"],
    }),
  );
}
