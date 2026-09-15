import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import type { PlatformAdminVars } from "../../lib/platform-admin.js";
import { audit, DAY_MS, PLAN_OF_ORG, RANGES, RangeQuery, dayKeys, rows, type RangeKey } from "./shared.js";

/**
 * What respondents said about the product, and what was done about it.
 *
 * The exception to the boundary the rest of this console keeps: it reads text a
 * respondent typed. That is allowed here and nowhere else because of who the
 * text was addressed to — this comes from the "Report a bug" link beside our own
 * footer, which is a message to us, not an answer to somebody's question.
 *
 * Guarded by `requirePlatformAdmin` at the mount in `./index.ts`, not here.
 *
 * `spam` is excluded from every count and every list by default. A report
 * somebody has already judged to be junk must stop moving the average, or
 * marking it as junk achieves nothing.
 */
export const feedbackRouter = new Hono<{ Bindings: Bindings; Variables: Partial<PlatformAdminVars> }>();

export const FEEDBACK_STATUSES = ["new", "resolved", "spam"] as const;

/** Everything a reader should see unless they went looking for the bin. */
const LIVE = `status != 'spam'`;

/** Under this many reports an average is noise wearing a measurement's clothes. */
const MIN_FOR_AVERAGE = 5;

/**
 * Counts by rating → the five bars, the total, and the average to one decimal.
 *
 * One function because two screens print this number, and two roundings of the
 * same average is the kind of disagreement that gets a dashboard distrusted.
 */
function spread(counted: { rating: number; n: number }[]): {
  distribution: { rating: number; count: number }[];
  total: number;
  average: number | null;
} {
  const by = new Map(counted.map((r) => [Number(r.rating), Number(r.n)]));
  const distribution = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: by.get(rating) ?? 0 }));
  const total = distribution.reduce((n, d) => n + d.count, 0);
  const average =
    total === 0 ? null : Math.round((distribution.reduce((s, d) => s + d.rating * d.count, 0) / total) * 10) / 10;
  return { distribution, total, average };
}

/** An average only where there is enough of it to mean something. */
const meanOf = (sum: number, n: number): number | null =>
  n >= MIN_FOR_AVERAGE ? Math.round((sum / n) * 10) / 10 : null;

// ───────────────────────── the Overview card ─────────────────────────

const FeedbackNote = z.object({
  id: z.string(),
  rating: z.number(),
  message: z.string().nullable(),
  createdAt: z.number(),
  /** Where it happened. Null once the form has been deleted out from under it. */
  formId: z.string().nullable(),
  formTitle: z.string().nullable(),
  /** The platform-wide person, so two notes from one respondent read as one voice. */
  respondentId: z.string().nullable(),
  userAgent: z.string().nullable(),
});

const FeedbackResponse = z.object({
  range: z.string(),
  total: z.number(),
  /** Null when nobody rated anything in the window — not zero, which is a score. */
  average: z.number().nullable(),
  /** Five entries, 1 to 5, including the ratings nobody picked. */
  distribution: z.array(z.object({ rating: z.number(), count: z.number() })),
  notes: z.array(FeedbackNote),
});

/** How many notes the card lists. Past this it stops being a read and starts being a queue. */
const FEEDBACK_NOTES = 30;

/**
 * The summary on Overview — unchanged when it moved here from `core.ts`.
 *
 * It answers "is anything wrong this week" in one glance and then hands over:
 * the card's footer links into `/admin/feedback`, which is where the work
 * happens. The ratings and the notes are two reads of the same window because
 * the distribution says whether something is wrong and the notes say what.
 */
