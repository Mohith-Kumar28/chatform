import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import type { Bindings } from "../env.js";
import { HealthResponse } from "../lib/openapi.js";

export const healthRouter = new Hono<{ Bindings: Bindings }>();

healthRouter.get(
  "/",
  describeRoute({
    tags: ["health"],
    summary: "Service health",
    responses: {
      200: {
        description: "Healthy",
        content: { "application/json": { schema: resolver(HealthResponse) } },
      },
    },
  }),
  async (c) => {
  let db = "down";
  try {
    await c.env.DB.prepare("SELECT 1").first();
    db = "up";
  } catch {
    db = "down";
  }
  return c.json({
    ok: true,
    env: c.env.ENVIRONMENT,
    db,
    ts: Date.now(),
  });
});
