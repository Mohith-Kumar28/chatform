import { displayAnswer, type Block } from "@repo/form-schema";
import type { Bindings } from "../env.js";

/**
 * The per-form aggregate, shared by the dashboard and the developer API.
 *
 * Extracted so `/v1` can serve the same numbers rather than a second
 * implementation of them, and fixed on the way: it used to enumerate blocks from
 * `forms.working_schema` — the *draft* — while the answers it counted came from
 * published versions. A question added and not yet published already showed a 0%
 * answer rate, and a published question deleted from the draft vanished from the
 * funnel entirely while its answers stayed in the totals.
 *
 * Everything here is aggregated in a fixed number of queries — nine, whatever
 * the form's length. The per-question figures used to cost two statements per
 * block plus a correlated subquery, so the Summary tab of a twenty-question form
 * was forty-odd round trips to D1; the per-question work is now three
 * `GROUP BY block_ref` queries, split by what the answers of that kind of
 * question actually are: a small set of choices, a number, or free text that
 * only wants a sample.
 */

export interface AnalyticsOptions {
  /** `chat` | `embed` | `api` | `all`. Defaults differ per surface — see callers. */
  source?: string;
  /** Test responses are excluded unless asked for. */
  includeTest?: boolean;
  /** How many days of the daily series to return. */
  days?: number;
}

export interface BlockFunnel {
  blockRef: string;
  blockType: string;
  title: string;
  answered: number;
  /** Of everyone who started, the share who answered this one (0–100). */
  answerRate: number;
  /** Points of that share lost between the previous question and this one. */
  dropOff: number;
}

export interface BlockDistribution {
  blockRef: string;
  title: string;
  type: string;
  answered: number;
  /** Choice tallies, biggest first. Labels, never option ids. */
  options: { label: string; count: number }[];
  /**
   * True when one respondent can appear in several options, so the percentages
   * are of respondents and deliberately sum past 100.
   */
  multi: boolean;
  /** Every distinct number and how often it was given, ascending. */
  values: { value: number; count: number }[];
  numericSummary: { avg: number; min: number; max: number; median: number } | null;
  /** Free text: the most recent answers, newest first. Never the whole column. */
  samples: string[];
  /** Ranking questions: mean position, 1 being first. */
  ranking: { label: string; avgRank: number }[];
  /** Matrix questions: how many picked each column, per row. */
  matrix: { rows: string[]; cols: string[]; counts: number[][] } | null;
  /** Date questions, in date order rather than by frequency. */
  timeline: { label: string; count: number }[];
}

export interface AnalyticsAggregate {
  views: number;
  starts: number;
  completed: number;
  abandoned: number;
  avgDurationMs: number;
  medianDurationMs: number;
  /** 0–100. */
  completionRate: number;
  perBlock: BlockFunnel[];
  distributions: BlockDistribution[];
  /** One entry per day, gaps filled, oldest first. */
  daily: { date: string; views: number; starts: number; completed: number }[];
  bySource: { source: string; count: number }[];
  byCountry: { country: string; count: number }[];
  byDevice: { mobile: number; desktop: number };
  /** How long finishing took, in buckets everyone reads the same way. */
  durationBuckets: { label: string; count: number }[];
}

const NUMERIC_TYPES = new Set(["rating", "nps", "opinion_scale", "number"]);
const CHOICE_TYPES = new Set(["single_select", "multi_select", "dropdown", "picture_choice", "yes_no", "legal_consent"]);
const MULTI_TYPES = new Set(["multi_select"]);
const PASSIVE_TYPES = new Set(["welcome", "statement"]);

/** Which of the three per-question queries a block's answers belong in. */
function shapeOf(type: string): "numeric" | "grouped" | "text" {
  if (NUMERIC_TYPES.has(type)) return "numeric";
  if (CHOICE_TYPES.has(type) || type === "ranking" || type === "matrix" || type === "date") return "grouped";
  return "text";
}

const DAY_MS = 86_400_000;

