import { Hono, type Context } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import { displayAnswer, type Block } from "@repo/form-schema";
import type { Bindings } from "../env.js";
import { requireSession, requireOrg, requireFormAccess, type GuardVars } from "../lib/guards.js";
import { requirePermission, assertPermission, assertFeature, hasFeature, entitlementsFor, type AuthzVars } from "../lib/authorize.js";
import { buildResponseTable, toCsv } from "../lib/response-table.js";
import { computeAnalytics } from "../lib/analytics-service.js";
import { computeFollowUpStats } from "../lib/followup-analytics.js";
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
resultsRouter.use("/forms/:id/followup-analytics", requirePermission("analytics", "read"));

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
  medianDurationMs: z.number().nullable(),
  perBlock: z.array(
    z.object({
      blockRef: z.string(),
      blockType: z.string(),
      title: z.string(),
      answered: z.number(),
      answerRate: z.number(),
      dropOff: z.number(),
    }),
  ),
  /** Per-question answer shapes — whichever of these the question's type fills in. */
  distributions: z.array(
    z.object({
      blockRef: z.string(),
      title: z.string(),
      type: z.string(),
      answered: z.number(),
      options: z.array(z.object({ label: z.string(), count: z.number() })),
      multi: z.boolean(),
      values: z.array(z.object({ value: z.number(), count: z.number() })),
      numericSummary: z
        .object({ avg: z.number(), min: z.number(), max: z.number(), median: z.number() })
        .nullable(),
      samples: z.array(z.string()),
      ranking: z.array(z.object({ label: z.string(), avgRank: z.number() })),
      matrix: z
        .object({ rows: z.array(z.string()), cols: z.array(z.string()), counts: z.array(z.array(z.number())) })
        .nullable(),
      timeline: z.array(z.object({ label: z.string(), count: z.number() })),
    }),
  ),
  daily: z.array(
    z.object({ date: z.string(), views: z.number(), starts: z.number(), completed: z.number() }),
  ),
  bySource: z.array(z.object({ source: z.string(), count: z.number() })),
  byCountry: z.array(z.object({ country: z.string(), count: z.number() })),
  byDevice: z.object({ mobile: z.number(), desktop: z.number() }).nullable(),
  durationBuckets: z.array(z.object({ label: z.string(), count: z.number() })),
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
      status: z.enum(["all", "completed", "disqualified", "abandoned", "in_progress"]).default("all"),
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
    /**
     * A screened-out response is gated with the unfinished ones.
     *
     * Not because it is unfinished — it is as terminal as a completion — but
     * because it is not a response the author asked for, and the Free tier's
     * line is "the responses you got are yours; the ones that did not arrive
     * are Pro". Somebody the form turned away did not arrive.
     */
    let effectiveStatus: typeof status = status;
    if (status === "abandoned" || status === "in_progress" || status === "disqualified" || status === "all") {
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
            `SELECT COUNT(*) AS n FROM submissions WHERE form_id = ? AND status IN ('abandoned','in_progress','disqualified')`,
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

    /**
     * Follow-up state, for the whole page in one query.
     *
     * Per-row would be one more round trip each on a list that already does two
     * — and this is a summary badge, not a schedule the author edits here.
     * `sent` counts nudges that actually went out; `holdout` marks the ones we
     * deliberately kept quiet so the recovery number means something.
     */
    const followUps = await c.env.DB.prepare(
      `SELECT submission_id,
              SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
              SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled,
              MAX(CASE WHEN status = 'holdout' THEN 1 ELSE 0 END) AS holdout
         FROM followups WHERE form_id = ? GROUP BY submission_id`,
    )
      .bind(id)
      .all<{ submission_id: string; sent: number; scheduled: number; holdout: number }>();
    const byId = new Map(followUps.results?.map((r) => [r.submission_id, r]) ?? []);

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
        /**
         * Null when this response was never in a sequence at all, which is the
         * common case and reads differently from "nudged nobody yet".
         *
         * `recovered` is the number the feature is sold on: they were nudged,
         * and then they finished.
         */
        followUp: byId.has(s.id)
          ? {
              sent: byId.get(s.id)!.sent,
              scheduled: byId.get(s.id)!.scheduled,
              holdout: byId.get(s.id)!.holdout === 1,
              recovered: byId.get(s.id)!.sent > 0 && s.status === "completed",
            }
          : null,
      });
    }
    return c.json(out);
  },
);

