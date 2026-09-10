import type { Bindings } from "../env.js";

/**
 * The platform's own counting, done on the cron so the console can read rows.
 *
 * Every other aggregate in this codebase is per-form and per-org, which keeps it
 * small: `computeAnalytics` scans one form's submissions behind an index. The
 * super-admin console asks the opposite question — how is *everything* doing — and
 * a live `GROUP BY` across every tenant is a table scan that grows with the
 * business. D1 has a per-query budget, so that query is fine on the day it is
 * written and gone by the time it matters.
 *
 * So counting happens here, on a schedule, into `platform_metrics_daily`.
 *
 * Two jobs with very different costs:
 *
 *   rollupPlatformDaily   every tick, recomputes TODAY only. A handful of grouped
 *                         queries over indexed timestamp columns, bounded by one
 *                         day of traffic no matter how long the product has run.
 *
 *   rollupFormStructure   once a day, walks `forms` in batches parsing JSON
 *                         documents. Unbounded work by nature, so it is spread
 *                         across ticks behind a cursor rather than attempted in
 *                         one invocation.
 *
 * Conventions that are not optional here. Getting any of them wrong produces
 * numbers that look plausible and are wrong, which is worse than an error:
 *
 *   - `is_test = 0` on submissions and sessions. Test rows are real rows that the
 *     rest of the product already excludes from metering and analytics.
 *   - `deleted_at IS NULL` on forms.
 *   - Timestamps are epoch milliseconds, so day bucketing is
 *     `strftime('%Y-%m-%d', col / 1000, 'unixepoch')` — the same expression
 *     `analytics-service.ts` uses.
 *   - An org's plan is `subscriptions.plan_id` of the top-ranked row, ranked the
 *     way `loadSubscription()` in `entitlements.ts` ranks it, else 'free'. There
 *     must not be a second definition of what plan somebody is on.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The periods the console can be asked for, and the only list of them.
 *
 * Here rather than beside the routes because this module is the one that has to
 * delete a cache key per range, and that loop was previously a hardcoded array
 * a few hundred lines below — so a range added to the routes' own copy would
 * have been served a stale overview for five minutes after every rollup, which
 * is the hardest kind of bug to see: the number is only wrong for a while.
 * Routes import it back through `routes/admin/shared.ts`.
 *
 * `1d` is today, compared against yesterday.
 */
export const RANGES = { "1d": 1, "7d": 7, "30d": 30, "90d": 90, "365d": 365 } as const;
export type RangeKey = keyof typeof RANGES;

