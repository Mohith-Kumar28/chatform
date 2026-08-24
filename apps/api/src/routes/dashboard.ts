import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { createAuth } from "../lib/auth.js";

export const dashboardRouter = new Hono<{ Bindings: Bindings }>();

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