/**
 * Delete responses, by id.
 *
 * The `submission:delete` permission has been in the role table since roles
 * existed and nothing has ever asked for it — the dashboard could show a
 * response and export it, but a test run, a duplicate, or someone's private
 * data submitted by mistake could not be removed by the person responsible for
 * it. Bulk by construction: the table selects with checkboxes, and one
 * statement for a hundred ids beats a hundred round trips to D1.
 *
 * The transcript goes with it. A conversation is the response's content, not a
 * separate artefact, so leaving `chat_messages` behind after deleting the
 * answers would keep exactly the thing the person asked to be rid of; the
 * session row is deleted and its messages cascade.
 */
resultsRouter.delete(
  "/forms/:id/submissions",
  describeRoute({
    tags: ["dashboard"],
    summary: "Delete responses",
    responses: {
      200: { description: "How many were deleted", content: { "application/json": { schema: resolver(z.object({ deleted: z.number() })) } } },
      403: { description: "Role may not delete responses" },
    },
  }),
  validator("json", z.object({ ids: z.array(z.string()).min(1).max(200) })),
  async (c) => {
    const formId = c.get("form")!.id;
    const denied = await assertPermission(c, "submission", "delete");
    if (denied) return denied;

    const { ids } = c.req.valid("json");
    const holes = ids.map(() => "?").join(",");

    // Scoped to this form as well as to the ids: `requireFormAccess` proves the
    // caller owns the form, and this is what stops an id from another form —
    // or another tenant — riding along in the list.
    const owned = await c.env.DB.prepare(
      `SELECT id, session_id FROM submissions WHERE form_id = ? AND id IN (${holes})`,
    )
      .bind(formId, ...ids)
      .all<{ id: string; session_id: string | null }>();

    const rows = owned.results ?? [];
    if (rows.length === 0) return c.json({ deleted: 0 });

    const sessionIds = rows.map((r) => r.session_id).filter((s): s is string => s !== null);
    const stmts = [
      c.env.DB.prepare(
        `DELETE FROM submissions WHERE form_id = ? AND id IN (${rows.map(() => "?").join(",")})`,
      ).bind(formId, ...rows.map((r) => r.id)),
    ];
    if (sessionIds.length > 0) {
      stmts.push(
        c.env.DB.prepare(
          `DELETE FROM chat_sessions WHERE id IN (${sessionIds.map(() => "?").join(",")})`,
        ).bind(...sessionIds),
      );
    }
    await c.env.DB.batch(stmts);
    return c.json({ deleted: rows.length });
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

/**
 * The analytics summary the dashboard draws.
 *
 * This used to be a second implementation of `computeAnalytics` — the same
 * counts, the same funnel, the same distributions, written again inline and
 * drifting: it read the *draft* schema while counting answers from published
 * versions, and it cost two statements per question plus a correlated subquery
 * for the total. The numbers the dashboard shows and the numbers `/v1` serves
 * are now the same numbers.
 */
resultsRouter.get(
  "/forms/:id/analytics",
  describeRoute({
    tags: ["dashboard"],
    summary: "Analytics summary (counts, funnel, per-question distributions)",
    responses: { 200: { description: "Summary", content: { "application/json": { schema: resolver(Summary) } } } },
  }),
  async (c) => {
    const id = c.get("form")!.id;
    const agg = await computeAnalytics(c.env, id);

    /**
     * Basic analytics are free; advanced analytics are Pro.
     *
     * The split is deliberate about which half is which. Views, starts, completions,
     * completion rate and the abandoned count stay real and unblurred on every plan —
     * those are the numbers that make someone curious. What is withheld is the *detail*
     * that answers the curiosity: which question people drop off at, how each one
     * performed, what the answers actually were, and where they came from.
     *
     * `locked` names what was withheld and `worstBlock` names where the drop-off is
     * without giving the number, so a free user can be told "most people drop off at
     * question 4" truthfully. That sentence is the entire upsell.
     */
    const advanced = await hasFeature(c, "advanced_analytics");
    const roleAdvanced = !(await assertPermission(c, "analytics", "read_advanced"));
    const showDetail = advanced && roleAdvanced;

    const worst = agg.perBlock.reduce<{ title: string; index: number } | null>((acc, b, i) => {
      if (acc === null) return { title: b.title, index: i + 1 };
      const prev = agg.perBlock[acc.index - 1];
      return prev && b.answerRate < prev.answerRate ? { title: b.title, index: i + 1 } : acc;
    }, null);

    return c.json({
      views: agg.views,
      starts: agg.starts,
      completed: agg.completed,
      abandoned: agg.abandoned,
      completionRate: agg.completionRate,
      avgDurationMs: showDetail ? agg.avgDurationMs : null,
      medianDurationMs: showDetail ? agg.medianDurationMs : null,
      perBlock: showDetail ? agg.perBlock : [],
      distributions: showDetail ? agg.distributions : [],
      daily: showDetail ? agg.daily : [],
      bySource: showDetail ? agg.bySource : [],
      byCountry: showDetail ? agg.byCountry : [],
      byDevice: showDetail ? agg.byDevice : null,
      durationBuckets: showDetail ? agg.durationBuckets : [],
      locked: showDetail
        ? []
        : ["perBlock", "distributions", "avgDurationMs", "medianDurationMs", "daily", "bySource", "byCountry", "byDevice", "durationBuckets"],
      lockedContext: showDetail
        ? null
        : {
            feature: "advanced_analytics",
            requiredPlan: "pro",
            questionCount: agg.perBlock.length,
            worstBlockTitle: worst?.title ?? null,
            worstBlockIndex: worst?.index ?? null,
          },
    });
  },
);

const FollowUpSummary = z.object({
  everScheduled: z.boolean(),
  sent: z.number(),
  pending: z.number(),
  clicked: z.number(),
  recovered: z.number(),
  clickRate: z.number(),
  recoveryRate: z.number(),
  byStep: z.array(
    z.object({ step: z.number(), sent: z.number(), clicked: z.number(), recovered: z.number() }),
  ),
  daily: z.array(z.object({ date: z.string(), sent: z.number(), recovered: z.number() })),
  holdout: z.object({ people: z.number(), recovered: z.number(), rate: z.number() }).nullable(),
  liftPoints: z.number().nullable(),
});

/**
 * What the follow-ups recovered.
 *
 * Separate from `/analytics` rather than folded into it, for two reasons. It is
 * gated on a different feature — an author can be entitled to send nudges and
 * not to advanced analytics, and refusing them the report on the mail they are
 * paying to send would be absurd — and it is dead weight on every form that has
 * follow-ups switched off, which is most of them.
 *
 * An unentitled or never-configured form gets `everScheduled: false` and zeros
 * rather than a 402. There is nothing withheld here: the client draws the pitch
 * for a feature that is off, and a payment-required on a page someone opened to
 * read their results is a worse answer than "nothing to show yet".
 */
resultsRouter.get(
  "/forms/:id/followup-analytics",
  describeRoute({
    tags: ["dashboard"],
    summary: "Follow-up recovery report (sent, clicked, recovered, holdout lift)",
    responses: { 200: { description: "Recovery report", content: { "application/json": { schema: resolver(FollowUpSummary) } } } },
  }),
  async (c) => {
    const id = c.get("form")!.id;
    return c.json(await computeFollowUpStats(c.env, id));
  },
);