/** `YYYY-MM-DD` in UTC, the key every metric row is bucketed by. */
export function utcDay(at: number | Date = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

interface MetricRow {
  metric: string;
  dimension: string;
  value: number;
}

/**
 * The plan-ranking sub-select, written once.
 *
 * `active` beats `trialing` beats everything else, newest first — and no status
 * filter, because `past_due` inside its grace window is still a paying customer
 * and dropping it would report a churn that has not happened.
 */
const PLAN_OF_ORG = `
  SELECT s.plan_id FROM subscriptions s
   WHERE s.organization_id = o.id
   ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 ELSE 2 END, s.created_at DESC
   LIMIT 1`;

/**
 * Write a day's metrics.
 *
 * Batched rather than looped: D1 charges per round trip, and a day's rollup is
 * thirty-odd small upserts that have no reason to be thirty-odd requests. The
 * upsert is what makes the job safe to run every five minutes — the last run of
 * the day is the one that counts, and a re-run after a deploy is a no-op.
 */
async function writeMetrics(env: Bindings, date: string, rows: MetricRow[]): Promise<void> {
  if (rows.length === 0) return;
  const stmt = env.DB.prepare(
    `INSERT INTO platform_metrics_daily (date, metric, dimension, value)
     VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (date, metric, dimension) DO UPDATE SET value = excluded.value`,
  );
  // 50 at a time: D1 caps the statements in one batch, and a day of breakouts
  // (one row per block type, per model, per plan) runs to more than a handful.
  for (let i = 0; i < rows.length; i += 50) {
    await env.DB.batch(rows.slice(i, i + 50).map((r) => stmt.bind(date, r.metric, r.dimension, r.value)));
  }
}

/** `SELECT COUNT(*)` shaped queries, run for one UTC day. */
async function countForDay(
  env: Bindings,
  sql: string,
  from: number,
  to: number,
): Promise<{ dimension: string; n: number }[]> {
  const res = await env.DB.prepare(sql).bind(from, to).all<{ dimension: string | null; n: number }>();
  return (res.results ?? []).map((r) => ({ dimension: r.dimension ?? "", n: r.n }));
}

/**
 * Recompute one day's platform counters.
 *
 * Defaults to today, which is what the cron wants. Takes a date so the backfill
 * script can replay history through exactly the same code — a backfill that
 * counts differently from the live job is a backfill that produces a step change
 * in every chart on the day it stops.
 */
export async function rollupPlatformDaily(env: Bindings, date = utcDay()): Promise<number> {
  const from = Date.parse(`${date}T00:00:00.000Z`);
  const to = from + 24 * 60 * 60 * 1000;
  const rows: MetricRow[] = [];
  const push = (metric: string, entries: { dimension: string; n: number }[]) => {
    for (const e of entries) rows.push({ metric, dimension: e.dimension, value: e.n });
  };
  const total = (metric: string, n: number) => rows.push({ metric, dimension: "", value: n });

  // ── Acquisition ──────────────────────────────────────────────────────────
  push(
    "signups",
    await countForDay(
      env,
      `SELECT '' AS dimension, COUNT(*) AS n FROM users WHERE created_at >= ?1 AND created_at < ?2`,
      from,
      to,
    ),
  );
  /**
   * Signups split by how they got in.
   *
   * `accounts.provider_id` is 'google' for the social flow and 'credential' for
   * email — and a user can have both, so this counts the account rows rather
   * than the users and the two series are read as "sign-in methods created",
   * not as a partition of `signups`.
   */
  push(
    "signups_by_provider",
    await countForDay(
      env,
      `SELECT a.provider_id AS dimension, COUNT(*) AS n
         FROM accounts a
        WHERE a.created_at >= ?1 AND a.created_at < ?2
        GROUP BY a.provider_id`,
      from,
      to,
    ),
  );
  push(
    "orgs_created",
    await countForDay(
      env,
      `SELECT '' AS dimension, COUNT(*) AS n FROM organizations WHERE created_at >= ?1 AND created_at < ?2`,
      from,
      to,
    ),
  );

  // ── What they build ──────────────────────────────────────────────────────
  push(
    "forms_created",
    await countForDay(
      env,
      `SELECT '' AS dimension, COUNT(*) AS n
         FROM forms WHERE created_at >= ?1 AND created_at < ?2 AND deleted_at IS NULL`,
      from,
      to,
    ),
  );
  push(
    "forms_published",
    await countForDay(
      env,
      `SELECT '' AS dimension, COUNT(*) AS n
         FROM form_versions WHERE published_at >= ?1 AND published_at < ?2`,
      from,
      to,
    ),
  );
  /**
   * How the form got made: the builder, the API, the AI generator, a template.
   *
   * `form_activity.source` is already written for every change; the 'created'
   * kind is the one that answers "did anybody use the AI".
   */
  push(
    "forms_created_by_source",
    await countForDay(
      env,
      `SELECT source AS dimension, COUNT(*) AS n
         FROM form_activity
        WHERE kind = 'created' AND created_at >= ?1 AND created_at < ?2
        GROUP BY source`,
      from,
      to,
    ),
  );

  // ── What their respondents do ────────────────────────────────────────────
  push(
    "sessions_started",
    await countForDay(
      env,
      `SELECT '' AS dimension, COUNT(*) AS n
         FROM chat_sessions WHERE created_at >= ?1 AND created_at < ?2 AND is_test = 0`,
      from,
      to,
    ),
  );
  push(
    "responses_started",
    await countForDay(
      env,
      `SELECT '' AS dimension, COUNT(*) AS n
         FROM submissions WHERE started_at >= ?1 AND started_at < ?2 AND is_test = 0`,
      from,
      to,
    ),
  );
  push(
    "responses_completed",
    await countForDay(
      env,
      `SELECT '' AS dimension, COUNT(*) AS n
         FROM submissions WHERE completed_at >= ?1 AND completed_at < ?2 AND is_test = 0 AND status = 'completed'`,
      from,
      to,
    ),
  );
  /**
   * Started that day and still unfinished when the day ended.
   *
   * The same union the results table calls "partial" — everything that is not
   * `completed` — so the console and the customer-facing count cannot disagree
   * about what a partial is.
   *
   * Bucketed by `started_at`, not by when it was abandoned, because nothing
   * records that moment. Today's figure therefore falls as people finish, and
   * the last run before midnight is the one that sticks: a past day means
   * "started then, unfinished by the end of it". A follow-up that brings
   * somebody back on Thursday does not retract Tuesday's partial, and should
   * not — Tuesday is still the day they walked away.
   */
  push(
    "responses_partial",
    await countForDay(
      env,
      `SELECT '' AS dimension, COUNT(*) AS n
         FROM submissions
        WHERE started_at >= ?1 AND started_at < ?2 AND is_test = 0 AND status != 'completed'`,
      from,
      to,
    ),
  );
  push(
    "responses_by_source",
    await countForDay(
      env,
      `SELECT source AS dimension, COUNT(*) AS n
         FROM submissions
        WHERE started_at >= ?1 AND started_at < ?2 AND is_test = 0
        GROUP BY source`,
      from,
      to,
    ),
  );
  /**
   * Views are the one number already rolled up per form, by the hosted page's
   * view ping. Summing that table is cheaper and more accurate than trying to
   * recount it, and it is the only place a *view* (as opposed to a start) is
   * recorded at all.
   */
  const views = await env.DB.prepare(
    `SELECT COALESCE(SUM(views), 0) AS n FROM analytics_rollup_daily WHERE date = ?`,
  )
    .bind(date)
    .first<{ n: number }>();
  total("views", views?.n ?? 0);

  /**
   * Active organizations — the retention denominator.
   *
   * "Active" is doing something that costs us or means something: collecting a
   * response, or editing a form. Signing in is not activity; a person who opens
   * the dashboard, sees nothing and leaves has not used the product.
   */
  push(
    "active_orgs",
    await countForDay(
      env,
      `SELECT '' AS dimension, COUNT(*) AS n FROM (
         SELECT organization_id FROM submissions
          WHERE started_at >= ?1 AND started_at < ?2 AND is_test = 0
          UNION
         SELECT organization_id FROM form_activity
          WHERE created_at >= ?1 AND created_at < ?2
       )`,
      from,
      to,
    ),
  );

  // ── Cost ─────────────────────────────────────────────────────────────────
  const ai = await env.DB.prepare(
    `SELECT model AS dimension, kind,
            COUNT(*) AS calls,
            COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS tokens,
            COALESCE(SUM(cost_usd_micro), 0) AS cost,
            COALESCE(SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END), 0) AS errors
       FROM ai_generations
      WHERE created_at >= ?1 AND created_at < ?2
      GROUP BY model, kind`,
  )
    .bind(from, to)
    .all<{ dimension: string; kind: string; calls: number; tokens: number; cost: number; errors: number }>();
  let aiTokens = 0;
  let aiCost = 0;
  let aiCalls = 0;
  let aiErrors = 0;
  for (const r of ai.results ?? []) {
    aiTokens += r.tokens;
    aiCost += r.cost;
    aiCalls += r.calls;
    aiErrors += r.errors;
    rows.push({ metric: "ai_tokens_by_model", dimension: r.dimension, value: r.tokens });
    rows.push({ metric: "ai_cost_micro_by_model", dimension: r.dimension, value: r.cost });
    rows.push({ metric: "ai_calls_by_kind", dimension: r.kind, value: r.calls });
  }
  total("ai_tokens", aiTokens);
  total("ai_cost_micro", aiCost);
  total("ai_calls", aiCalls);
  total("ai_errors", aiErrors);

  // ── Money ────────────────────────────────────────────────────────────────
  const paid = await env.DB.prepare(
    `SELECT status AS dimension, COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS cents
       FROM payments
      WHERE COALESCE(paid_at, created_at) >= ?1 AND COALESCE(paid_at, created_at) < ?2
      GROUP BY status`,
  )
    .bind(from, to)
    .all<{ dimension: string; n: number; cents: number }>();
  for (const r of paid.results ?? []) {
    rows.push({ metric: "payments_by_status", dimension: r.dimension, value: r.n });
    rows.push({ metric: "payment_cents_by_status", dimension: r.dimension, value: r.cents });
  }

  /**
   * MRR and the plan mix, as they stand right now — and only for today.
   *
   * These are snapshots, not derivations: there is no MRR history table, and
   * `subscriptions` is mutated in place by the billing webhook, so what an
   * account was paying on an arbitrary past date is not recoverable from it.
   * Writing today's truth once a day builds that history the honest way, from
   * today forward.
   *
   * The backfill must therefore not write them. Stamping today's MRR onto every
   * past date would draw a revenue line that is flat all the way back to the
   * first signup — a chart that says the business has never grown, produced
   * entirely by the code that drew it.
   */
  if (date !== utcDay()) {
    await writeMetrics(env, date, rows);
    return rows.length;
  }

  const mix = await env.DB.prepare(
    `SELECT COALESCE((${PLAN_OF_ORG}), 'free') AS dimension, COUNT(*) AS n
       FROM organizations o
      GROUP BY dimension`,
  ).all<{ dimension: string; n: number }>();
  for (const r of mix.results ?? []) rows.push({ metric: "orgs_by_plan", dimension: r.dimension, value: r.n });

  /**
   * Monthly recurring revenue, normalised to a month.
   *
   * A yearly subscription is not twelve times a monthly one and must not be
   * counted as a month's revenue — `price_yearly_cents / 12` is what it
   * contributes. Seat add-ons above the plan's included count are real revenue
   * and are added at `seat_price_cents` each.
   */
  const mrr = await env.DB.prepare(
    `SELECT COALESCE(SUM(
              CASE WHEN s.cycle = 'yearly' THEN p.price_yearly_cents / 12.0 ELSE p.price_monthly_cents END
              + MAX(0, s.seats - COALESCE(json_extract(p.limits_json, '$.seats'), s.seats)) * p.seat_price_cents
            ), 0) AS cents,
            COUNT(*) AS n
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE s.status IN ('active', 'trialing')
        AND s.dodo_subscription_id NOT LIKE 'internal_manual_%'`,
  ).first<{ cents: number; n: number }>();
  total("mrr_cents", Math.round(mrr?.cents ?? 0));
  total("paying_orgs", mrr?.n ?? 0);

  await writeMetrics(env, date, rows);
  await invalidateOverview(env);
  return rows.length;
}

/**
 * Drop the console's cached payloads after the numbers underneath them move.
 *
 * The overview is cached in KV for five minutes, which is right — it is eight
 * queries deep and nobody needs it recomputed per keystroke. What is not right
 * is letting that cache outlive the data: without this, a rollup lands and the
 * console keeps serving the previous answer for up to five more minutes, which
 * reads as "the dashboard is broken" rather than "the dashboard is cached". It
 * is worst exactly when it matters most — the first load after deploying, when
 * the cached answer is all zeros.
 */
async function invalidateOverview(env: Bindings): Promise<void> {
  await Promise.all(
    Object.keys(RANGES).map((range) => env.KV_CONFIG.delete(`admin:overview:${range}`).catch(() => {})),
  );
}

/**
 * Fill in history, a few days per tick.
 *
 * The console needs a year of chart before it is worth opening, and the daily
 * job only ever counts today — so on the day this ships every series is a single
 * point. The obvious fix is a one-off script, and it is the wrong one: a
 * backfill that counts in its own SQL is a backfill that disagrees with the live
 * job, and the disagreement shows up as a step change on the day the two meet,
 * in a chart nobody will think to distrust.
 *
 * So history is filled by the same function that fills today, from the same
 * cron, a few days at a time. It also self-heals: a day the worker was down for
 * has no rows, so it is simply picked up on a later tick.
 *
 * Bounded by the first signup — there is nothing to count before the first user
 * existed, and walking back to 1970 would rewrite the same zeros forever.
 */
export async function backfillPlatformDaily(env: Bindings, maxDays = 4): Promise<number> {
  const first = await env.DB.prepare(`SELECT MIN(created_at) AS t FROM users`).first<{ t: number | null }>();
  if (!first?.t) return 0;

  const filled = await env.DB.prepare(
    `SELECT DISTINCT date FROM platform_metrics_daily WHERE date >= ?`,
  )
    .bind(utcDay(first.t))
    .all<{ date: string }>();
  const have = new Set((filled.results ?? []).map((r) => r.date));

  // Oldest first, so the chart grows leftward from real data rather than filling
  // in at random and looking like an outage that came and went.
  const today = utcDay();
  let done = 0;
  for (let at = Date.parse(`${utcDay(first.t)}T00:00:00.000Z`); done < maxDays; at += DAY_MS) {
    const day = utcDay(at);
    if (day >= today) break;
    if (have.has(day)) continue;
    await rollupPlatformDaily(env, day);
    done++;
  }
  return done;
}

// ───────────────────────────── form structure ─────────────────────────────

/** The last organization whose forms have been counted, this pass. */
const CURSOR_KEY = "rollup:forms:cursor";
/** The day whose walk is in progress, so a finished day is not restarted. */
const CURSOR_DAY_KEY = "rollup:forms:day";
/** When the last full pass finished, so the console can date what it is showing. */
export const FORM_ROLLUP_COMPLETED_KEY = "rollup:forms:completed_at";

interface DocBlock {
  type?: unknown;
  title?: unknown;
}

/**
 * "What's your email?" and "what's your  email" are the same question.
 *
 * Lowercased, whitespace collapsed, trailing punctuation dropped. Not stemmed and
 * not fuzzy — a near-miss that merges two genuinely different questions is worse
 * than two rows a human can read as one.
 */
function normaliseTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[?!.:,;]+$/g, "")
    .trim();
}