export async function computeAnalytics(
  env: Bindings,
  formId: string,
  options: AnalyticsOptions = {},
): Promise<AnalyticsAggregate> {
  /**
   * The published document, falling back to the draft only when nothing has been
   * published — an unpublished form's draft is the only thing its (preview)
   * answers could have come from.
   */
  const form = await env.DB.prepare(
    `SELECT COALESCE(fv.schema_json, f.working_schema) AS schema_json
       FROM forms f LEFT JOIN form_versions fv ON fv.id = f.active_version_id
      WHERE f.id = ?`,
  )
    .bind(formId)
    .first<{ schema_json: string }>();

  let blocks: Block[] = [];
  try {
    blocks = ((form ? JSON.parse(form.schema_json) : { blocks: [] }).blocks ?? []) as Block[];
  } catch {
    // A document we cannot parse yields an empty funnel rather than a 500.
  }
  const answerable = blocks.filter((b) => !PASSIVE_TYPES.has(b.type));
  const byRef = new Map(answerable.map((b) => [b.ref, b]));

  const filters: string[] = ["form_id = ?"];
  const binds: unknown[] = [formId];
  if (options.source && options.source !== "all") {
    filters.push("source = ?");
    binds.push(options.source);
  }
  if (!options.includeTest) filters.push("is_test = 0");
  const where = filters.join(" AND ");
  // The same predicate, for the queries that join answers to their response.
  const joined = where
    .replace(/\bform_id\b/g, "s.form_id")
    .replace(/\bsource\b/g, "s.source")
    .replace(/\bis_test\b/g, "s.is_test");

  const counts = await env.DB.prepare(
    `SELECT COUNT(*) AS starts,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'abandoned' THEN 1 ELSE 0 END) AS abandoned,
            AVG(duration_ms) AS avg_duration
       FROM submissions WHERE ${where}`,
  )
    .bind(...binds)
    .first<{ starts: number; completed: number | null; abandoned: number | null; avg_duration: number | null }>();

  const starts = counts?.starts ?? 0;
  const completed = counts?.completed ?? 0;

  const answeredRows = await env.DB.prepare(
    `SELECT a.block_ref, COUNT(DISTINCT a.submission_id) AS answered
       FROM submission_answers a JOIN submissions s ON s.id = a.submission_id
      WHERE ${joined}
      GROUP BY a.block_ref`,
  )
    .bind(...binds)
    .all<{ block_ref: string; answered: number }>();
  const answeredBy = new Map((answeredRows.results ?? []).map((r) => [r.block_ref, r.answered]));

  const perBlock: BlockFunnel[] = answerable.map((b, i) => {
    const answered = answeredBy.get(b.ref) ?? 0;
    // Against starts, so the rate means "of the people who began, how many got
    // this far" rather than being measured against a moving denominator.
    const answerRate = starts > 0 ? Math.round((answered / starts) * 100) : 0;
    const prev = i > 0 ? (answeredBy.get(answerable[i - 1]!.ref) ?? 0) : starts;
    const prevRate = starts > 0 ? Math.round((prev / starts) * 100) : 0;
    return {
      blockRef: b.ref,
      blockType: b.type,
      title: b.title,
      answered,
      answerRate,
      dropOff: Math.max(0, prevRate - answerRate),
    };
  });

  // ── the three per-question queries ─────────────────────────────────────────
  const groupedRefs = answerable.filter((b) => shapeOf(b.type) === "grouped").map((b) => b.ref);
  const textRefs = answerable.filter((b) => shapeOf(b.type) === "text").map((b) => b.ref);

  const grouped = groupedRefs.length
    ? await env.DB.prepare(
        `SELECT a.block_ref, a.value_json, COUNT(*) AS n
           FROM submission_answers a JOIN submissions s ON s.id = a.submission_id
          WHERE ${joined} AND a.block_ref IN (${groupedRefs.map(() => "?").join(",")})
          GROUP BY a.block_ref, a.value_json`,
      )
        .bind(...binds, ...groupedRefs)
        .all<{ block_ref: string; value_json: string; n: number }>()
    : { results: [] };

  const numeric = await env.DB.prepare(
    `SELECT a.block_ref, a.value_number AS v, COUNT(*) AS n
       FROM submission_answers a JOIN submissions s ON s.id = a.submission_id
      WHERE ${joined} AND a.value_number IS NOT NULL
      GROUP BY a.block_ref, v ORDER BY v`,
  )
    .bind(...binds)
    .all<{ block_ref: string; v: number; n: number }>();

  /**
   * Free text gets a sample, not a chart.
   *
   * Two hundred rows, newest first, is enough to show the eight most recent
   * answers to every text question on the form without reading a column that
   * has no upper bound.
   */
  const texts = textRefs.length
    ? await env.DB.prepare(
        `SELECT a.block_ref, a.value_json, a.updated_at
           FROM submission_answers a JOIN submissions s ON s.id = a.submission_id
          WHERE ${joined} AND a.block_ref IN (${textRefs.map(() => "?").join(",")})
          ORDER BY a.updated_at DESC LIMIT 200`,
      )
        .bind(...binds, ...textRefs)
        .all<{ block_ref: string; value_json: string; updated_at: number }>()
    : { results: [] };

  const distributions: BlockDistribution[] = answerable.map((b) => ({
    blockRef: b.ref,
    title: b.title,
    type: b.type,
    answered: answeredBy.get(b.ref) ?? 0,
    options: [],
    multi: MULTI_TYPES.has(b.type),
    values: [],
    numericSummary: null,
    samples: [],
    ranking: [],
    matrix: null,
    timeline: [],
  }));
  const distByRef = new Map(distributions.map((d) => [d.blockRef, d]));

  // Choices, rankings, matrices and dates, from the one grouped query.
  const tallies = new Map<string, Map<string, number>>();
  const rankSums = new Map<string, Map<string, { sum: number; n: number }>>();
  const matrixCells = new Map<string, Map<string, Map<string, number>>>();
  for (const row of grouped.results ?? []) {
    const block = byRef.get(row.block_ref);
    if (!block) continue;
    let parsed: unknown = row.value_json;
    try {
      parsed = JSON.parse(row.value_json);
    } catch {
      /* keep the raw text */
    }

    if (block.type === "ranking" && Array.isArray(parsed)) {
      // Resolved against the block's items rather than through `displayAnswer`,
      // which renders a whole ranking as "1. A, 2. B" — the right thing in a
      // transcript and the wrong thing for an axis label.
      const items = ("items" in block ? (block.items as { id: string; label: string }[]) : []) ?? [];
      const per = rankSums.get(row.block_ref) ?? new Map<string, { sum: number; n: number }>();
      parsed.forEach((item, i) => {
        const label = items.find((it) => it.id === item)?.label ?? String(item);
        const cur = per.get(label) ?? { sum: 0, n: 0 };
        per.set(label, { sum: cur.sum + (i + 1) * row.n, n: cur.n + row.n });
      });
      rankSums.set(row.block_ref, per);
      continue;
    }

    if (block.type === "matrix" && parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const per = matrixCells.get(row.block_ref) ?? new Map<string, Map<string, number>>();
      for (const [rowId, picked] of Object.entries(parsed as Record<string, unknown>)) {
        const cells = per.get(rowId) ?? new Map<string, number>();
        // A matrix row may allow several columns, and then the cell value is an
        // array; each column it names is one tick in that row.
        for (const colId of Array.isArray(picked) ? picked : [picked]) {
          const key = String(colId);
          cells.set(key, (cells.get(key) ?? 0) + row.n);
        }
        per.set(rowId, cells);
      }
      matrixCells.set(row.block_ref, per);
      continue;
    }

    // A multi-answer block is counted per option rather than per distinct
    // combination — otherwise the chart is a list of every set anyone happened
    // to pick, each with a count of one.
    const tally = tallies.get(row.block_ref) ?? new Map<string, number>();
    for (const part of Array.isArray(parsed) ? parsed : [parsed]) {
      const label = displayAnswer(block, part);
      if (!label) continue;
      tally.set(label, (tally.get(label) ?? 0) + row.n);
    }
    tallies.set(row.block_ref, tally);
  }

  for (const [ref, tally] of tallies) {
    const dist = distByRef.get(ref);
    const block = byRef.get(ref);
    if (!dist || !block) continue;
    const entries = [...tally.entries()];
    if (block.type === "date") {
      // By the day, in date order: "2026-01-31 at 14:30" and "2026-01-31 at
      // 09:00" are the same point on a timeline.
      const byDay = new Map<string, number>();
      for (const [label, count] of entries) {
        const day = label.split(" at ")[0] ?? label;
        byDay.set(day, (byDay.get(day) ?? 0) + count);
      }
      dist.timeline = [...byDay.entries()]
        .sort((a, z) => a[0].localeCompare(z[0]))
        .map(([label, count]) => ({ label, count }));
    }
    /**
     * Options keep the order the author wrote them in.
     *
     * A chart re-sorted by popularity on every refresh cannot be compared with
     * the one you looked at yesterday, and for a scale-like set ("Daily",
     * "Weekly", "Monthly") frequency order destroys the only order that means
     * anything. Sets with no authored order — free-form values — fall back to
     * biggest first.
     */
    const authored = "options" in block && Array.isArray(block.options)
      ? (block.options as { label: string }[]).map((o) => o.label)
      : block.type === "yes_no"
        ? [("yesLabel" in block && block.yesLabel) || "Yes", ("noLabel" in block && block.noLabel) || "No"]
        : [];
    const rank = new Map(authored.map((label, i) => [label, i]));
    dist.options = entries
      .sort((a, z) => {
        const ra = rank.get(a[0]);
        const rz = rank.get(z[0]);
        if (ra !== undefined && rz !== undefined) return ra - rz;
        if (ra !== undefined) return -1;
        if (rz !== undefined) return 1;
        return z[1] - a[1];
      })
      .slice(0, 20)
      .map(([label, count]) => ({ label, count }));
  }

  for (const [ref, per] of rankSums) {
    const dist = distByRef.get(ref);
    if (!dist) continue;
    dist.ranking = [...per.entries()]
      .map(([label, { sum, n }]) => ({ label, avgRank: Math.round((sum / Math.max(1, n)) * 10) / 10 }))
      .sort((a, z) => a.avgRank - z.avgRank);
  }

  for (const [ref, per] of matrixCells) {
    const dist = distByRef.get(ref);
    const block = byRef.get(ref);
    if (!dist || !block) continue;
    const rowLabels = ("rows" in block ? (block.rows as { id: string; label: string }[]) : []) ?? [];
    const colLabels = ("columns" in block ? (block.columns as { id: string; label: string }[]) : []) ?? [];
    const rowIds = rowLabels.length ? rowLabels.map((r) => r.id) : [...per.keys()];
    const colIds = colLabels.length
      ? colLabels.map((c) => c.id)
      : [...new Set([...per.values()].flatMap((m) => [...m.keys()]))];
    dist.matrix = {
      rows: rowIds.map((id) => rowLabels.find((r) => r.id === id)?.label ?? id),
      cols: colIds.map((id) => colLabels.find((c) => c.id === id)?.label ?? id),
      counts: rowIds.map((rid) => colIds.map((cid) => per.get(rid)?.get(cid) ?? 0)),
    };
  }

  // Numbers, ratings and scales.
  const numericBy = new Map<string, { value: number; count: number }[]>();
  for (const row of numeric.results ?? []) {
    const list = numericBy.get(row.block_ref) ?? [];
    list.push({ value: row.v, count: row.n });
    numericBy.set(row.block_ref, list);
  }
  for (const [ref, values] of numericBy) {
    const dist = distByRef.get(ref);
    if (!dist || !NUMERIC_TYPES.has(dist.type)) continue;
    dist.values = values;
    const total = values.reduce((n, v) => n + v.count, 0);
    if (total === 0) continue;
    const sum = values.reduce((n, v) => n + v.value * v.count, 0);
    let seen = 0;
    let median = values[0]!.value;
    for (const v of values) {
      seen += v.count;
      if (seen >= total / 2) {
        median = v.value;
        break;
      }
    }
    dist.numericSummary = {
      avg: Math.round((sum / total) * 10) / 10,
      min: values[0]!.value,
      max: values[values.length - 1]!.value,
      median,
    };
  }

  for (const row of texts.results ?? []) {
    const dist = distByRef.get(row.block_ref);
    const block = byRef.get(row.block_ref);
    if (!dist || !block || dist.samples.length >= 8) continue;
    let parsed: unknown = row.value_json;
    try {
      parsed = JSON.parse(row.value_json);
    } catch {
      /* keep the raw text */
    }
    const label = displayAnswer(block, parsed);
    if (label) dist.samples.push(label);
  }

  // ── how the form did over time, and who filled it in ───────────────────────
  const days = Math.min(Math.max(options.days ?? 30, 7), 90);
  const since = Date.now() - days * DAY_MS;
  const sinceDate = new Date(since).toISOString().slice(0, 10);

  const dailyRows = await env.DB.prepare(
    `SELECT strftime('%Y-%m-%d', started_at / 1000, 'unixepoch') AS d,
            COUNT(*) AS starts,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM submissions WHERE ${where} AND started_at >= ?
      GROUP BY d ORDER BY d`,
  )
    .bind(...binds, since)
    .all<{ d: string; starts: number; completed: number | null }>();

  const viewRows = await env.DB.prepare(
    `SELECT date, views FROM analytics_rollup_daily WHERE form_id = ? AND date >= ? ORDER BY date`,
  )
    .bind(formId, sinceDate)
    .all<{ date: string; views: number }>();

  const startsByDay = new Map((dailyRows.results ?? []).map((r) => [r.d, r]));
  const viewsByDay = new Map((viewRows.results ?? []).map((r) => [r.date, r.views]));
  const daily: AnalyticsAggregate["daily"] = [];
  // Gaps filled, because a line drawn straight from Monday to Friday says the
  // form was ticking over all week.
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
    const row = startsByDay.get(date);
    daily.push({
      date,
      views: viewsByDay.get(date) ?? 0,
      starts: row?.starts ?? 0,
      completed: row?.completed ?? 0,
    });
  }

  const sourceRows = await env.DB.prepare(
    `SELECT source, COUNT(*) AS n FROM submissions WHERE ${where} GROUP BY source ORDER BY n DESC`,
  )
    .bind(...binds)
    .all<{ source: string; n: number }>();

  const countryRows = await env.DB.prepare(
    `SELECT json_extract(meta, '$.country') AS country, COUNT(*) AS n
       FROM submissions WHERE ${where} AND json_extract(meta, '$.country') IS NOT NULL
      GROUP BY country ORDER BY n DESC LIMIT 8`,
  )
    .bind(...binds)
    .all<{ country: string; n: number }>();

  /**
   * Phone or laptop, from the user agent already stored on the response.
   *
   * `Mobi` is the token every mobile browser carries and no desktop one does,
   * which is as much as a substring match can honestly tell you — so the answer
   * is two buckets, not a device table pretending to know more.
   */
  const deviceRow = await env.DB.prepare(
    `SELECT SUM(CASE WHEN json_extract(meta, '$.userAgent') LIKE '%Mobi%' THEN 1 ELSE 0 END) AS mobile,
            COUNT(*) AS total
       FROM submissions WHERE ${where} AND json_extract(meta, '$.userAgent') IS NOT NULL`,
  )
    .bind(...binds)
    .first<{ mobile: number | null; total: number | null }>();

  const bucketRow = await env.DB.prepare(
    `SELECT SUM(CASE WHEN duration_ms < 30000 THEN 1 ELSE 0 END) AS b1,
            SUM(CASE WHEN duration_ms >= 30000 AND duration_ms < 60000 THEN 1 ELSE 0 END) AS b2,
            SUM(CASE WHEN duration_ms >= 60000 AND duration_ms < 180000 THEN 1 ELSE 0 END) AS b3,
            SUM(CASE WHEN duration_ms >= 180000 AND duration_ms < 600000 THEN 1 ELSE 0 END) AS b4,
            SUM(CASE WHEN duration_ms >= 600000 THEN 1 ELSE 0 END) AS b5
       FROM submissions WHERE ${where} AND status = 'completed' AND duration_ms IS NOT NULL`,
  )
    .bind(...binds)
    .first<{ b1: number | null; b2: number | null; b3: number | null; b4: number | null; b5: number | null }>();

  /**
   * The median, by asking for the middle row.
   *
   * SQLite has no percentile function, and the average alone is a poor summary
   * of how long a form takes: one person who left the tab open for an hour
   * moves it by minutes.
   */
  const medianRow =
    completed > 0
      ? await env.DB.prepare(
          `SELECT duration_ms FROM submissions
            WHERE ${where} AND status = 'completed' AND duration_ms IS NOT NULL
            ORDER BY duration_ms LIMIT 1 OFFSET ?`,
        )
          .bind(...binds, Math.floor(Math.max(0, completed - 1) / 2))
          .first<{ duration_ms: number }>()
      : null;

  const views = await env.DB.prepare(`SELECT SUM(views) AS v FROM analytics_rollup_daily WHERE form_id = ?`)
    .bind(formId)
    .first<{ v: number | null }>();

  return {
    views: views?.v ?? starts,
    starts,
    completed,
    abandoned: counts?.abandoned ?? 0,
    avgDurationMs: Math.round(counts?.avg_duration ?? 0),
    medianDurationMs: medianRow?.duration_ms ?? 0,
    completionRate: starts > 0 ? Math.round((completed / starts) * 100) : 0,
    perBlock,
    distributions,
    daily,
    bySource: (sourceRows.results ?? []).map((r) => ({ source: r.source, count: r.n })),
    byCountry: (countryRows.results ?? []).map((r) => ({ country: r.country, count: r.n })),
    byDevice: {
      mobile: deviceRow?.mobile ?? 0,
      desktop: Math.max(0, (deviceRow?.total ?? 0) - (deviceRow?.mobile ?? 0)),
    },
    durationBuckets: [
      { label: "Under 30s", count: bucketRow?.b1 ?? 0 },
      { label: "30s–1m", count: bucketRow?.b2 ?? 0 },
      { label: "1–3m", count: bucketRow?.b3 ?? 0 },
      { label: "3–10m", count: bucketRow?.b4 ?? 0 },
      { label: "Over 10m", count: bucketRow?.b5 ?? 0 },
    ],
  };
}