feedbackRouter.get(
  "/admin/feedback",
  validator("query", RangeQuery),
  describeRoute({
    tags: ["admin"],
    summary: "What respondents said about the product, and how they rated it",
    responses: {
      200: { description: "Respondent feedback", content: { "application/json": { schema: resolver(FeedbackResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const range = c.req.valid("query").range as RangeKey;
    const since = Date.now() - RANGES[range] * DAY_MS;

    const [counted, recent] = await Promise.all([
      rows<{ rating: number; n: number }>(
        c.env.DB.prepare(
          `SELECT rating, COUNT(*) AS n FROM respondent_feedback WHERE created_at >= ?1 AND ${LIVE} GROUP BY rating`,
        ).bind(since),
      ),
      /*
        Left-joined to `forms` rather than storing the title on the row: a form
        gets renamed, and a report filed under its old name sends whoever is
        reproducing it looking for a form that no longer goes by that.
      */
      rows<{
        id: string;
        rating: number;
        message: string | null;
        created_at: number;
        form_id: string | null;
        respondent_id: string | null;
        user_agent: string | null;
        form_title: string | null;
      }>(
        c.env.DB.prepare(
          `SELECT fb.id, fb.rating, fb.message, fb.created_at, fb.form_id, fb.respondent_id, fb.user_agent,
                  f.title AS form_title
             FROM respondent_feedback fb
             LEFT JOIN forms f ON f.id = fb.form_id
            WHERE fb.created_at >= ?1 AND fb.${LIVE}
            ORDER BY fb.created_at DESC
            LIMIT ${FEEDBACK_NOTES}`,
        ).bind(since),
      ),
    ]);

    const { distribution, total, average } = spread(counted);
    return c.json({
      range,
      total,
      average,
      distribution,
      notes: recent.map((r) => ({
        id: r.id,
        rating: Number(r.rating),
        message: r.message,
        createdAt: Number(r.created_at),
        formId: r.form_id,
        formTitle: r.form_title,
        respondentId: r.respondent_id,
        userAgent: r.user_agent,
      })),
    });
  },
);

// ───────────────────────────── the page's numbers ─────────────────────────────

const DaySeries = z.array(z.number());

const Cluster = z.object({
  key: z.string().nullable(),
  label: z.string().nullable(),
  /** The live form's slug, where there is one — the console links straight at it. */
  slug: z.string().nullable(),
  orgId: z.string().nullable(),
  count: z.number(),
  /** Null under five reports: the mean of two is noise, not a measurement. */
  average: z.number().nullable(),
});

const FeedbackStats = z.object({
  range: z.string(),
  /** `YYYY-MM-DD`, oldest first — `TrendChart`'s `days`. */
  days: z.array(z.string()),
  total: z.number(),
  previousTotal: z.number(),
  average: z.number().nullable(),
  previousAverage: z.number().nullable(),
  withNote: z.number(),
  previousWithNote: z.number(),
  respondents: z.number(),
  previousRespondents: z.number(),
  bad: z.number(),
  previousBad: z.number(),
  /** Still `new`, over all time — a standing queue, not a figure for this window. */
  unresolved: z.number(),
  distribution: z.array(z.object({ rating: z.number(), count: z.number() })),
  series: z.object({
    volume: DaySeries,
    withNote: DaySeries,
    /** Null on a day nobody reported — a gap in the line, not a rating of zero. */
    average: z.array(z.number().nullable()),
    byRating: z.array(z.object({ rating: z.number(), counts: DaySeries })),
  }),
  bySource: z.array(z.object({ key: z.string(), value: z.number() })),
  topForms: z.array(Cluster),
  topAccounts: z.array(Cluster),
  topTopics: z.array(z.object({ key: z.string(), value: z.number() })),
});

/** One window's totals, run twice — this period and the one before it. */
async function windowTotals(env: Bindings, from: number, to: number) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n,
            SUM(rating) AS pts,
            COUNT(DISTINCT respondent_id) AS people,
            SUM(CASE WHEN message IS NOT NULL AND message != '' THEN 1 ELSE 0 END) AS noted,
            SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) AS bad
       FROM respondent_feedback
      WHERE created_at >= ?1 AND created_at < ?2 AND ${LIVE}`,
  )
    .bind(from, to)
    .first<{ n: number; pts: number | null; people: number; noted: number; bad: number }>();
  const n = Number(row?.n ?? 0);
  return {
    total: n,
    average: n === 0 ? null : Math.round((Number(row?.pts ?? 0) / n) * 10) / 10,
    respondents: Number(row?.people ?? 0),
    withNote: Number(row?.noted ?? 0),
    bad: Number(row?.bad ?? 0),
  };
}

/**
 * Everything the charts need, in one round of small queries.
 *
 * Deliberately not cached, unlike the overview: the whole value of this screen is
 * that a report filed two minutes ago is on it. Nothing here scans — the day grid
 * and the window totals are bounded by `created_at`, the clusters group inside the
 * same bound, and the unresolved count rides the new status index.
 */
feedbackRouter.get(
  "/admin/feedback/stats",
  validator("query", RangeQuery),
  describeRoute({
    tags: ["admin"],
    summary: "Volume, rating and clustering of respondent feedback over a period",
    responses: {
      200: { description: "Feedback statistics", content: { "application/json": { schema: resolver(FeedbackStats) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const range = c.req.valid("query").range as RangeKey;
    const days = RANGES[range];
    const now = Date.now();
    const since = now - days * DAY_MS;
    const prevSince = since - days * DAY_MS;

    const [grid, current, previous, unresolvedRow, forms, accounts, sources, topics] = await Promise.all([
      /*
        One grid, folded five ways: the volume line, the noted line, the daily
        average, the stacked-by-rating view and the whole-period distribution all
        come out of the same rows rather than five trips to the same table.
      */
      rows<{ d: string; rating: number; n: number; noted: number }>(
        c.env.DB.prepare(
          `SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS d, rating, COUNT(*) AS n,
                  SUM(CASE WHEN message IS NOT NULL AND message != '' THEN 1 ELSE 0 END) AS noted
             FROM respondent_feedback
            WHERE created_at >= ?1 AND ${LIVE}
            GROUP BY d, rating`,
        ).bind(since),
      ),
      windowTotals(c.env, since, now),
      windowTotals(c.env, prevSince, since),
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM respondent_feedback WHERE status = 'new'`).first<{ n: number }>(),
      rows<{ key: string; label: string | null; slug: string | null; org_id: string | null; n: number; pts: number }>(
        c.env.DB.prepare(
          `SELECT fb.form_id AS key, f.title AS label, f.slug AS slug, fb.organization_id AS org_id,
                  COUNT(*) AS n, SUM(fb.rating) AS pts
             FROM respondent_feedback fb
             LEFT JOIN forms f ON f.id = fb.form_id
            WHERE fb.created_at >= ?1 AND fb.${LIVE} AND fb.form_id IS NOT NULL
            GROUP BY fb.form_id
            ORDER BY n DESC
            LIMIT 8`,
        ).bind(since),
      ),
      rows<{ key: string; label: string | null; n: number; pts: number }>(
        c.env.DB.prepare(
          `SELECT fb.organization_id AS key, o.name AS label, COUNT(*) AS n, SUM(fb.rating) AS pts
             FROM respondent_feedback fb
             LEFT JOIN organizations o ON o.id = fb.organization_id
            WHERE fb.created_at >= ?1 AND fb.${LIVE} AND fb.organization_id IS NOT NULL
            GROUP BY fb.organization_id
            ORDER BY n DESC
            LIMIT 8`,
        ).bind(since),
      ),
      rows<{ key: string; value: number }>(
        c.env.DB.prepare(
          `SELECT source AS key, COUNT(*) AS value FROM respondent_feedback
            WHERE created_at >= ?1 AND ${LIVE} GROUP BY source ORDER BY value DESC`,
        ).bind(since),
      ),
      rows<{ key: string; value: number }>(
        c.env.DB.prepare(
          `SELECT topic AS key, COUNT(*) AS value FROM respondent_feedback
            WHERE created_at >= ?1 AND ${LIVE} AND topic IS NOT NULL
            GROUP BY topic ORDER BY value DESC LIMIT 8`,
        ).bind(since),
      ),
    ]);

    // Folded against every day in the window, so a quiet Tuesday is a zero in the
    // line rather than a hole the chart closes up.
    const dayList = dayKeys(days);
    const index = new Map(dayList.map((d, i) => [d, i]));
    const volume = new Array<number>(dayList.length).fill(0);
    const noted = new Array<number>(dayList.length).fill(0);
    const points = new Array<number>(dayList.length).fill(0);
    const byRating = [1, 2, 3, 4, 5].map((rating) => ({
      rating,
      counts: new Array<number>(dayList.length).fill(0),
    }));
    const counted = new Map<number, number>();

    for (const row of grid) {
      const i = index.get(row.d);
      const rating = Number(row.rating);
      const n = Number(row.n);
      counted.set(rating, (counted.get(rating) ?? 0) + n);
      if (i === undefined) continue;
      volume[i] = (volume[i] ?? 0) + n;
      noted[i] = (noted[i] ?? 0) + Number(row.noted);
      points[i] = (points[i] ?? 0) + rating * n;
      const band = byRating.find((b) => b.rating === rating);
      if (band) band.counts[i] = (band.counts[i] ?? 0) + n;
    }

    const { distribution } = spread([...counted].map(([rating, n]) => ({ rating, n })));

    return c.json({
      range,
      days: dayList,
      total: current.total,
      previousTotal: previous.total,
      average: current.average,
      previousAverage: previous.average,
      withNote: current.withNote,
      previousWithNote: previous.withNote,
      respondents: current.respondents,
      previousRespondents: previous.respondents,
      bad: current.bad,
      previousBad: previous.bad,
      unresolved: Number(unresolvedRow?.n ?? 0),
      distribution,
      series: {
        volume,
        withNote: noted,
        average: volume.map((n, i) => (n === 0 ? null : Math.round(((points[i] ?? 0) / n) * 10) / 10)),
        byRating,
      },
      bySource: sources.map((s) => ({ key: s.key, value: Number(s.value) })),
      topForms: forms.map((f) => ({
        key: f.key,
        label: f.label,
        slug: f.slug,
        orgId: f.org_id,
        count: Number(f.n),
        average: meanOf(Number(f.pts), Number(f.n)),
      })),
      topAccounts: accounts.map((a) => ({
        key: a.key,
        label: a.label,
        slug: null,
        orgId: a.key,
        count: Number(a.n),
        average: meanOf(Number(a.pts), Number(a.n)),
      })),
      topTopics: topics.map((t) => ({ key: t.key, value: Number(t.value) })),
    });
  },
);

