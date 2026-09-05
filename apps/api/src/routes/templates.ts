import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import { FormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { ErrorEnvelope } from "../lib/openapi.js";
import { requireSession, requireOrg, type GuardVars } from "../lib/guards.js";
import { requirePermission, requireGauge, type AuthzVars } from "../lib/authorize.js";
import { requireWorkspace, formSlug } from "../lib/workspace.js";

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

interface TemplateRow {
  slug: string;
  title: string;
  category: string;
  description: string | null;
  blurb: string | null;
  tags: string | null;
  icon: string | null;
  accent: string | null;
  block_count: number | null;
  est_minutes: number | null;
  usage_count: number;
  schema_json: string;
}

const COLUMNS = `slug, title, category, description, blurb, tags, icon, accent, block_count, est_minutes, usage_count`;

/** `tags` is a JSON array in a text column; a malformed one is no tags, not a 500. */
function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

function toSummary(r: Omit<TemplateRow, "schema_json">) {
  return {
    slug: r.slug,
    title: r.title,
    category: r.category,
    description: r.description ?? "",
    blurb: r.blurb ?? r.description ?? "",
    tags: parseTags(r.tags),
    icon: r.icon ?? "",
    accent: r.accent ?? "",
    blockCount: r.block_count ?? 0,
    estMinutes: r.est_minutes ?? 1,
    usageCount: r.usage_count,
  };
}

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
  async (c) => {
    const rows = await c.env.DB.prepare(
      `SELECT ${COLUMNS} FROM form_templates WHERE official = 1 ORDER BY usage_count DESC, category, title`,
    ).all<Omit<TemplateRow, "schema_json">>();
    return c.json((rows.results ?? []).map(toSummary));
  },
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
    const row = await c.env.DB.prepare(
      `SELECT ${COLUMNS}, schema_json FROM form_templates WHERE slug = ? AND official = 1`,
    )
      .bind(c.req.param("slug"))
      .first<TemplateRow>();
    if (!row) return c.json({ error: { code: "not_found", message: "Template not found" } }, 404);

    // Parsed rather than passed through: the column is text, and a document
    // that no longer satisfies the schema should fail here, where it can be
    // reported, rather than in a builder that has already opened it.
    const parsed = FormDoc.safeParse(JSON.parse(row.schema_json));
    if (!parsed.success) {
      return c.json({ error: { code: "invalid_template", message: "This template is out of date" } }, 404);
    }
    return c.json({ ...toSummary(row), doc: parsed.data });
  },
);

templatesRouter.post(
  "/templates/:slug/use",
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
    const slug = c.req.param("slug");
    const row = await c.env.DB.prepare(
      `SELECT title, schema_json FROM form_templates WHERE slug = ? AND official = 1`,
    )
      .bind(slug)
      .first<{ title: string; schema_json: string }>();
    if (!row) return c.json({ error: { code: "not_found", message: "Template not found" } }, 404);

    const parsed = FormDoc.safeParse(JSON.parse(row.schema_json));
    if (!parsed.success) {
      return c.json({ error: { code: "invalid_template", message: "This template is out of date" } }, 404);
    }

    const ws = await requireWorkspace(c);
    if (!ws) return c.json({ error: { code: "no_organization", message: "Create an organization first" } }, 403);

    const userId = c.get("userId")!;
    const id = `frm_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const outSlug = formSlug(row.title);
    const now = Date.now();

    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
      ).bind(
        id,
        ws.orgId,
        ws.wsId,
        userId,
        row.title,
        outSlug,
        JSON.stringify(parsed.data),
        crypto.randomUUID().slice(0, 16),
        now,
        now,
      ),
      // What makes "Popular" mean anything. Batched with the insert so the
      // count cannot advance for a form that was never created.
      c.env.DB.prepare(`UPDATE form_templates SET usage_count = usage_count + 1 WHERE slug = ?`).bind(slug),
    ]);

    return c.json({ id, slug: outSlug, title: row.title });
  },
);
