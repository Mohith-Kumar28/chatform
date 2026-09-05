import { Hono, type Context } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { displayAnswer, type Block } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, requireFormAccess, type GuardVars } from "../lib/guards.js";
import { requirePermission, assertPermission, assertFeature, hasFeature, entitlementsFor, type AuthzVars } from "../lib/authorize.js";
import { buildResponseTable, toCsv } from "../lib/response-table.js";
import { buildXlsx } from "../lib/xlsx.js";

export const resultsRouter = new Hono<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>();

resultsRouter.use("*", requireSession);
resultsRouter.use("*", requireOrg);
// Results are per-form and therefore per-tenant: another org's form id 404s.
resultsRouter.use("/forms/:id/*", requireFormAccess);

/**
 * Reading completed responses and basic analytics is a role question, not a plan one —
 * every plan sees what it collected. The plan gates live inside the handlers, because they
 * depend on *which* slice is being asked for: completed rows are free, the unfinished ones
 * are not.
 */
resultsRouter.use("/forms/:id/submissions", requirePermission("submission", "read"));
resultsRouter.use("/forms/:id/analytics", requirePermission("analytics", "read"));

const SubmissionRow = z.object({
  id: z.string(),
  status: z.string(),
  startedAt: z.number(),
  completedAt: z.number().nullable(),
  durationMs: z.number().nullable(),
  answers: z.array(
    z.object({
      blockRef: z.string(),
      blockType: z.string(),
      value: z.unknown(),
    }),
  ),
  transcript: z.array(
    z.object({
      role: z.string(),
      content: z.string(),
      createdAt: z.number(),
    }),
  ),
});

const Summary = z.object({
  views: z.number(),
  starts: z.number(),
  completed: z.number(),
  abandoned: z.number(),
  completionRate: z.number(),
  avgDurationMs: z.number().nullable(),
  perBlock: z.array(
    z.object({
      blockRef: z.string(),
      blockType: z.string(),
      title: z.string(),
      answered: z.number(),
      answerRate: z.number(),
    }),
  ),
  /** Field names withheld because the plan or the role does not include them. */
  locked: z.array(z.string()),
  /** What it would take to see them, and enough truth to make that worth doing. */
  lockedContext: z
    .object({
      feature: z.string(),
      requiredPlan: z.string(),
      questionCount: z.number(),
      worstBlockTitle: z.string().nullable(),
      worstBlockIndex: z.number().nullable(),
    })
    .nullable(),
});

// ─── views tracking (public, fire-and-forget) ───
export const viewsRouter = new Hono<{ Bindings: Bindings }>();

viewsRouter.post("/forms/:slug/view", async (c) => {
  const slug = c.req.param("slug");
  const form = await c.env.DB.prepare(`SELECT id FROM forms WHERE slug = ? AND deleted_at IS NULL`).bind(slug).first<{ id: string }>();
  if (!form) return c.json({ ok: false }, 404);
  const date = new Date().toISOString().slice(0, 10);
  await c.env.DB.prepare(
    `INSERT INTO analytics_rollup_daily (id, date, form_id, views) VALUES (?, ?, ?, 1)
     ON CONFLICT (date, form_id) DO UPDATE SET views = views + 1`,
  )
    .bind(`av_${date}_${form.id}`, date, form.id)
    .run();
  return c.json({ ok: true });
});