// ───────────────────────────────── the inbox ─────────────────────────────────

const ReportsQuery = z.object({
  status: z.enum(["new", "resolved", "spam", "all"]).default("new"),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  noted: z.enum(["any", "yes", "no"]).default("any"),
  source: z.enum(["chat", "embed"]).optional(),
  topic: z.string().max(40).optional(),
  /** Form title or slug, account name, or the words they typed. */
  q: z.string().max(120).optional(),
  formId: z.string().max(64).optional(),
  orgId: z.string().max(64).optional(),
  respondentId: z.string().max(64).optional(),
  sort: z.enum(["newest", "oldest", "worst"]).default("newest"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const Report = z.object({
  id: z.string(),
  rating: z.number(),
  message: z.string().nullable(),
  createdAt: z.number(),
  status: z.string(),
  statusAt: z.number().nullable(),
  /** An email, not a user id — platform admins are a secret, not rows in `users`. */
  statusBy: z.string().nullable(),
  internalNote: z.string().nullable(),
  topic: z.string().nullable(),
  sentiment: z.number().nullable(),
  source: z.string(),
  userAgent: z.string().nullable(),
  sessionId: z.string().nullable(),
  hasSnapshot: z.boolean(),
  formId: z.string().nullable(),
  formTitle: z.string().nullable(),
  formSlug: z.string().nullable(),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable(),
  respondentId: z.string().nullable(),
  /** Their name, address or number — whichever a verified sign-in gave us. */
  respondentLabel: z.string().nullable(),
});

const ReportsResponse = z.object({
  reports: z.array(Report),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
  /** Unfiltered on purpose: the tab badges must not move as the list narrows. */
  counts: z.object({ new: z.number(), resolved: z.number(), spam: z.number() }),
});

const SORTS: Record<string, string> = {
  newest: "fb.created_at DESC",
  oldest: "fb.created_at ASC",
  worst: "fb.rating ASC, fb.created_at DESC",
};

const REPORT_COLUMNS = `fb.id, fb.rating, fb.message, fb.created_at, fb.status, fb.status_at, fb.status_by,
       fb.internal_note, fb.topic, fb.sentiment, fb.source, fb.user_agent, fb.session_id, fb.snapshot_key,
       fb.form_id, fb.organization_id, fb.respondent_id,
       f.title AS form_title, f.slug AS form_slug, o.name AS org_name,
       COALESCE(r.display_name, r.email, r.phone) AS respondent_label`;

const REPORT_JOINS = `FROM respondent_feedback fb
       LEFT JOIN forms f ON f.id = fb.form_id
       LEFT JOIN organizations o ON o.id = fb.organization_id
       LEFT JOIN respondents r ON r.id = fb.respondent_id`;

interface ReportRow {
  id: string;
  rating: number;
  message: string | null;
  created_at: number;
  status: string;
  status_at: number | null;
  status_by: string | null;
  internal_note: string | null;
  topic: string | null;
  sentiment: number | null;
  source: string;
  user_agent: string | null;
  session_id: string | null;
  snapshot_key: string | null;
  form_id: string | null;
  organization_id: string | null;
  respondent_id: string | null;
  form_title: string | null;
  form_slug: string | null;
  org_name: string | null;
  respondent_label: string | null;
}

const toReport = (r: ReportRow) => ({
  id: r.id,
  rating: Number(r.rating),
  message: r.message,
  createdAt: Number(r.created_at),
  status: r.status,
  statusAt: r.status_at === null ? null : Number(r.status_at),
  statusBy: r.status_by,
  internalNote: r.internal_note,
  topic: r.topic,
  sentiment: r.sentiment === null ? null : Number(r.sentiment),
  source: r.source,
  userAgent: r.user_agent,
  sessionId: r.session_id,
  hasSnapshot: Boolean(r.snapshot_key),
  formId: r.form_id,
  formTitle: r.form_title,
  formSlug: r.form_slug,
  organizationId: r.organization_id,
  organizationName: r.org_name,
  respondentId: r.respondent_id,
  respondentLabel: r.respondent_label,
});

/**
 * The queue itself — and the one read on this page that ignores the date range.
 *
 * An unresolved report from forty days ago is still work. A list that empties
 * itself when somebody clicks "7 days" is a list that loses things, so the
 * filters here are the ones that describe the work — status, rating, which form,
 * which account — and the period picker above governs the charts only.
 */
feedbackRouter.get(
  "/admin/feedback/reports",
  validator("query", ReportsQuery),
  describeRoute({
    tags: ["admin"],
    summary: "The bug-report inbox, filtered and paged",
    responses: {
      200: { description: "Reports", content: { "application/json": { schema: resolver(ReportsResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const q = c.req.valid("query");
    const where: string[] = [];
    const binds: unknown[] = [];

    if (q.status === "all") where.push(`fb.${LIVE}`);
    else where.push("fb.status = ?"), binds.push(q.status);
    if (q.rating !== undefined) where.push("fb.rating = ?"), binds.push(q.rating);
    if (q.noted === "yes") where.push("fb.message IS NOT NULL AND fb.message != ''");
    if (q.noted === "no") where.push("(fb.message IS NULL OR fb.message = '')");
    if (q.source) where.push("fb.source = ?"), binds.push(q.source);
    if (q.topic) where.push("fb.topic = ?"), binds.push(q.topic);
    if (q.formId) where.push("fb.form_id = ?"), binds.push(q.formId);
    if (q.orgId) where.push("fb.organization_id = ?"), binds.push(q.orgId);
    if (q.respondentId) where.push("fb.respondent_id = ?"), binds.push(q.respondentId);
    if (q.q) {
      const like = `%${q.q}%`;
      where.push("(f.title LIKE ? OR f.slug LIKE ? OR o.name LIKE ? OR fb.message LIKE ?)");
      binds.push(like, like, like, like);
    }
    const clause = where.join(" AND ");

    const [reports, totalRow, counted] = await Promise.all([
      rows<ReportRow>(
        c.env.DB.prepare(
          `SELECT ${REPORT_COLUMNS} ${REPORT_JOINS} WHERE ${clause}
            ORDER BY ${SORTS[q.sort]} LIMIT ? OFFSET ?`,
        ).bind(...binds, q.limit, q.offset),
      ),
      /*
        The same WHERE, deliberately repeated. `/admin/forms` counts the whole
        table regardless of its filters, which makes its pager claim pages that
        do not exist — a small lie that costs a reader real time.
      */
      c.env.DB.prepare(`SELECT COUNT(*) AS n ${REPORT_JOINS} WHERE ${clause}`)
        .bind(...binds)
        .first<{ n: number }>(),
      rows<{ status: string; n: number }>(
        c.env.DB.prepare(`SELECT status, COUNT(*) AS n FROM respondent_feedback GROUP BY status`),
      ),
    ]);

    const byStatus = new Map(counted.map((r) => [r.status, Number(r.n)]));
    return c.json({
      reports: reports.map(toReport),
      total: Number(totalRow?.n ?? 0),
      limit: q.limit,
      offset: q.offset,
      counts: {
        new: byStatus.get("new") ?? 0,
        resolved: byStatus.get("resolved") ?? 0,
        spam: byStatus.get("spam") ?? 0,
      },
    });
  },
);

// ──────────────────────────── one report, in full ────────────────────────────

const ReportDetail = Report.extend({
  organizationPlan: z.string().nullable(),
  formVersionId: z.string().nullable(),
  respondent: z
    .object({
      id: z.string(),
      label: z.string().nullable(),
      email: z.string().nullable(),
      phone: z.string().nullable(),
      firstSeenAt: z.number().nullable(),
      lastSeenAt: z.number().nullable(),
      reportCount: z.number(),
    })
    .nullable(),
  session: z
    .object({
      id: z.string(),
      status: z.string(),
      country: z.string().nullable(),
      source: z.string(),
      collectedCount: z.number(),
      turnCount: z.number(),
      isTest: z.boolean(),
      createdAt: z.number(),
      lastActivityAt: z.number(),
      submissionId: z.string().nullable(),
    })
    .nullable(),
});

/**
 * Everything about one report, so the dialog is one request rather than five.
 *
 * The respondent block is the half that decides whether a reply is possible at
 * all: those columns are written only by a verified sign-in, so on an open form
 * they are null and the console has to say "never signed in" rather than render
 * an empty field and let the reader wonder whether it failed to load.
 */
feedbackRouter.get(
  "/admin/feedback/reports/:id",
  describeRoute({
    tags: ["admin"],
    summary: "One bug report, with its account, form, respondent and session",
    responses: {
      200: { description: "Report", content: { "application/json": { schema: resolver(ReportDetail) } } },
      404: { description: "Not an admin, or no such report" },
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(
      `SELECT ${REPORT_COLUMNS}, fb.form_version_id,
              COALESCE((${PLAN_OF_ORG}), 'free') AS plan,
              r.email AS respondent_email, r.phone AS respondent_phone,
              r.first_seen_at, r.last_seen_at
         ${REPORT_JOINS}
        WHERE fb.id = ?1`,
    )
      .bind(id)
      .first<
        ReportRow & {
          form_version_id: string | null;
          plan: string;
          respondent_email: string | null;
          respondent_phone: string | null;
          first_seen_at: number | null;
          last_seen_at: number | null;
        }
      >();
    if (!row) return c.json({ error: { code: "not_found", message: "No such report" } }, 404);

    const [reportCount, session] = await Promise.all([
      row.respondent_id
        ? c.env.DB.prepare(`SELECT COUNT(*) AS n FROM respondent_feedback WHERE respondent_id = ?1`)
            .bind(row.respondent_id)
            .first<{ n: number }>()
        : Promise.resolve(null),
      row.session_id
        ? c.env.DB.prepare(
            `SELECT id, status, country, source, collected_count, turn_count, is_test, created_at,
                    last_activity_at, submission_id
               FROM chat_sessions WHERE id = ?1`,
          )
            .bind(row.session_id)
            .first<{
              id: string;
              status: string;
              country: string | null;
              source: string;
              collected_count: number;
              turn_count: number;
              is_test: number;
              created_at: number;
              last_activity_at: number;
              submission_id: string | null;
            }>()
        : Promise.resolve(null),
    ]);

    return c.json({
      ...toReport(row),
      organizationPlan: row.plan,
      formVersionId: row.form_version_id,
      respondent: row.respondent_id
        ? {
            id: row.respondent_id,
            label: row.respondent_label,
            email: row.respondent_email,
            phone: row.respondent_phone,
            firstSeenAt: row.first_seen_at === null ? null : Number(row.first_seen_at),
            lastSeenAt: row.last_seen_at === null ? null : Number(row.last_seen_at),
            reportCount: Number(reportCount?.n ?? 1),
          }
        : null,
      session: session
        ? {
            id: session.id,
            status: session.status,
            country: session.country,
            source: session.source,
            collectedCount: Number(session.collected_count),
            turnCount: Number(session.turn_count),
            isTest: Boolean(session.is_test),
            createdAt: Number(session.created_at),
            lastActivityAt: Number(session.last_activity_at),
            submissionId: session.submission_id,
          }
        : null,
    });
  },
);

// ──────────────────────────────── triage ────────────────────────────────

const TriageBody = z
  .object({
    status: z.enum(FEEDBACK_STATUSES).optional(),
    /** `null` clears the note — which is why this cannot be a `COALESCE`. */
    internalNote: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.internalNote !== undefined, {
    message: "Nothing to change",
  });

/**
 * Move a report, or write down what it turned out to be.
 *
 * Audited against `"_platform"` rather than the customer's organization. Every
 * other write in this console changes something the account owns and lands in
 * their activity log on purpose; triaging our own bug report changes nothing of
 * theirs, and filing it there would be a note about us in a record of them.
 */
feedbackRouter.patch(
  "/admin/feedback/reports/:id",
  validator("json", TriageBody),
  describeRoute({
    tags: ["admin"],
    summary: "Resolve a report, mark it spam, or attach an internal note",
    responses: {
      200: { description: "Updated", content: { "application/json": { schema: resolver(z.object({ ok: z.boolean() })) } } },
      404: { description: "Not an admin, or no such report" },
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const sets: string[] = [];
    const binds: unknown[] = [];
    const now = Date.now();

    if (body.status !== undefined) {
      sets.push("status = ?", "status_at = ?", "status_by = ?");
      binds.push(body.status, now, c.get("platformAdminEmail") ?? null);
    }
    if (body.internalNote !== undefined) {
      sets.push("internal_note = ?");
      binds.push(body.internalNote === null || body.internalNote.trim() === "" ? null : body.internalNote.trim());
    }

    const result = await c.env.DB.prepare(`UPDATE respondent_feedback SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...binds, id)
      .run();
    if ((result.meta.changes ?? 0) === 0) {
      return c.json({ error: { code: "not_found", message: "No such report" } }, 404);
    }

    await audit(c, "_platform", "admin.feedback.triaged", {
      resourceType: "feedback",
      resourceId: id,
      status: body.status ?? null,
      noted: body.internalNote !== undefined,
    });
    return c.json({ ok: true });
  },
);

// ─────────────────────── what they were looking at ───────────────────────

/**
 * The screen the respondent had open, as they had it.
 *
 * Captured in their browser and put in R2 — see `snapshot_key` on the table for
 * why it cannot be reconstructed here. Streamed straight back: the object is
 * already JSON, this route is already behind the console's guard, and parsing
 * it only to re-serialise it would be work done twice.
 *
 * Audited on read, and only reachable by opening one report. This is the one
 * place the console sees a customer's questions and a respondent's answers, and
 * it is worth being able to say afterwards who looked and when.
 */
feedbackRouter.get(
  "/admin/feedback/reports/:id/snapshot",
  describeRoute({
    tags: ["admin"],
    summary: "The conversation as it stood when the report was filed",
    responses: {
      200: { description: "Snapshot JSON" },
      404: { description: "Not an admin, no such report, or nothing was captured" },
    },
  }),
  async (c) => {
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(
      `SELECT snapshot_key, organization_id FROM respondent_feedback WHERE id = ?1`,
    )
      .bind(id)
      .first<{ snapshot_key: string | null; organization_id: string | null }>();
    if (!row?.snapshot_key) {
      return c.json({ error: { code: "not_found", message: "No snapshot was captured" } }, 404);
    }

    const object = await c.env.R2.get(row.snapshot_key);
    if (!object) return c.json({ error: { code: "not_found", message: "Snapshot has gone" } }, 404);

    await audit(c, "_platform", "admin.feedback.snapshot_read", {
      resourceType: "feedback",
      resourceId: id,
      organizationId: row.organization_id,
    });
    return new Response(object.body, { headers: { "content-type": "application/json" } });
  },
);
