import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import type { PlatformAdminVars } from "../../lib/platform-admin.js";
import { FORM_ROLLUP_COMPLETED_KEY } from "../../lib/platform-rollup.js";
import {
  DAY_MS,
  OpsRows,
  PLAN_OF_ORG,
  RANGES,
  RangeQuery,
  dayKeys,
  latestOf,
  loadMetrics,
  rows,
  sumByDimension,
  type RangeKey,
} from "./shared.js";

/**
 * What people are building — the product-decision page.
 *
 * Everything here comes from the nightly structure rollup rather than from live
 * document parsing, because "which block types are popular" means opening every
 * form's JSON and there is no version of that which is fast.
 *
 * The boundary this page holds: it reads form *structure* and never form
 * *content*. Block types, sizes, logic depth, question wording, template usage.
 * No answers, no respondents, no submission bodies. What customers build is a
 * product signal we are entitled to; what their customers typed is not.
 */

export const productRouter = new Hono<{ Bindings: Bindings; Variables: Partial<PlatformAdminVars> }>();

const Counted = z.array(z.object({ key: z.string(), value: z.number() }));

const ProductResponse = z.object({
  blockTypes: Counted,
  formSizes: Counted,
  formLogic: Counted,
  creationSource: Counted,
  responseSource: Counted,
  templates: OpsRows,
  adoption: z.array(z.object({ feature: z.string(), orgs: z.number(), share: z.number() })),
  topQuestions: OpsRows,
  totals: z.object({ orgs: z.number(), forms: z.number(), published: z.number(), avgBlocks: z.number() }),
  statsAsOf: z.number().nullable(),
});

/**
 * Which capabilities customers have actually switched on.
 *
 * Counted as *distinct organizations*, not rows: one account with forty webhooks
 * is one account that uses webhooks, and counting rows would let a single power
 * user make a feature look universally adopted. Each is a single indexed
 * `COUNT(DISTINCT organization_id)`, so the whole panel is one round of small
 * queries rather than a scan.
 *
 * `json_extract` over `forms.settings_json` is how the settings-level features
 * are found: they live inside the document, not in a column.
 */
const ADOPTION: [feature: string, sql: string][] = [
  ["Webhooks", `SELECT COUNT(DISTINCT organization_id) AS n FROM webhooks WHERE active = 1`],
  ["Spreadsheet feed", `SELECT COUNT(DISTINCT organization_id) AS n FROM integrations WHERE status = 'connected'`],
  ["API keys", `SELECT COUNT(DISTINCT organization_id) AS n FROM api_keys WHERE enabled = 1`],
  ["File uploads", `SELECT COUNT(DISTINCT organization_id) AS n FROM files WHERE status = 'confirmed'`],
  ["Follow-ups", `SELECT COUNT(DISTINCT organization_id) AS n FROM followups`],
  ["Extra workspaces", `SELECT COUNT(*) AS n FROM (SELECT organization_id FROM workspaces GROUP BY organization_id HAVING COUNT(*) > 1)`],
  ["More than one seat", `SELECT COUNT(*) AS n FROM (SELECT organization_id FROM members GROUP BY organization_id HAVING COUNT(*) > 1)`],
  [
    "Respondent sign-in",
    `SELECT COUNT(DISTINCT organization_id) AS n FROM forms
      WHERE deleted_at IS NULL AND json_extract(settings_json, '$.requireAuth.enabled') = 1`,
  ],
  [
    "Agent knowledge",
    `SELECT COUNT(DISTINCT organization_id) AS n FROM forms
      WHERE deleted_at IS NULL AND json_array_length(json_extract(settings_json, '$.agent.knowledge')) > 0`,
  ],
  [
    "Custom branding",
    `SELECT COUNT(DISTINCT organization_id) AS n FROM forms
      WHERE deleted_at IS NULL AND json_extract(settings_json, '$.branding.hidePoweredBy') = 1`,
  ],
];

