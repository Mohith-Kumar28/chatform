import type { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { scopeOf } from "./authorize.js";
import { PUBLISHABLE_SCOPES } from "./scopes.js";

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

const METHODS = ["get", "post", "put", "patch", "delete"];

/**
 * How each surface authenticates, stamped by path prefix rather than declared
 * per route.
 *
 * Doing it in one place is what keeps the spec from drifting away from the
 * middleware that actually enforces it — a `security` block copied onto forty
 * routes is forty chances to describe a guard that is not there.
 *
 * `/v1` is deliberately absent: which *key* reaches a `/v1` route is decided by
 * the route's scope guard, so it is derived in `v1Security` rather than declared
 * here. It used to be in this table as all three key schemes, which told every
 * reader that a publishable key could `DELETE /v1/forms/{id}` — a claim the
 * scope ceiling has always refused.
 */
const SECURITY_BY_PREFIX: [string, Record<string, string[]>[]][] = [
  ["/api/", [{ sessionCookie: [] }]],
  ["/p/", [{ respondentToken: [] }]],
];

/**
 * Surfaces that are not part of the developer API, and so are not documented as
 * one.
 *
 * `/api/*` is the dashboard's own, behind a Better Auth session cookie: an API
 * key does not satisfy `requireSession`, so every one of these answers a key
 * with "Sign in required". Publishing them in the reference meant 47 of the 98
 * documented operations were endpoints no integrator could ever call.
 *
 * `/p/*` is the hosted chat client's private channel, authenticated by a
 * short-lived respondent token that the widget mints for one session. Everything
 * it can do has a `/v1` equivalent — `headless.mdx` sends someone building their
 * own frontend to `/v1/sessions` — so documenting it alongside `/v1` offered a
 * second, token-shaped way to do the same job and no reason to prefer either.
 *
 * `/d/*` deliberately stays public: it is the signed download URL a developer
 * *receives* from `GET /v1/files/{id}`, so they need to know what it is.
 */
const INTERNAL_PREFIXES = ["/api/", "/p/"];

type HonoRoute = { method: string; path: string; handler: unknown };

/**
 * Every scope guard Hono actually has registered, keyed for lookup by operation.
 *
 * Read off the live route table rather than restated here, so a route that gains
 * or changes a guard changes the spec on the next `pnpm gen:openapi` with no
 * second edit. `uploads.ts` declares its guard with `.use()` on a wildcard, so
 * prefix patterns are collected alongside exact routes.
 */
function scopeIndex(app: Hono<never>) {
  const exact = new Map<string, string>();
  const prefixes: { prefix: string; scope: string }[] = [];
  for (const route of (app as unknown as { routes: HonoRoute[] }).routes ?? []) {
    const scope = scopeOf(route.handler);
    if (!scope) continue;
    if (route.path.includes("*")) {
      prefixes.push({ prefix: route.path.slice(0, route.path.indexOf("*")), scope });
    } else {
      exact.set(`${route.method.toUpperCase()} ${route.path}`, scope);
    }
  }
  return { exact, prefixes };
}

/** `/v1/forms/{id}` → `/v1/forms/:id`, the form the route table stores. */
function toHonoPath(specPath: string): string {
  return specPath.replace(/\{([^}]+)\}/g, ":$1");
}

function requiredScope(index: ReturnType<typeof scopeIndex>, method: string, specPath: string): string | null {
  const honoPath = toHonoPath(specPath);
  const direct = index.exact.get(`${method.toUpperCase()} ${honoPath}`) ?? index.exact.get(`ALL ${honoPath}`);
  if (direct) return direct;
  return index.prefixes.find(({ prefix }) => honoPath.startsWith(prefix))?.scope ?? null;
}

/**
 * Which key schemes a `/v1` operation really accepts.
 *
 * A publishable key is clamped to `PUBLISHABLE_SCOPES` at creation and can never
 * be widened, so an operation guarded by anything outside that ceiling is
 * secret-key-only in fact — and saying so is the whole point of documenting the
 * ceiling. `apiKeyHeader` stays on everything because `x-api-key` carries either
 * kind of key.
 */
function v1Security(scope: string | null): Record<string, string[]>[] {
  const [resource, action] = scope?.split(":") ?? [];
  const publishable =
    scope === null || (resource !== undefined && (PUBLISHABLE_SCOPES[resource] ?? []).includes(action ?? ""));
  return publishable
    ? [{ secretKey: [] }, { publishableKey: [] }, { apiKeyHeader: [] }]
    : [{ secretKey: [] }, { apiKeyHeader: [] }];
}

function stampSecurity(doc: { paths?: Record<string, Record<string, unknown>> }, app: Hono<never>) {
  const index = scopeIndex(app);
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    const byPrefix = SECURITY_BY_PREFIX.find(([prefix]) => path.startsWith(prefix))?.[1];
    const internal = INTERNAL_PREFIXES.some((prefix) => path.startsWith(prefix));
    for (const [method, operation] of Object.entries(item)) {
      if (!METHODS.includes(method)) continue;
      const op = operation as { security?: unknown; "x-internal"?: boolean; "x-required-scope"?: string };
      if (!op || typeof op !== "object") continue;
      /**
       * Marked rather than deleted here.
       *
       * `openapi.json` is also what orval reads to generate the web app's own
       * dashboard client, so the internal operations have to survive generation;
       * `publicSpec` is what drops them from anything a developer sees.
       */
      if (internal) op["x-internal"] = true;
      if (path.startsWith("/v1/")) {
        const scope = requiredScope(index, method, path);
        if (scope) op["x-required-scope"] = scope;
        if (op.security === undefined) op.security = v1Security(scope);
        continue;
      }
      if (byPrefix && op.security === undefined) op.security = byPrefix;
    }
  }
}

/**
 * The spec with the dashboard's own surface removed.
 *
 * Used for `GET /openapi.json`, which is the URL cited in `llms.txt` and the
 * SDK docs — so what a developer or their assistant reads describes only what a
 * key can actually reach. `?include=internal` returns everything, which is how
 * `pnpm gen:openapi` still writes a complete file for orval.
 */
export function publicSpec<T extends { paths?: Record<string, Record<string, unknown>>; tags?: { name: string }[] }>(
  doc: T,
): T {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    const kept = Object.fromEntries(
      Object.entries(item).filter(([method, op]) => {
        if (!METHODS.includes(method)) return true;
        return !(op as { "x-internal"?: boolean })?.["x-internal"];
      }),
    );
    if (Object.keys(kept).some((method) => METHODS.includes(method))) paths[path] = kept;
  }
  const usedTags = new Set(
    Object.values(paths).flatMap((item) =>
      Object.entries(item)
        .filter(([method]) => METHODS.includes(method))
        .flatMap(([, op]) => ((op as { tags?: string[] }).tags ?? []) as string[]),
    ),
  );
  return { ...doc, paths, tags: (doc.tags ?? []).filter((t) => usedTags.has(t.name)) };
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
    const doc = (await c.res.json()) as {
      paths?: Record<string, Record<string, unknown>>;
      tags?: { name: string }[];
    };
    stampSecurity(doc, app as unknown as Hono<never>);
    /**
     * Public by default. The dashboard's surface is session-authenticated and
     * unreachable with a key, so publishing it here only ever sent integrators
     * to endpoints that answer "Sign in required" — this URL is the one their
     * assistants read.
     */
    const body = c.req.query("include") === "internal" ? doc : publicSpec(doc);
    c.res = new Response(JSON.stringify(body, null, 2), {
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
