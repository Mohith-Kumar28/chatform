import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { migrateFormDoc, type FormDoc } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, requireFormAccess, type GuardVars } from "../lib/guards.js";

export const resultsRouter = new Hono<{ Bindings: Bindings; Variables: Partial<GuardVars> }>();

resultsRouter.use("*", requireSession);
resultsRouter.use("*", requireOrg);
// Results are per-form and therefore per-tenant: another org's form id 404s.
resultsRouter.use("/forms/:id/*", requireFormAccess);

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
    // Bound, never interpolated: `status` is enum-guarded today but string
    // interpolation into SQL is one refactor away from being a hole.
    const subs = await c.env.DB.prepare(
      `SELECT s.id, s.status, s.started_at, s.completed_at, s.duration_ms, s.session_id
       FROM submissions s WHERE s.form_id = ? AND (?1 = 'all' OR s.status = ?1)
       ORDER BY s.started_at DESC LIMIT ?`,
    )
      .bind(id, status, limit)
      .all<{ id: string; status: string; started_at: number; completed_at: number | null; duration_ms: number | null; session_id: string | null }>();

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

/** CSV export — streams all submissions with one column per block. */
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
  async (c) => {
    const id = c.get("form")!.id;
    const form = await c.env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ?`).bind(id).first<{ working_schema: string }>();
    if (!form) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const doc = migrateFormDoc(JSON.parse(form.working_schema)) as FormDoc;
    const answerable = doc.blocks.filter((b: { type: string }) => !["welcome", "statement"].includes(b.type));

    const subs = await c.env.DB.prepare(
      `SELECT s.id, s.status, s.started_at, s.completed_at FROM submissions s WHERE s.form_id = ? AND s.status != 'spam' ORDER BY s.started_at DESC LIMIT 10000`,
    )
      .bind(id)
      .all<{ id: string; status: string; started_at: number; completed_at: number | null }>();

    const header = ["submission_id", "status", "started_at", ...answerable.map((b: { ref: string }) => b.ref)];
    const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
    const rows: string[] = [header.map(esc).join(",")];

    for (const s of subs.results ?? []) {
      const answers = await c.env.DB.prepare(`SELECT block_ref, value_json FROM submission_answers WHERE submission_id = ?`)
        .bind(s.id)
        .all<{ block_ref: string; value_json: string }>();
      const map = new Map((answers.results ?? []).map((a) => [a.block_ref, a.value_json]));
      rows.push([
        s.id,
        s.status,
        new Date(s.started_at).toISOString(),
        ...answerable.map((b: { ref: string }) => {
          const v = map.get(b.ref);
          if (!v) return "";
          try {
            const parsed = JSON.parse(v);
            return typeof parsed === "string" ? parsed : JSON.stringify(parsed);
          } catch {
            return v;
          }
        }),
      ].map(esc).join(","));
    }

    return new Response(rows.join("\n"), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="submissions-${id}.csv"`,
      },
    });
  },
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
    const answerable = doc.blocks.filter((b: { type: string }) => !["welcome", "statement"].includes(b.type));

    const perBlock = [];
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
        for (const row of rows.results ?? []) {
          try {
            const v = JSON.parse(row.value_json);
            options.push({ label: typeof v === "string" ? v : JSON.stringify(v), count: row.n });
          } catch {
            options.push({ label: row.value_json, count: row.n });
          }
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
    return c.json({
      views: viewsRow?.v ?? starts,
      starts,
      completed,
      abandoned: counts?.abandoned ?? 0,
      completionRate: starts > 0 ? Math.round((completed / starts) * 100) : 0,
      avgDurationMs: counts?.avg_duration ? Math.round(counts.avg_duration) : null,
      perBlock,
      distributions,
    });
  },
);