const SIZE_BUCKETS: [max: number, label: string][] = [
  [3, "1-3"],
  [7, "4-7"],
  [15, "8-15"],
  [30, "16-30"],
  [Infinity, "31+"],
];
const LOGIC_BUCKETS: [max: number, label: string][] = [
  [0, "none"],
  [3, "1-3"],
  [10, "4-10"],
  [Infinity, "11+"],
];

function bucketOf(buckets: [number, string][], n: number): string {
  return buckets.find(([max]) => n <= max)![1];
}

function tally(map: Map<string, number>, key: string, n = 1): void {
  map.set(key, (map.get(key) ?? 0) + n);
}

/**
 * Walk the next organizations' forms, tallying what they are made of.
 *
 * Returns false while there is more to do, true when the day's pass is complete.
 * The caller runs it once per cron tick, so a large account base is counted over
 * a series of ticks rather than in one invocation that would exceed the CPU limit.
 *
 * Paged **by organization, not by form**, and that is the whole reason the cursor
 * is an org id. `org_count` — how many separate accounts ask a given question — is
 * the number that makes it safe to read this table as a product signal rather than
 * as a peek at one customer's form. Counting it correctly means seeing all of an
 * org's forms together, because an org split across two batches would be counted
 * twice and every "asked by N accounts" figure would be inflated.
 *
 * Aggregates only. Block types, sizes and question *text* — never an answer, never
 * a respondent, never anything a person filling in a form typed.
 */