/** List submissions for a form with answers + chat transcripts. */
resultsRouter.get(
  "/forms/:id/submissions",
  describeRoute({
    tags: ["dashboard"],
    summary: "List submissions (with answers + transcripts)",
    responses: { 200: { description: "Submissions", content: { "application/json": { schema: resolver(z.array(SubmissionRow)) } } } },
  }),
  validator(
    "query",
    z.object({
      status: z.enum(["all", "completed", "abandoned", "in_progress"]).default("all"),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  ),
  async (c) => {
    const id = c.get("form")!.id;
    const { status, limit } = c.req.valid("query");

    /**
     * The gate that pays for everything.
     *
     * Free sees completed responses. The unfinished ones — the people who started, told
     * you something, and left — are Pro. The rows themselves never leave the server
     * unentitled: a blurred table in the client is a presentation choice, not a boundary.
     *
     * The count that makes the upsell persuasive is NOT withheld. It rides on
     * `GET /forms/:id/analytics` as `abandoned`, which is basic analytics and free on
     * every plan — so the UI can say "14 people started and didn't finish" truthfully
     * while having none of what they said.
     *
     * `all` is the default the dashboard sends, so it degrades to completed-only rather
     * than refusing; the results page must still render. Asking for the partials
     * explicitly gets a 402 carrying the count.
     */
    let effectiveStatus: typeof status = status;
    if (status === "abandoned" || status === "in_progress" || status === "all") {
      const roleDenied = await assertPermission(c, "submission", "read_partial");
      // A viewer is not trusted with unfinished responses whatever the plan, but `all`
      // still degrades rather than erroring, for the same reason.
      if (roleDenied && status !== "all") return roleDenied;
      const entitled = await hasFeature(c, "partial_responses");
      if (roleDenied || !entitled) {
        if (status === "all") {
          effectiveStatus = "completed";
        } else {
          const partials = await c.env.DB.prepare(
            `SELECT COUNT(*) AS n FROM submissions WHERE form_id = ? AND status IN ('abandoned','in_progress')`,
          )
            .bind(id)
            .first<{ n: number }>();
          const denied = await assertFeature(c, "partial_responses", {
            count: partials?.n ?? 0,
            surface: "results.partial",
          });
          if (denied) return denied;
        }
      }
    }
    // Bound, never interpolated. All placeholders are positional: SQLite
    // continues auto-numbering `?` from the highest explicit index, so mixing
    // `?` with `?1` silently changes how many bindings the statement wants.
    const subs = await c.env.DB.prepare(
      `SELECT s.id, s.status, s.started_at, s.completed_at, s.duration_ms, s.session_id,
              s.respondent_provider, s.respondent_email, s.respondent_phone, s.respondent_name
       FROM submissions s WHERE s.form_id = ? AND (? = 'all' OR s.status = ?)
       ORDER BY s.started_at DESC LIMIT ?`,
    )
      .bind(id, effectiveStatus, effectiveStatus, limit)
      .all<{
        id: string;
        status: string;
        started_at: number;
        completed_at: number | null;
        duration_ms: number | null;
        session_id: string | null;
        respondent_provider: string | null;
        respondent_email: string | null;
        respondent_phone: string | null;
        respondent_name: string | null;
      }>();

    const out = [];
    for (const s of subs.results ?? []) {
      const answers = await c.env.DB.prepare(
        `SELECT block_ref, block_type, value_json FROM submission_answers WHERE submission_id = ?`,
      )
        .bind(s.id)
        .all<{ block_ref: string; block_type: string; value_json: string }>();
      const transcript = s.session_id
        ? await c.env.DB.prepare(
            `SELECT role, content, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at`,
          )
            .bind(s.session_id)
            .all<{ role: string; content: string; created_at: number }>()
        : { results: [] };
      out.push({
        id: s.id,
        status: s.status,
        startedAt: s.started_at,
        completedAt: s.completed_at,
        durationMs: s.duration_ms,
        // Present only for forms that required sign-in.
        respondent: s.respondent_provider
          ? {
              provider: s.respondent_provider,
              label: s.respondent_email ?? s.respondent_phone ?? s.respondent_name ?? "Verified",
              name: s.respondent_name,
            }
          : null,
        answers: (answers.results ?? []).map((a) => ({
          blockRef: a.block_ref,
          blockType: a.block_type,
          value: JSON.parse(a.value_json),
        })),
        transcript: (transcript.results ?? []).map((t) => ({
          role: t.role,
          content: t.content,
          createdAt: t.created_at,
        })),
      });
    }
    return c.json(out);
  },
);

/**
 * The exports.
 *
 * CSV and XLSX are the same table in two containers, so they are one handler
 * over `buildResponseTable` rather than two transcriptions of the same column
 * logic. The CSV path also stopped issuing one query per submission on the way
 * out — see `lib/response-table.ts`.
 */
type ExportCtx = Context<{ Bindings: Bindings; Variables: Partial<AuthzVars & GuardVars> }>;

async function exportSubmissions(c: ExportCtx, format: "csv" | "xlsx") {
  const id = c.get("form")!.id;
  const roleDenied = await assertPermission(c, "submission", "export");
  if (roleDenied) return roleDenied;

  /**
   * Exporting what you finished collecting is free — taking your own data with you must
   * never be the thing behind the paywall. What is gated is the same slice gated
   * everywhere else: the unfinished responses.
   *
   * `includePartials=false` is not a silent narrowing; the button in the UI says
   * "Export 47 responses" and shows the locked partial count beside it.
   */
  const includePartials = new URL(c.req.url).searchParams.get("includePartials") === "true";
  if (includePartials) {
    const denied = await assertFeature(c, "export_partials", { surface: "results.export" });
    if (denied) return denied;
  }

  const table = await buildResponseTable(c.env, id, { includePartials });
  if (!table) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);

  if (format === "xlsx") {
    const bytes = await buildXlsx(table.header, table.rows);
    return new Response(bytes as unknown as BodyInit, {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="responses-${id}.xlsx"`,
        "cache-control": "private, no-store",
      },
    });
  }

  return new Response(toCsv(table), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="submissions-${id}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}

resultsRouter.get(
  "/forms/:id/submissions/export",
  describeRoute({
    tags: ["dashboard"],
    summary: "Export submissions as CSV",
    responses: {
      200: { description: "CSV file", content: { "text/csv": { schema: resolver(z.string()) } } },
      404: { description: "Form not found" },
    },
  }),
  (c) => exportSubmissions(c, "csv"),
);

/**
 * The same responses as a real workbook.
 *
 * Asked for by name, and not the same thing as a CSV: typed cells, a frozen
 * bold header, filters, and columns wide enough to read. A CSV renamed `.xls`
 * is what a spreadsheet import usually degenerates into, and it is why phone
 * numbers arrive with their leading zeros gone.
 */
resultsRouter.get(
  "/forms/:id/submissions/export.xlsx",
  describeRoute({
    tags: ["dashboard"],
    summary: "Export submissions as an Excel workbook",
    responses: {
      200: { description: "XLSX file" },
      404: { description: "Form not found" },
    },
  }),
  (c) => exportSubmissions(c, "xlsx"),
);

/** Analytics summary: counts + per-block answer rates from D1. */
resultsRouter.get(
  "/forms/:id/analytics",
  describeRoute({
    tags: ["dashboard"],
    summary: "Analytics summary (counts + per-block funnel)",
    responses: { 200: { description: "Summary", content: { "application/json": { schema: resolver(Summary) } } } },
  }),
  async (c) => {
    const id = c.get("form")!.id;
    const counts = await c.env.DB.prepare(
      `SELECT
         COUNT(*) AS starts,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN status = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
         AVG(duration_ms) AS avg_duration
       FROM submissions WHERE form_id = ?`,
    )
      .bind(id)
      .first<{ starts: number; completed: number | null; abandoned: number | null; avg_duration: number | null }>();

    const form = await c.env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ?`).bind(id).first<{ working_schema: string }>();
    const doc = form ? JSON.parse(form.working_schema) : { blocks: [] };
    const answerable = (doc.blocks as Block[]).filter((b) => !["welcome", "statement"].includes(b.type));

    const perBlock: { blockRef: string; blockType: string; title: string; answered: number; answerRate: number }[] = [];
    for (const b of answerable) {
      const row = await c.env.DB.prepare(
        `SELECT COUNT(DISTINCT a.submission_id) AS answered,
                (SELECT COUNT(*) FROM submissions s2 WHERE s2.form_id = ?) AS total
         FROM submission_answers a WHERE a.form_id = ? AND a.block_ref = ?`,
      )
        .bind(id, id, b.ref)
        .first<{ answered: number; total: number }>();
      const total = row?.total ?? 0;
      perBlock.push({
        blockRef: b.ref,
        blockType: b.type,
        title: b.title,
        answered: row?.answered ?? 0,
        answerRate: total > 0 ? Math.round(((row?.answered ?? 0) / total) * 100) : 0,
      });
    }

    // per-question answer distributions (Summary tab)
    const distributions = [];
    for (const b of answerable) {
      const rows = await c.env.DB.prepare(
        `SELECT value_json, COUNT(*) AS n FROM submission_answers WHERE form_id = ? AND block_ref = ? GROUP BY value_json ORDER BY n DESC LIMIT 12`,
      )
        .bind(id, b.ref)
        .all<{ value_json: string; n: number }>();
      let numericSummary: { avg: number; min: number; max: number } | null = null;
      const options: { label: string; count: number }[] = [];
      const numericTypes = ["rating", "nps", "opinion_scale", "number"];
      if (numericTypes.includes(b.type)) {
        const agg = await c.env.DB.prepare(
          `SELECT AVG(value_number) AS avg, MIN(value_number) AS min, MAX(value_number) AS max FROM submission_answers WHERE form_id = ? AND block_ref = ? AND value_number IS NOT NULL`,
        )
          .bind(id, b.ref)
          .first<{ avg: number | null; min: number | null; max: number | null }>();
        if (agg?.avg !== null && agg?.avg !== undefined) {
          numericSummary = { avg: Math.round(agg.avg * 10) / 10, min: agg.min ?? 0, max: agg.max ?? 0 };
        }
      } else {
        /**
         * The Summary chart's bars are labelled with the option, not its id.
         *
         * A "Which best describes you?" chart read `opt_founder001` /
         * `opt_dev0000001` down the axis — the one view whose entire job is to
         * tell you at a glance what people picked.
         *
         * Multi-answer blocks are counted per option rather than per distinct
         * combination, or a multi-select's chart is a list of every set anyone
         * happened to choose, each with a count of one.
         */
        const tally = new Map<string, number>();
        for (const row of rows.results ?? []) {
          let parsed: unknown = row.value_json;
          try {
            parsed = JSON.parse(row.value_json);
          } catch {
            /* keep the raw text */
          }
          const parts = Array.isArray(parsed) ? parsed : [parsed];
          const perValue = Array.isArray(parsed) ? parts : [parsed];
          for (const part of perValue) {
            const label = displayAnswer(b as Block, part);
            tally.set(label, (tally.get(label) ?? 0) + row.n);
          }
        }
        for (const [label, count] of [...tally.entries()].sort((a, z) => z[1] - a[1]).slice(0, 12)) {
          options.push({ label, count });
        }
      }
      distributions.push({
        blockRef: b.ref,
        title: b.title,
        type: b.type,
        answered: perBlock.find((p) => p.blockRef === b.ref)?.answered ?? 0,
        numericSummary,
        options,
      });
    }

    // views from rollups
    const viewsRow = await c.env.DB.prepare(`SELECT SUM(views) AS v FROM analytics_rollup_daily WHERE form_id = ?`).bind(id).first<{ v: number | null }>();

    const starts = counts?.starts ?? 0;
    const completed = counts?.completed ?? 0;

    /**
     * Basic analytics are free; advanced analytics are Pro.
     *
     * The split is deliberate about which half is which. Views, starts, completions,
     * completion rate and the abandoned count stay real and unblurred on every plan —
     * those are the numbers that make someone curious. What is withheld is the *detail*
     * that answers the curiosity: which question people drop off at, how each one
     * performed, what the answers actually were.
     *
     * `locked` names what was withheld and `worstBlock` names where the drop-off is
     * without giving the number, so a free user can be told "most people drop off at
     * question 4" truthfully. That sentence is the entire upsell.
     */
    const advanced = await hasFeature(c, "advanced_analytics");
    const roleAdvanced = !(await assertPermission(c, "analytics", "read_advanced"));
    const showDetail = advanced && roleAdvanced;

    const worst = perBlock.reduce<{ title: string; index: number } | null>((acc, b, i) => {
      if (acc === null) return { title: b.title, index: i + 1 };
      const prev = perBlock[acc.index - 1];
      return prev && b.answerRate < prev.answerRate ? { title: b.title, index: i + 1 } : acc;
    }, null);

    return c.json({
      views: viewsRow?.v ?? starts,
      starts,
      completed,
      abandoned: counts?.abandoned ?? 0,
      completionRate: starts > 0 ? Math.round((completed / starts) * 100) : 0,
      avgDurationMs: showDetail ? (counts?.avg_duration ? Math.round(counts.avg_duration) : null) : null,
      perBlock: showDetail ? perBlock : [],
      distributions: showDetail ? distributions : [],
      locked: showDetail ? [] : ["perBlock", "distributions", "avgDurationMs"],
      lockedContext: showDetail
        ? null
        : {
            feature: "advanced_analytics",
            requiredPlan: "pro",
            questionCount: perBlock.length,
            worstBlockTitle: worst?.title ?? null,
            worstBlockIndex: worst?.index ?? null,
          },
    });
  },
);
