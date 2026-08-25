import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import { sha256Hex } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { createAuth } from "../lib/auth.js";
import { SessionDO } from "../do/session-do.js";

/**
 * Preview sessions — authenticated, run against the WORKING schema (drafts).
 * Powers the live chat preview inside the builder.
 */
export const previewRouter = new Hono<{ Bindings: Bindings; Variables: { userId: string } }>();

previewRouter.use("*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
  c.set("userId", session.user.id);
  await next();
});

previewRouter.post(
  "/forms/:id/preview/sessions",
  describeRoute({
    tags: ["dashboard"],
    summary: "Start a preview chat session against the working draft",
    responses: {
      200: { description: "Session", content: { "application/json": { schema: resolver(z.object({ sessionId: z.string(), sseUrl: z.string(), respondentToken: z.string() })) } } },
      404: { description: "Form not found" },
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(
      `SELECT f.id, f.slug, f.working_schema, f.organization_id FROM forms f WHERE f.id = ? AND f.deleted_at IS NULL`,
    )
      .bind(id)
      .first<{ id: string; slug: string; working_schema: string; organization_id: string }>();
    if (!row) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

    const sessionId = `chs_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const respondentToken = crypto.randomUUID().replace(/-/g, "");

    await c.env.DB.prepare(
      `INSERT INTO chat_sessions (id, form_id, organization_id, respondent_token_hash, status, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    )
      .bind(sessionId, row.id, row.organization_id, sha256Hex(respondentToken), Date.now(), Date.now())
      .run();

    const stub = c.env.SESSION_DO.get(c.env.SESSION_DO.idFromName(sessionId)) as unknown as InstanceType<typeof SessionDO>;
    const init = await stub.init({
      sessionId,
      formId: row.id,
      formVersionId: "preview",
      organizationId: row.organization_id,
      slug: row.slug,
      brandingHidden: true,
      docJson: JSON.parse(row.working_schema),
      respondentToken,
      hiddenFields: {},
      ipHash: null,
      country: null,
      userAgent: "preview",
    });
    if (!init.ok) return c.json({ error: { code: init.code, message: "Preview session failed" } }, 400);
    return c.json({ sessionId, sseUrl: `/p/sessions/${sessionId}/events`, respondentToken });
  },
);
