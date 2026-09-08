/**
 * The template catalogue, and creating a form from one.
 *
 * Extracted from `routes/templates.ts` so the dashboard and `/v1` share it rather
 * than each holding its own copy of the query and the projection. The reason that
 * matters here specifically: templates existed for eleven days before `/v1` did,
 * were missed by the pass that built the developer API, and the only thing that
 * would have caught it is the two surfaces being visibly the same code.
 */
import { FormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";

export interface TemplateRow {
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

export const TEMPLATE_COLUMNS =
  `slug, title, category, description, blurb, tags, icon, accent, block_count, est_minutes, usage_count`;

/** `tags` is a JSON array in a text column; a malformed one is no tags, not a 500. */
export function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

export function toTemplateSummary(r: Omit<TemplateRow, "schema_json">) {
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

/** The official catalogue, most-used first — which is what makes "Popular" real. */
export async function listTemplates(env: Bindings) {
  const rows = await env.DB.prepare(
    `SELECT ${TEMPLATE_COLUMNS} FROM form_templates WHERE official = 1 ORDER BY usage_count DESC, category, title`,
  ).all<Omit<TemplateRow, "schema_json">>();
  return (rows.results ?? []).map(toTemplateSummary);
}

export type TemplateDetail = ReturnType<typeof toTemplateSummary> & { doc: unknown };

/**
 * One template with its document.
 *
 * `null` for "no such template", `"stale"` for one whose stored document no longer
 * satisfies the schema — parsed here rather than passed through, so an out-of-date
 * template fails where it can be reported instead of inside a builder that has
 * already opened it.
 */
export async function getTemplate(env: Bindings, slug: string): Promise<TemplateDetail | null | "stale"> {
  const row = await env.DB.prepare(
    `SELECT ${TEMPLATE_COLUMNS}, schema_json FROM form_templates WHERE slug = ? AND official = 1`,
  )
    .bind(slug)
    .first<TemplateRow>();
  if (!row) return null;
  const parsed = FormDoc.safeParse(JSON.parse(row.schema_json));
  if (!parsed.success) return "stale";
  return { ...toTemplateSummary(row), doc: parsed.data };
}

export interface CreatedFromTemplate {
  id: string;
  slug: string;
  title: string;
}

/**
 * Create a form from a template.
 *
 * The usage count is batched with the insert, so it cannot advance for a form that
 * was never created — the count is what "Popular" is computed from.
 */
export async function createFormFromTemplate(
  env: Bindings,
  opts: { slug: string; orgId: string; workspaceId: string; userId: string; formSlug: (title: string) => string },
): Promise<CreatedFromTemplate | null | "stale"> {
  const row = await env.DB.prepare(`SELECT title, schema_json FROM form_templates WHERE slug = ? AND official = 1`)
    .bind(opts.slug)
    .first<{ title: string; schema_json: string }>();
  if (!row) return null;

  const parsed = FormDoc.safeParse(JSON.parse(row.schema_json));
  if (!parsed.success) return "stale";

  const id = `frm_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const outSlug = opts.formSlug(row.title);
  const now = Date.now();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO forms (id, organization_id, workspace_id, created_by, title, slug, status, working_schema, fingerprint_salt, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
    ).bind(
      id,
      opts.orgId,
      opts.workspaceId,
      opts.userId,
      row.title,
      outSlug,
      JSON.stringify(parsed.data),
      crypto.randomUUID().slice(0, 16),
      now,
      now,
    ),
    env.DB.prepare(`UPDATE form_templates SET usage_count = usage_count + 1 WHERE slug = ?`).bind(opts.slug),
  ]);

  return { id, slug: outSlug, title: row.title };
}
