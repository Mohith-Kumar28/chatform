import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../env.js";
import { createAuth } from "../lib/auth.js";

export const resultsRouter = new Hono<{ Bindings: Bindings; Variables: { userId: string } }>();

resultsRouter.use("*", async (c, next) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
  await next();
});

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
    const id = c.req.param("id");
    const { status, limit } = c.req.valid("query");
    const where = status === "all" ? "" : `AND s.status = '${status}'`;
    const subs = await c.env.DB.prepare(
      `SELECT s.id, s.status, s.started_at, s.completed_at, s.duration_ms, s.session_id
       FROM submissions s WHERE s.form_id = ? ${where}
       ORDER BY s.started_at DESC LIMIT ?`,
    )
      .bind(id, limit)
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
  describeRoute({ tags: ["dashboard"], summary: "Export submissions as CSV" }),
  async (c) => {
    const id = c.req.param("id");
    const form = await c.env.DB.prepare(`SELECT working_schema FROM forms WHERE id = ?`).bind(id).first<{ working_schema: string }>();
    if (!form) return c.json({ error: { code: "not_found", message: "Form not found" } }, 404);
    const doc = JSON.parse(form.working_schema);
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
    const id = c.req.param("id");
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

    const starts = counts?.starts ?? 0;
    const completed = counts?.completed ?? 0;
    return c.json({
      views: starts, // AE-based views land with M6 rollups; starts is the floor
      starts,
      completed,
      abandoned: counts?.abandoned ?? 0,
      completionRate: starts > 0 ? Math.round((completed / starts) * 100) : 0,
      avgDurationMs: counts?.avg_duration ? Math.round(counts.avg_duration) : null,
      perBlock,
    });
  },
);
