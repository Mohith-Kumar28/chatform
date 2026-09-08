import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { FormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { ErrorEnvelope } from "../lib/openapi.js";
import { requireSession, requireOrg, type GuardVars } from "../lib/guards.js";
import { requirePermission, requireGauge, type AuthzVars } from "../lib/authorize.js";
import { requireWorkspace, formSlug } from "../lib/workspace.js";
import { listTemplates, getTemplate, createFormFromTemplate } from "../lib/templates-service.js";

export const templatesRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

// This router had NO middleware at all, so GET /api/templates was fully public.
templatesRouter.use("*", requireSession);
templatesRouter.use("*", requireOrg);

/**
 * Using a template creates a form, so it is gated exactly as creating one is.
 *
 * It wasn't. `POST /forms` has carried `form:create` and the `forms_count`
 * gauge from the start, and this route — which inserts the same row into the
 * same table — carried neither. A viewer could create forms through it, and a
 * workspace at its plan's form limit could keep going indefinitely as long as
 * it started from a template.
 */
templatesRouter.post(
  "/templates/:slug/use",
  requirePermission("form", "create"),
  requireGauge("forms_count", "forms.create"),
);

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

const TemplateDetail = TemplateSummary.extend({ doc: z.unknown() });


/**
 * The official catalogue, most-used first.
 *
 * Rows come from `form_templates`, seeded by `pnpm seed:templates` from the
 * catalogue in `tooling/templates/`. This used to be a `SEEDS` array declared
 * in this file: four templates, only changeable by deploying, and a table that
 * had been declared in the very first migration and never read.
 *
 * Ordering on `usage_count` is what makes the gallery's "Popular" filter real
 * rather than a boolean somebody set by hand.
 */
templatesRouter.get(
  "/templates",
  describeRoute({
    tags: ["dashboard"],
    summary: "List official templates",
    responses: {
      200: { description: "Templates", content: { "application/json": { schema: resolver(z.array(TemplateSummary)) } } },
    },
  }),
  async (c) => c.json(await listTemplates(c.env)),
);

/**
 * One template, with its document — what the gallery's preview panel reads.
 *
 * Without this there is no way to see what a template asks without creating a
 * form from it, which is a strange thing to have to undo.
 */
templatesRouter.get(
  "/templates/:slug",
  describeRoute({
    tags: ["dashboard"],
    summary: "Get one template, including its document",
    responses: {
      200: { description: "Template", content: { "application/json": { schema: resolver(TemplateDetail) } } },
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

templatesRouter.post(
  "/templates/:slug/use",
  validator("query", z.object({ ws: z.string().optional() })),
  describeRoute({
    tags: ["dashboard"],
    summary: "Create a form from a template",
    responses: {
      200: { description: "Form id" },
      403: { description: "Limit reached", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
      404: { description: "Not found", content: { "application/json": { schema: resolver(ErrorEnvelope) } } },
    },
  }),
  async (c) => {
    // Same rule as `POST /forms`: the workspace being viewed, or the
    // organization's first when the caller names none.
    const ws = await requireWorkspace(c, c.req.query("ws"));
    if (ws === undefined) return c.json({ error: { code: "not_found", message: "No such workspace" } }, 404);
    if (!ws) return c.json({ error: { code: "no_organization", message: "Create an organization first" } }, 403);

    const created = await createFormFromTemplate(c.env, {
      slug: c.req.param("slug"),
      orgId: ws.orgId,
      workspaceId: ws.wsId,
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
