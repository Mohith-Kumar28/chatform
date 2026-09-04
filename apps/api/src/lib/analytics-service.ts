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
 */

export interface AnalyticsOptions {
  /** `chat` | `embed` | `api` | `all`. Defaults differ per surface — see callers. */
  source?: string;
  /** Test responses are excluded unless asked for. */
  includeTest?: boolean;
}

export interface BlockFunnel {
  blockRef: string;
  blockType: string;
  title: string;
  answered: number;
  answerRate: number;
}

export interface BlockDistribution {
  blockRef: string;
  title: string;
  type: string;
  answered: number;
  numericSummary: { avg: number; min: number; max: number } | null;
  options: { label: string; count: number }[];
}

export interface AnalyticsAggregate {
  views: number;
  starts: number;
  completed: number;
  abandoned: number;
  avgDurationMs: number;
  completionRate: number;
  perBlock: BlockFunnel[];
  distributions: BlockDistribution[];
}

const NUMERIC_TYPES = new Set(["rating", "nps", "opinion_scale", "number"]);
const PASSIVE_TYPES = new Set(["welcome", "statement"]);

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

  const filters: string[] = ["form_id = ?"];
  const binds: unknown[] = [formId];
  if (options.source && options.source !== "all") {
    filters.push("source = ?");
    binds.push(options.source);
  }
  if (!options.includeTest) filters.push("is_test = 0");
  const where = filters.join(" AND ");

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

  /**
   * One query for every block, not one per block.
   *
   * This used to run a statement per question plus a correlated subquery for the
   * total — so a twenty-question form cost forty round trips to render one
   * chart.
   */
  const answeredRows = await env.DB.prepare(
    `SELECT a.block_ref, COUNT(DISTINCT a.submission_id) AS answered
       FROM submission_answers a JOIN submissions s ON s.id = a.submission_id
      WHERE ${where.replace(/\bform_id\b/g, "s.form_id").replace(/\bsource\b/g, "s.source").replace(/\bis_test\b/g, "s.is_test")}
      GROUP BY a.block_ref`,
  )
    .bind(...binds)
    .all<{ block_ref: string; answered: number }>();
  const answeredBy = new Map((answeredRows.results ?? []).map((r) => [r.block_ref, r.answered]));

  const perBlock: BlockFunnel[] = answerable.map((b) => {
    const answered = answeredBy.get(b.ref) ?? 0;
    return {
      blockRef: b.ref,
      blockType: b.type,
      title: b.title,
      answered,
      // Against starts, so the rate means "of the people who began, how many got
      // this far" rather than being measured against a moving denominator.
      answerRate: starts > 0 ? Math.round((answered / starts) * 100) : 0,
    };
  });

  const distributions: BlockDistribution[] = [];
  for (const b of answerable) {
    const answered = answeredBy.get(b.ref) ?? 0;
    let numericSummary: BlockDistribution["numericSummary"] = null;
    const options_: { label: string; count: number }[] = [];

    if (NUMERIC_TYPES.has(b.type)) {
      const agg = await env.DB.prepare(
        `SELECT AVG(a.value_number) AS avg, MIN(a.value_number) AS min, MAX(a.value_number) AS max
           FROM submission_answers a JOIN submissions s ON s.id = a.submission_id
          WHERE s.form_id = ? AND a.block_ref = ? AND a.value_number IS NOT NULL
                ${options.includeTest ? "" : "AND s.is_test = 0"}`,
      )
        .bind(formId, b.ref)
        .first<{ avg: number | null; min: number | null; max: number | null }>();
      if (agg?.avg != null) {
        numericSummary = { avg: Math.round(agg.avg * 10) / 10, min: agg.min ?? 0, max: agg.max ?? 0 };
      }
    } else {
      const rows = await env.DB.prepare(
        `SELECT a.value_json, COUNT(*) AS n
           FROM submission_answers a JOIN submissions s ON s.id = a.submission_id
          WHERE s.form_id = ? AND a.block_ref = ?
                ${options.includeTest ? "" : "AND s.is_test = 0"}
          GROUP BY a.value_json ORDER BY n DESC LIMIT 12`,
      )
        .bind(formId, b.ref)
        .all<{ value_json: string; n: number }>();

      /**
       * Bars are labelled with the option, not its id, and a multi-answer block
       * is counted per option rather than per distinct combination — otherwise
       * a multi-select's chart is a list of every set anyone happened to pick,
       * each with a count of one.
       */
      const tally = new Map<string, number>();
      for (const row of rows.results ?? []) {
        let parsed: unknown = row.value_json;
        try {
          parsed = JSON.parse(row.value_json);
        } catch {
          /* keep the raw text */
        }
        for (const part of Array.isArray(parsed) ? parsed : [parsed]) {
          const label = displayAnswer(b, part);
          tally.set(label, (tally.get(label) ?? 0) + row.n);
        }
      }
      for (const [label, count] of [...tally.entries()].sort((a, z) => z[1] - a[1]).slice(0, 12)) {
        options_.push({ label, count });
      }
    }

    distributions.push({
      blockRef: b.ref,
      title: b.title,
      type: b.type,
      answered,
      numericSummary,
      options: options_,
    });
  }

  const views = await env.DB.prepare(`SELECT SUM(views) AS v FROM analytics_rollup_daily WHERE form_id = ?`)
    .bind(formId)
    .first<{ v: number | null }>();

  const completed = counts?.completed ?? 0;
  return {
    views: views?.v ?? starts,
    starts,
    completed,
    abandoned: counts?.abandoned ?? 0,
    avgDurationMs: Math.round(counts?.avg_duration ?? 0),
    completionRate: starts > 0 ? Math.round((completed / starts) * 100) : 0,
    perBlock,
    distributions,
  };
}
