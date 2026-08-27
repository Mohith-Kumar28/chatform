import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { createAuth, googleAuthConfigured } from "../lib/auth.js";

export const dashboardRouter = new Hono<{ Bindings: Bindings }>();

/**
 * Which sign-in methods this deployment actually has configured.
 *
 * Public and unauthenticated on purpose — the sign-in page is what calls it, before anyone
 * has a session. It reports only booleans: the client id is not in the response, because
 * nothing in a redirect-based OAuth flow needs it in the browser.
 *
 * Named `/auth-providers` rather than `/auth/providers` so it does not collide with the
 * `/auth/*` catch-all below, which hands everything under it to Better Auth.
 */
dashboardRouter.get(
  "/auth-providers",
  describeRoute({
    tags: ["dashboard"],
    summary: "Configured sign-in providers",
    responses: {
      200: {
        description: "Providers",
        content: {
          "application/json": {
            schema: resolver(z.object({ emailPassword: z.boolean(), google: z.boolean() })),
          },
        },
      },
    },
  }),
  (c) => c.json({ emailPassword: true, google: googleAuthConfigured(c.env) }),
);

dashboardRouter.on(["POST", "GET"], "/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

dashboardRouter.get(
  "/auth/ok",
  describeRoute({
    tags: ["dashboard"],
    summary: "Auth liveness check",
    responses: { 200: { description: "ok", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } } },
  }),
  (c) => c.json({ ok: true }),
);

/**
 * Session-guard middleware: resolves the Better Auth session and stashes it.
 * Usage: dashboardRouter.use("/forms/*", requireSession)
 */
export async function requireSession(c: { env: Bindings; req: Request; set: (k: string, v: unknown) => void }, next: () => Promise<void>) {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.headers });
  if (!session) {
    return Response.json({ error: { code: "unauthorized", message: "Sign in required" } }, { status: 401 });
  }
  c.set("session", session.session);
  c.set("user", session.user);
  await next();
}
