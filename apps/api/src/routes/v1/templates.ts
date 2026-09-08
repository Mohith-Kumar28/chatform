/**
 * Templates, on the developer API.
 *
 * These existed for eleven days before `/v1` did and were simply missed by the pass
 * that built the developer API — the same shape of gap that pass found and fixed
 * for webhooks, where the SDK promised `webhooks.*` against a session-guarded
 * route. Nothing about templates was ever decided to be dashboard-only.
 *
 * The handlers are thin: every one delegates to `lib/templates-service.ts`, which
 * the dashboard routes now use as well. Two surfaces, one implementation, so the
 * next change lands on both.
 */
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import { ErrorEnvelope } from "../../lib/openapi.js";
import type { GuardVars } from "../../lib/guards.js";
import { requireScope, requireGauge, type AuthzVars } from "../../lib/authorize.js";
import { requireWorkspace, formSlug } from "../../lib/workspace.js";
import { listTemplates, getTemplate, createFormFromTemplate } from "../../lib/templates-service.js";
import { idempotent } from "../../lib/idempotency.js";

export const templatesV1Router = new Hono<{
  Bindings: Bindings;
  Variables: Partial<AuthzVars & GuardVars>;
}>();

const TemplateSummary = z.object({
  slug: z.string(),
  title: z.string(),
  category: z.string(),
  description: z.string(),
  blurb: z.string(),
  tags: z.array(z.string()),
  icon: z.string(),
  accent: z.string(),
  blockCount: z.number(),
  estMinutes: z.number(),
  usageCount: z.number(),
});

templatesV1Router.get(
  "/templates",
  requireScope("form", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "List the official form templates, most used first",
    responses: {
      200: {
        description: "Templates",
        content: { "application/json": { schema: resolver(z.array(TemplateSummary)) } },
      },
    },
  }),
  async (c) => c.json(await listTemplates(c.env)),
);

templatesV1Router.get(
  "/templates/:slug",
  requireScope("form", "read"),
  describeRoute({
    tags: ["v1"],
    summary: "One template, including the document it would create",
    description:
      "Read this before `POST /v1/templates/{slug}/use` if you want to see or adapt the questions rather than take them as they are.",
    responses: {
      200: {
        description: "Template",
        content: { "application/json": { schema: resolver(TemplateSummary.extend({ doc: z.unknown() })) } },
      },
      404: { description: "Not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    const found = await getTemplate(c.env, c.req.param("slug"));
    if (found === null) return c.json({ error: { code: "not_found", message: "Template not found" } }, 404);
    if (found === "stale") {
      return c.json({ error: { code: "invalid_template", message: "This template is out of date" } }, 404);
    }
    return c.json(found);
  },
);

/**
 * Gated exactly as `POST /v1/forms` is, because it inserts the same row.
 *
 * `form:write` plus the `forms_count` gauge. The dashboard route learned this the
 * hard way — it carried neither for a while, so an organization at its form limit
 * could keep going indefinitely as long as it started from a template.
 */
templatesV1Router.post(
  "/templates/:slug/use",
  requireScope("form", "write"),
  requireGauge("forms_count", "forms.create"),
  idempotent("POST /v1/templates/:slug/use"),
  validator("query", z.object({ workspace: z.string().optional() })),
  describeRoute({
    tags: ["v1"],
    summary: "Create a draft form from a template",
    description:
      "Creates a draft, exactly as `POST /v1/forms` does — publish it when you are ready. Omit `workspace` to use the organization's first.",
    responses: {
      200: { description: "The created form" },
      402: { description: "A plan limit refuses another form" },
      404: { description: "Template or workspace not found" },
    },
  }),
  async (c) => {
    const ws = await requireWorkspace(c, c.req.query("workspace"));
    if (ws === undefined) return c.json({ error: { code: "not_found", message: "No such workspace" } }, 404);
    if (!ws) return c.json({ error: { code: "no_organization", message: "This key has no organization" } }, 403);

    const created = await createFormFromTemplate(c.env, {
      slug: c.req.param("slug"),
      orgId: ws.orgId,
      workspaceId: ws.wsId,
      /**
       * A key's creator owns what the key creates.
       *
       * `requireApiKey` sets `userId` from the key's `createdBy` for exactly this:
       * `forms.created_by` is not nullable, and attributing a form to the person who
       * minted the key is the truest answer available.
       */
      userId: c.get("userId")!,
      formSlug,
    });
    if (created === null) return c.json({ error: { code: "not_found", message: "Template not found" } }, 404);
    if (created === "stale") {
      return c.json({ error: { code: "invalid_template", message: "This template is out of date" } }, 404);
    }
    return c.json(created);
  },
);