productRouter.get(
  "/admin/product",
  validator("query", RangeQuery),
  describeRoute({
    tags: ["admin"],
    summary: "What people build: block types, form shapes, templates, feature adoption",
    responses: {
      200: { description: "Product usage", content: { "application/json": { schema: resolver(ProductResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const range = c.req.valid("query").range as RangeKey;
    const days = RANGES[range];
    const window = dayKeys(days);
    const windowSet = new Set(window);
    const since = Date.now() - days * DAY_MS;

    const metrics = await loadMetrics(c.env, window[0]!, window[window.length - 1]!);

    const [orgCount, formCount, publishedCount, templates, topQuestions, statsAsOf] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM organizations`).first<{ n: number }>(),
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM forms WHERE deleted_at IS NULL`).first<{ n: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM forms f
          WHERE f.deleted_at IS NULL
            AND (f.active_version_id IS NOT NULL
                 OR EXISTS (SELECT 1 FROM form_versions v WHERE v.form_id = f.id AND v.published_at IS NOT NULL))`,
      ).first<{ n: number }>(),
      /**
       * The template leaderboard, with the number that matters next to it.
       *
       * `usage_count` alone says which template people *pick*, which is a
       * function of where it sits in the gallery. The second column says which
       * template produced a form that went on to collect something — a template
       * chosen a hundred times that never collects is a template whose promise
       * the questions do not keep.
       */
      rows(
        c.env.DB.prepare(
          `SELECT t.slug, t.title, t.category, t.usage_count, t.block_count, t.official,
                  (SELECT COUNT(DISTINCT f.id) FROM forms f
                    JOIN form_activity a ON a.form_id = f.id AND a.kind = 'created' AND a.source = 'template'
                   WHERE f.deleted_at IS NULL
                     AND EXISTS (SELECT 1 FROM submissions s WHERE s.form_id = f.id AND s.is_test = 0 AND s.status = 'completed')
                  ) AS collecting
             FROM form_templates t
            ORDER BY t.usage_count DESC, t.title ASC
            LIMIT 25`,
        ),
      ),
      rows(
        c.env.DB.prepare(
          `SELECT norm_text, sample_text, block_type, form_count, org_count
             FROM platform_question_stats
            ORDER BY org_count DESC, form_count DESC
            LIMIT 60`,
        ),
      ),
      c.env.KV_CONFIG.get(FORM_ROLLUP_COMPLETED_KEY),
    ]);

    // Adoption is a fan of tiny counts; run them together rather than in series.
    const adoptionCounts = await Promise.all(
      ADOPTION.map(([, sql]) => c.env.DB.prepare(sql).first<{ n: number }>()),
    );
    const orgs = orgCount?.n ?? 0;
    const adoption = ADOPTION.map(([feature], i) => {
      const n = adoptionCounts[i]?.n ?? 0;
      return { feature, orgs: n, share: orgs > 0 ? Math.round((n / orgs) * 1000) / 10 : 0 };
    }).sort((a, b) => b.orgs - a.orgs);

    /**
     * Block types and form shapes are snapshots, not sums.
     *
     * The structure rollup rewrites the whole day's rows on each pass, so the
     * latest day is the current state of the catalogue. Summing thirty days of
     * it would report each form once per day it existed.
     */
    const blockTypes = latestOf(metrics, "block_types")
      .map((r) => ({ key: r.dimension, value: r.value }))
      .sort((a, b) => b.value - a.value);
    const totalBlocks = blockTypes.reduce((n, b) => n + b.value, 0);

    const SIZE_ORDER = ["1-3", "4-7", "8-15", "16-30", "31+"];
    const LOGIC_ORDER = ["none", "1-3", "4-10", "11+"];
    const ordered = (metric: string, order: string[]) => {
      const by = new Map(latestOf(metrics, metric).map((r) => [r.dimension, r.value]));
      return order.map((key) => ({ key, value: by.get(key) ?? 0 }));
    };

    return c.json({
      blockTypes,
      formSizes: ordered("form_sizes", SIZE_ORDER),
      formLogic: ordered("form_logic", LOGIC_ORDER),
      // These two *are* sums: they count events in the window, not state.
      creationSource: sumByDimension(metrics, "forms_created_by_source", windowSet),
      responseSource: sumByDimension(metrics, "responses_by_source", windowSet),
      templates,
      adoption,
      topQuestions,
      totals: {
        orgs,
        forms: formCount?.n ?? 0,
        published: publishedCount?.n ?? 0,
        avgBlocks: formCount?.n ? Math.round((totalBlocks / formCount.n) * 10) / 10 : 0,
      },
      statsAsOf: statsAsOf ? Number(statsAsOf) : null,
    });
  },
);

/**
 * Every form on the platform, for the times a number needs a name attached.
 *
 * Title, size, status and how it is performing — never the document, never a
 * response. `sort=drop_off` is the one worth having: forms with plenty of starts
 * and few completions are where the product itself is failing, and they are
 * where a conversational form builder learns what its interviewer gets wrong.
 */
const FORM_SORTS = {
  recent: "f.updated_at DESC",
  responses: "completed DESC",
  starts: "started DESC",
  drop_off: "drop_off DESC",
  size: "blocks DESC",
} as const;

productRouter.get(
  "/admin/forms",
  validator(
    "query",
    z.object({
      q: z.string().max(120).optional(),
      status: z.enum(["draft", "published", "closed"]).optional(),
      sort: z.enum(["recent", "responses", "starts", "drop_off", "size"]).default("recent"),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  ),
  describeRoute({
    tags: ["admin"],
    summary: "Every form, by title and performance — never its content",
    responses: {
      200: {
        description: "Forms",
        content: {
          "application/json": {
            schema: resolver(z.object({ forms: OpsRows, total: z.number(), limit: z.number(), offset: z.number() })),
          },
        },
      },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const { q, status, sort, limit, offset } = c.req.valid("query");
    const filters = ["f.deleted_at IS NULL"];
    if (q) filters.push(`(f.title LIKE ?1 OR f.slug LIKE ?1 OR o.name LIKE ?1)`);
    if (status) filters.push(`f.status = ?2`);

    const list = await rows(
      c.env.DB.prepare(
        `SELECT f.id, f.title, f.slug, f.status, f.created_at, f.updated_at,
                f.organization_id AS org_id, o.name AS org_name,
                COALESCE((${PLAN_OF_ORG}), 'free') AS plan,
                json_array_length(json_extract(
                  COALESCE((SELECT v.schema_json FROM form_versions v WHERE v.id = f.active_version_id), f.working_schema),
                  '$.blocks')) AS blocks,
                (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id AND s.is_test = 0) AS started,
                (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id AND s.is_test = 0 AND s.status = 'completed') AS completed,
                /* Only meaningful once a form has real traffic: two starts and one
                   finish is not a 50% drop-off, it is noise. */
                CASE WHEN (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id AND s.is_test = 0) >= 10
                     THEN 100.0 - (100.0 * (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id AND s.is_test = 0 AND s.status = 'completed')
                                   / (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id AND s.is_test = 0))
                     ELSE NULL END AS drop_off
           FROM forms f
           JOIN organizations o ON o.id = f.organization_id
          WHERE ${filters.join(" AND ")}
          ORDER BY ${FORM_SORTS[sort]}
          LIMIT ?3 OFFSET ?4`,
      ).bind(q ? `%${q}%` : null, status ?? null, limit, offset),
    );

    const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM forms WHERE deleted_at IS NULL`).first<{ n: number }>();
    return c.json({ forms: list, total: total?.n ?? 0, limit, offset });
  },
);