export async function rollupFormStructure(env: Bindings, batchSize = 300): Promise<boolean> {
  const today = utcDay();
  const day = await env.KV_CONFIG.get(CURSOR_DAY_KEY);
  if (day === today && (await env.KV_CONFIG.get(CURSOR_KEY)) === "done") return true;
  if (day !== today) {
    await env.KV_CONFIG.put(CURSOR_DAY_KEY, today);
    await env.KV_CONFIG.put(CURSOR_KEY, "");
    // A fresh pass owns the day's rows outright; yesterday's counts must not be
    // added to today's. The table is therefore incomplete while a pass runs,
    // which is why `FORM_ROLLUP_COMPLETED_KEY` exists — the console dates what
    // it is showing rather than quietly rendering a half-built total.
    await env.DB.prepare(`DELETE FROM platform_question_stats`).run();
    await env.DB.prepare(
      `DELETE FROM platform_metrics_daily WHERE date = ? AND metric IN ('block_types', 'form_sizes', 'form_logic')`,
    )
      .bind(today)
      .run();
  }

  const after = (await env.KV_CONFIG.get(CURSOR_KEY)) ?? "";
  /**
   * One extra row beyond the batch, to see whether the last organization is
   * complete. Ordering by `(organization_id, id)` is what makes that knowable.
   */
  const forms = await env.DB.prepare(
    `SELECT f.id, f.organization_id, COALESCE(fv.schema_json, f.working_schema) AS doc
       FROM forms f
       LEFT JOIN form_versions fv ON fv.id = f.active_version_id
      WHERE f.deleted_at IS NULL AND f.organization_id > ?
      ORDER BY f.organization_id, f.id
      LIMIT ?`,
  )
    .bind(after, batchSize + 1)
    .all<{ id: string; organization_id: string; doc: string }>();

  let batch = forms.results ?? [];
  if (batch.length === 0) {
    await env.KV_CONFIG.put(CURSOR_KEY, "done");
    await env.KV_CONFIG.put(FORM_ROLLUP_COMPLETED_KEY, String(Date.now()));
    return true;
  }

  const done = batch.length <= batchSize;
  if (!done) {
    /**
     * Drop the trailing organization, which the limit may have cut in half, and
     * resume from the last one seen whole. When a single organization is larger
     * than the batch there is nothing to drop back to — take it entire, because
     * counting half of it is the one outcome that produces wrong numbers.
     */
    const lastOrg = batch[batch.length - 1]!.organization_id;
    const trimmed = batch.filter((r) => r.organization_id !== lastOrg);
    batch = trimmed.length > 0 ? trimmed : batch;
  }

  const blockTypes = new Map<string, number>();
  const sizes = new Map<string, number>();
  const logic = new Map<string, number>();
  /** norm → { sample, type, forms, orgs }. Orgs are whole here, so the set is exact. */
  const questions = new Map<string, { sample: string; type: string; forms: number; orgs: Set<string> }>();

  for (const row of batch) {
    let blocks: DocBlock[] = [];
    let rules = 0;
    try {
      const doc = JSON.parse(row.doc) as { blocks?: DocBlock[]; logic?: unknown[]; endingRules?: unknown[] };
      blocks = Array.isArray(doc.blocks) ? doc.blocks : [];
      rules =
        (Array.isArray(doc.logic) ? doc.logic.length : 0) +
        (Array.isArray(doc.endingRules) ? doc.endingRules.length : 0);
    } catch {
      // A document we cannot parse is skipped, not fatal. One bad row must not
      // stop the whole platform's counting.
      continue;
    }

    tally(sizes, bucketOf(SIZE_BUCKETS, blocks.length));
    tally(logic, bucketOf(LOGIC_BUCKETS, rules));

    for (const block of blocks) {
      const type = typeof block.type === "string" ? block.type : null;
      if (!type) continue;
      tally(blockTypes, type);

      const title = typeof block.title === "string" ? block.title.trim() : "";
      // Passive blocks carry prose, not a question; counting them would fill the
      // "most asked" table with welcome screens.
      if (!title || title.length > 200 || type === "welcome" || type === "statement") continue;
      const norm = normaliseTitle(title);
      if (!norm) continue;
      const entry = questions.get(norm) ?? { sample: title, type, forms: 0, orgs: new Set<string>() };
      entry.forms += 1;
      entry.orgs.add(row.organization_id);
      questions.set(norm, entry);
    }
  }

  const stmts: D1PreparedStatement[] = [];
  const metric = env.DB.prepare(
    `INSERT INTO platform_metrics_daily (date, metric, dimension, value) VALUES (?1, ?2, ?3, ?4)
     ON CONFLICT (date, metric, dimension) DO UPDATE SET value = value + excluded.value`,
  );
  for (const [dim, n] of blockTypes) stmts.push(metric.bind(today, "block_types", dim, n));
  for (const [dim, n] of sizes) stmts.push(metric.bind(today, "form_sizes", dim, n));
  for (const [dim, n] of logic) stmts.push(metric.bind(today, "form_logic", dim, n));

  const question = env.DB.prepare(
    `INSERT INTO platform_question_stats (norm_text, sample_text, block_type, form_count, org_count, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT (norm_text) DO UPDATE SET
       form_count = form_count + excluded.form_count,
       org_count  = org_count + excluded.org_count,
       updated_at = excluded.updated_at`,
  );
  const now = Date.now();
  for (const [norm, entry] of questions) {
    stmts.push(question.bind(norm, entry.sample, entry.type, entry.forms, entry.orgs.size, now));
  }

  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));

  if (done) {
    await env.KV_CONFIG.put(CURSOR_KEY, "done");
    await env.KV_CONFIG.put(FORM_ROLLUP_COMPLETED_KEY, String(Date.now()));
    return true;
  }
  await env.KV_CONFIG.put(CURSOR_KEY, batch[batch.length - 1]!.organization_id);
  return false;
}
