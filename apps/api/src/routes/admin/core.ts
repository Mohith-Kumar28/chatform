import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import type { PlatformAdminVars } from "../../lib/platform-admin.js";
import { FORM_ROLLUP_COMPLETED_KEY, utcDay } from "../../lib/platform-rollup.js";
import {
  DAY_MS,
  FUNNEL_STAGES,
  OWNER_OF_ORG,
  STAGE_REACHED_AT,
  OpsRows,
  PLAN_OF_ORG,
  RANGES,
  RangeQuery,
  STAGE_OF_ORG,
  dayKeys,
  latestOf,
  loadMetrics,
  seriesOf,
  sumOf,
  type MetricRow,
  type RangeKey,
} from "./shared.js";

/**
 * Overview, accounts and the action queue — the three screens you open first.
 *
 * Guarded by `requirePlatformAdmin` at the mount in `./index.ts`, not here. See
 * that file for why the whole directory shares one guard.
 */
export const coreRouter = new Hono<{ Bindings: Bindings; Variables: Partial<PlatformAdminVars> }>();

// ───────────────────────────────── me ─────────────────────────────────

coreRouter.get(
  "/admin/me",
  describeRoute({
    tags: ["admin"],
    summary: "Confirm the caller is a platform admin",
    responses: {
      200: { description: "Admin", content: { "application/json": { schema: resolver(z.object({ email: z.string(), userId: z.string() })) } } },
      404: { description: "Not an admin, or not signed in" },
    },
  }),
  (c) => c.json({ email: c.get("platformAdminEmail")!, userId: c.get("userId")! }),
);

// ─────────────────────────────── overview ───────────────────────────────

const FunnelStep = z.object({
  key: z.string(),
  label: z.string(),
  count: z.number(),
  rate: z.number(),
  /** The same stage, for accounts that signed up in the preceding window of equal length. */
  previous: z.number(),
  /** Median ms from signup to first reaching this stage, or null where nobody has. */
  medianMs: z.number().nullable(),
  /** The same median over the preceding window of equal length. */
  previousMedianMs: z.number().nullable(),
});
const OverviewResponse = z.object({
  range: z.string(),
  days: z.array(z.string()),
  kpis: z.record(z.string(), z.object({ value: z.number(), previous: z.number() })),
  series: z.record(z.string(), z.array(z.number())),
  funnel: z.array(FunnelStep),
  planMix: z.array(z.object({ plan: z.string(), orgs: z.number() })),
  mrrSeries: z.array(z.number()),
  cohorts: z.array(z.object({ cohort: z.string(), size: z.number(), retention: z.array(z.number().nullable()) })),
  actionCounts: z.record(z.string(), z.number()),
  formStatsAsOf: z.number().nullable(),
});

/**
 * Accounts that did something in a window, counted once each.
 *
 * The same definition the daily rollup uses for `active_orgs` — collected a
 * response, or edited a form — but over the whole period rather than one day,
 * because the daily figures cannot be added up: an account that worked on
 * Monday and again on Tuesday is one active account, not two.
 *
 * This is why the tile exists at all. "New accounts" sat here before and was
 * the same number as Signups by construction: signing up creates the
 * organization, so the two series traced each other exactly and one line hid
 * the other. Arrivals and who is still here are the two facts worth a tile.
 */
async function activeAccounts(env: Bindings, from: number, to: number): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM (
       SELECT organization_id FROM submissions
        WHERE started_at >= ?1 AND started_at < ?2 AND is_test = 0
        UNION
       SELECT organization_id FROM form_activity
        WHERE created_at >= ?1 AND created_at < ?2
     )`,
  )
    .bind(from, to)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

coreRouter.get(
  "/admin/overview",
  validator("query", RangeQuery),
  describeRoute({
    tags: ["admin"],
    summary: "Platform-wide growth, funnel, retention and revenue",
    responses: {
      200: { description: "Overview", content: { "application/json": { schema: resolver(OverviewResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const range = c.req.valid("query").range as RangeKey;
    const days = RANGES[range];

    /**
     * Cached like entitlements are, and for the same reason: this payload is
     * eight queries deep and nobody watching a dashboard needs it recomputed per
     * keystroke. Five minutes also matches the cron, so a fresher answer would
     * usually be the same answer.
     */
    const cacheKey = `admin:overview:${range}`;
    const cached = await c.env.KV_CONFIG.get(cacheKey);
    if (cached) return c.json(JSON.parse(cached));

    const now = Date.now();
    const window = dayKeys(days, now);
    const previous = dayKeys(days, now - days * DAY_MS);
    const rows = await loadMetrics(c.env, previous[0]!, window[window.length - 1]!);
    const windowSet = new Set(window);
    const previousSet = new Set(previous);

    const kpiFor = (metric: string) => ({
      value: sumOf(rows, metric, windowSet),
      previous: sumOf(rows, metric, previousSet),
    });

    const mrrSeries = seriesOf(rows, "mrr_cents", window);
    const payingSeries = seriesOf(rows, "paying_orgs", window);
    const kpis: Record<string, { value: number; previous: number }> = {
      signups: kpiFor("signups"),
      orgs_created: kpiFor("orgs_created"),
      forms_created: kpiFor("forms_created"),
      responses_completed: kpiFor("responses_completed"),
      responses_partial: kpiFor("responses_partial"),
      ai_cost_micro: kpiFor("ai_cost_micro"),
      // Snapshots, not sums: "MRR over the last 30 days" is not a number. The
      // comparison is where it stood a period ago.
      mrr_cents: { value: mrrSeries.at(-1) ?? 0, previous: seriesOf(rows, "mrr_cents", previous).at(-1) ?? 0 },
      paying_orgs: { value: payingSeries.at(-1) ?? 0, previous: seriesOf(rows, "paying_orgs", previous).at(-1) ?? 0 },
    };

    const series: Record<string, number[]> = {
      signups: seriesOf(rows, "signups", window),
      orgs_created: seriesOf(rows, "orgs_created", window),
      forms_created: seriesOf(rows, "forms_created", window),
      forms_published: seriesOf(rows, "forms_published", window),
      responses_started: seriesOf(rows, "responses_started", window),
      responses_completed: seriesOf(rows, "responses_completed", window),
      responses_partial: seriesOf(rows, "responses_partial", window),
      active_orgs: seriesOf(rows, "active_orgs", window),
      views: seriesOf(rows, "views", window),
      ai_tokens: seriesOf(rows, "ai_tokens", window),
      ai_cost_micro: seriesOf(rows, "ai_cost_micro", window),
    };

    const [funnel, cohorts, actionCounts, formStatsAsOf, activeNow, activeBefore] = await Promise.all([
      activationFunnel(c.env, now - days * DAY_MS, now - 2 * days * DAY_MS),
      retentionCohorts(c.env),
      actionQueueCounts(c.env),
      c.env.KV_CONFIG.get(FORM_ROLLUP_COMPLETED_KEY),
      activeAccounts(c.env, now - days * DAY_MS, now),
      activeAccounts(c.env, now - 2 * days * DAY_MS, now - days * DAY_MS),
    ]);
    // Distinct over the period, so it lands after the rollup-derived KPIs
    // rather than beside them: summing `active_orgs` day by day would count a
    // returning account once per day it came back.
    kpis.active_orgs = { value: activeNow, previous: activeBefore };

    const payload = {
      range,
      days: window,
      kpis,
      series,
      funnel,
      planMix: latestOf(rows, "orgs_by_plan").map((r) => ({ plan: r.dimension, orgs: r.value })),
      mrrSeries,
      cohorts,
      actionCounts,
      formStatsAsOf: formStatsAsOf ? Number(formStatsAsOf) : null,
    };
    await c.env.KV_CONFIG.put(cacheKey, JSON.stringify(payload), { expirationTtl: 300 });
    return c.json(payload);
  },
);

// ───────────────────────────── live activity ─────────────────────────────

/**
 * The last half hour, a minute at a time.
 *
 * Everything else on this console is yesterday's arithmetic: the rollup runs on
 * the cron, the overview is cached for five minutes, and the shortest range the
 * date picker offers is a whole day. None of that answers the question you
 * actually have after a launch tweet or a deploy — *is anything happening right
 * now* — and the honest answer to that cannot come from a table that is
 * recomputed every five minutes.
 *
 * So this one reads the source tables directly. Three things keep that
 * defensible:
 *
 *   - **It is bounded by time, not by tenancy.** Thirty minutes of rows, behind
 *     the timestamp indexes added in `0024`, on every table it touches.
 *   - **It is counts only.** Buckets and totals — never a row, an answer, an
 *     email or an org name. "Something happened" is a platform signal; what was
 *     typed is not ours to watch.
 *   - **It is not cached.** A live tile served from a five-minute cache is a
 *     dead tile that looks live, which is worse than no tile: KV's floor for
 *     `expirationTtl` is sixty seconds, and sixty seconds is two of these
 *     buckets.
 */
const LIVE_MINUTES = 30;
const MINUTE_MS = 60_000;

const LiveResponse = z.object({
  minutes: z.number(),
  /** End of the newest bucket, epoch ms — the client labels its axis from this. */
  until: z.number(),
  total: z.number(),
  events: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      total: z.number(),
      /** One count per minute, oldest first. The last entry is the minute in progress. */
      counts: z.array(z.number()),
    }),
  ),
});

/** What the live tile plots, in the order it stacks them. */
const LIVE_EVENTS: { key: string; label: string; column: string; from: string }[] = [
  {
    key: "form_opened",
    label: "Forms opened",
    column: "created_at",
    from: "chat_sessions WHERE is_test = 0",
  },
  /*
    Started and finished used to be two rows here, and on a live tile they were
    one row drawn twice: a respondent opens a form and starts answering it in
    the same breath, so "Forms opened" above already carries the arrival, and
    the started line traced it a few pixels lower. What the pulse is actually
    for is whether anything is *completing* — so that is the row that stays.
  */
  {
    key: "responses_completed",
    label: "Answers done",
    column: "completed_at",
    from: "submissions WHERE is_test = 0 AND status = 'completed'",
  },
  {
    key: "signups",
    label: "Signups",
    column: "created_at",
    from: "users WHERE 1 = 1",
  },
  {
    key: "forms_created",
    label: "Forms created",
    column: "created_at",
    from: "forms WHERE deleted_at IS NULL",
  },
];

/**
 * One event stream, bucketed into minutes.
 *
 * Grouped in SQLite rather than fetched and counted here: a busy minute on a
 * launch day is thousands of rows, and none of them need to cross the wire to
 * become a bar height.
 */
async function liveBuckets(env: Bindings, event: (typeof LIVE_EVENTS)[number], from: number, to: number) {
  const res = await env.DB.prepare(
    `SELECT CAST((${event.column} - ?1) / ${MINUTE_MS} AS INTEGER) AS bucket, COUNT(*) AS n
       FROM ${event.from} AND ${event.column} >= ?1 AND ${event.column} < ?2
      GROUP BY bucket`,
  )
    .bind(from, to)
    .all<{ bucket: number; n: number }>();

  const counts = new Array<number>(LIVE_MINUTES).fill(0);
  for (const row of res.results ?? []) {
    const i = Number(row.bucket);
    // A clock skew between the row's writer and this query would otherwise
    // throw the count into a bucket the chart does not have.
    if (i >= 0 && i < LIVE_MINUTES) counts[i] = (counts[i] ?? 0) + row.n;
  }
  return counts;
}

coreRouter.get(
  "/admin/live",
  describeRoute({
    tags: ["admin"],
    summary: "Per-minute event counts for the last half hour",
    responses: {
      200: { description: "Live activity", content: { "application/json": { schema: resolver(LiveResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    // Snapped to the minute so the buckets do not slide under the reader
    // between polls: the newest bucket is always the minute in progress.
    const until = Math.floor(Date.now() / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
    const from = until - LIVE_MINUTES * MINUTE_MS;

    const counted = await Promise.all(LIVE_EVENTS.map((e) => liveBuckets(c.env, e, from, until)));
    const events = LIVE_EVENTS.map((e, i) => {
      const counts = counted[i]!;
      return { key: e.key, label: e.label, total: counts.reduce((a, b) => a + b, 0), counts };
    });

    return c.json({
      minutes: LIVE_MINUTES,
      until,
      total: events.reduce((n, e) => n + e.total, 0),
      events,
    });
  },
);

/**
 * Signed up → built → published → opened → collected → kept collecting → paid.
 *
 * Cohorted on organizations created inside the window, not on all organizations
 * ever: mixing a two-year-old account with one that signed up this morning makes
 * every step look worse than it is, and the question this chart answers is
 * "what happens to the people arriving now".
 *
 * Counted as the furthest stage each account reached, then read cumulatively —
 * see `STAGE_OF_ORG`, which the account cohorts read too so the chart and the
 * list it links into cannot disagree.
 */
async function stageCounts(env: Bindings, from: number, to?: number): Promise<Record<string, number>> {
  const columns = FUNNEL_STAGES.filter(([, , n]) => n > 0)
    .map(([key, , n]) => `SUM(CASE WHEN stage >= ${n} THEN 1 ELSE 0 END) AS ${key}`)
    .join(",\n       ");

  const where = to === undefined ? "o.created_at >= ?1" : "o.created_at >= ?1 AND o.created_at < ?2";
  const stmt = env.DB.prepare(
    `SELECT COUNT(*) AS signed_up,
       ${columns}
     FROM (SELECT ${STAGE_OF_ORG} AS stage FROM organizations o WHERE ${where})`,
  );
  const row = await (to === undefined ? stmt.bind(from) : stmt.bind(from, to)).first<Record<string, number>>();
  return row ?? {};
}

/**
 * The window, and the one before it.
 *
 * A funnel with no yesterday tells you where the leak is and never whether it
 * is getting worse, which is the question you actually have after shipping
 * something. The previous window is the same *length* immediately before —
 * cohorted the same way, so the comparison is between two sets of accounts that
 * each had the same amount of time to get somewhere. Anything else compares a
 * month-old cohort against one that signed up on Tuesday.
 *
 * Counts, not rates, come back: the client already divides, and sending the
 * previous count lets it work out both the share of signups and the
 * step-over-step rate without a second contract to keep in step.
 */
async function activationFunnel(env: Bindings, since: number, previousSince: number) {
  const [current, before, medians, beforeMedians] = await Promise.all([
    stageCounts(env, since),
    stageCounts(env, previousSince, since),
    stageMedians(env, since),
    stageMedians(env, previousSince, since),
  ]);

  const top = current.signed_up ?? 0;
  return FUNNEL_STAGES.map(([key, label]) => {
    const count = current[key] ?? 0;
    return {
      key,
      label,
      count,
      rate: top > 0 ? Math.round((count / top) * 1000) / 10 : 0,
      previous: before[key] ?? 0,
      medianMs: medians[key] ?? null,
      previousMedianMs: beforeMedians[key] ?? null,
    };
  });
}

/**
 * How long each stage takes to arrive, for the accounts that got there.
 *
 * The funnel counts who made it and never how long they waited, and those are
 * different problems with different fixes: a step that converts at 90% over
 * nine days is an onboarding you can afford to leave alone right up until you
 * notice the nine days. Read down the column and it is a schedule — publish in
 * an hour, first response the next morning, paid a fortnight later.
 *
 * **Medians, over the accounts that reached the stage.** One account that signed
 * up in March and published in September drags a mean into meaninglessness, and
 * there is always one. Everybody still on their way is excluded rather than
 * counted at infinity — the count columns already say how many those are, and
 * folding them in would make a slow stage look fast the moment it stopped
 * converting.
 *
 * Six correlated subqueries over the window's organizations, which is the one
 * expensive thing on this endpoint. It is bounded by *accounts created in the
 * window* rather than by all history, it runs behind the same five-minute cache
 * as the rest of the payload, and the alternative — a per-stage timestamp
 * column maintained on write — is six more things to keep true.
 */
async function stageMedians(env: Bindings, from: number, to?: number): Promise<Record<string, number | null>> {
  const keys = Object.keys(STAGE_REACHED_AT);
  const columns = keys.map((key) => `${STAGE_REACHED_AT[key]} - o.created_at AS ${key}`).join(",\n       ");

  const where = to === undefined ? "o.created_at >= ?1" : "o.created_at >= ?1 AND o.created_at < ?2";
  const stmt = env.DB.prepare(`SELECT ${columns} FROM organizations o WHERE ${where}`);
  const res = await (to === undefined ? stmt.bind(from) : stmt.bind(from, to)).all<Record<string, number | null>>();

  const out: Record<string, number | null> = {};
  for (const key of keys) {
    // Negative gaps are clock skew or a backfilled row, not a stage reached
    // before the account existed; they would only drag the median downward.
    const gaps = (res.results ?? [])
      .map((row) => row[key])
      .filter((gap): gap is number => typeof gap === "number" && gap >= 0)
      .sort((a, b) => a - b);
    // Lower middle on an even count: with two accounts, the faster one is the
    // honest answer to "how long does this take" more often than their average.
    out[key] = gaps.length > 0 ? (gaps[Math.floor((gaps.length - 1) / 2)] ?? null) : null;
  }
  return out;
}

const WEEK_MS = 7 * DAY_MS;
const COHORT_WEEKS = 12;

/**
 * Weekly retention: of the accounts that signed up in week N, how many were still
 * doing something in week N+k.
 *
 * "Doing something" is collecting a response or editing a form — the same
 * definition `active_orgs` uses in the rollup, because two definitions of active
 * is how a retention chart and a growth chart come to disagree in a meeting.
 *
 * Bounded to twelve cohorts, so the row count here is organizations-created-in-a-
 * quarter × weeks-they-were-active, not the whole history.
 */
async function retentionCohorts(env: Bindings) {
  const epoch = Math.floor(Date.now() / WEEK_MS) * WEEK_MS - (COHORT_WEEKS - 1) * WEEK_MS;
  const res = await env.DB.prepare(
    `SELECT CAST((o.created_at - ?1) / ?2 AS INTEGER) AS cohort,
            CAST((act.at - ?1) / ?2 AS INTEGER) AS week,
            COUNT(DISTINCT o.id) AS n
       FROM organizations o
       JOIN (
         SELECT organization_id, started_at AS at FROM submissions WHERE is_test = 0 AND started_at >= ?1
         UNION ALL
         SELECT organization_id, created_at AS at FROM form_activity WHERE created_at >= ?1
       ) act ON act.organization_id = o.id
      WHERE o.created_at >= ?1
      GROUP BY cohort, week`,
  )
    .bind(epoch, WEEK_MS)
    .all<{ cohort: number; week: number; n: number }>();

  const sizes = await env.DB.prepare(
    `SELECT CAST((created_at - ?1) / ?2 AS INTEGER) AS cohort, COUNT(*) AS n
       FROM organizations WHERE created_at >= ?1 GROUP BY cohort`,
  )
    .bind(epoch, WEEK_MS)
    .all<{ cohort: number; n: number }>();

  const sizeBy = new Map((sizes.results ?? []).map((r) => [r.cohort, r.n]));
  const activeBy = new Map((res.results ?? []).map((r) => [`${r.cohort}:${r.week}`, r.n]));

  const out = [];
  for (let cohort = 0; cohort < COHORT_WEEKS; cohort++) {
    const size = sizeBy.get(cohort) ?? 0;
    const retention: (number | null)[] = [];
    for (let k = 0; cohort + k < COHORT_WEEKS; k++) {
      const active = activeBy.get(`${cohort}:${cohort + k}`) ?? 0;
      // null, not 0, for a week that has not happened — an empty cell and a
      // genuine zero must not look the same.
      retention.push(size === 0 ? null : Math.round((active / size) * 1000) / 10);
    }
    out.push({ cohort: utcDay(epoch + cohort * WEEK_MS), size, retention });
  }
  return out;
}

/** Just the counts, for the badges. `/admin/actions` returns the rows themselves. */
async function actionQueueCounts(env: Bindings): Promise<Record<string, number>> {
  const now = Date.now();
  const [dunning, failedPayments, badWebhooks, stuckEvents] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) AS n FROM subscriptions WHERE status IN ('on_hold', 'past_due') OR (grace_until IS NOT NULL AND grace_until > ?)`,
    )
      .bind(now)
      .first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM payments WHERE status = 'failed' AND created_at >= ?`)
      .bind(now - 30 * DAY_MS)
      .first<{ n: number }>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM webhooks WHERE active = 1 AND consecutive_failures >= 3`).first<{ n: number }>(),
    /**
     * `status` is the authority, not `error`.
     *
     * `dodo_events.error` doubles as a "what did we do about it" note and is
     * populated for events the handler deliberately ignored, so filtering on it
     * would flag every unremarkable event as a problem. The three statuses are
     * `received` (arrived, not yet handled), `processed`, and `failed`.
     */
    env.DB.prepare(`SELECT COUNT(*) AS n FROM dodo_events WHERE status != 'processed'`).first<{ n: number }>(),
  ]);
  return {
    dunning: dunning?.n ?? 0,
    failed_payments: failedPayments?.n ?? 0,
    failing_webhooks: badWebhooks?.n ?? 0,
    stuck_billing_events: stuckEvents?.n ?? 0,
  };
}

// ─────────────────────────────── actions ───────────────────────────────

const ActionsResponse = z.object({
  dunning: OpsRows,
  failedPayments: OpsRows,
  failingWebhooks: OpsRows,
  stuckBillingEvents: OpsRows,
  atLimit: OpsRows,
});

coreRouter.get(
  "/admin/actions",
  describeRoute({
    tags: ["admin"],
    summary: "Accounts and systems that need attention today",
    responses: {
      200: { description: "Action queue", content: { "application/json": { schema: resolver(ActionsResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const now = Date.now();
    const [dunning, failedPayments, failingWebhooks, stuckEvents] = await Promise.all([
      c.env.DB.prepare(
        `SELECT o.id AS org_id, o.name, s.plan_id, s.status, s.grace_until, s.current_period_end,
                p.price_monthly_cents AS at_risk_cents
           FROM subscriptions s
           JOIN organizations o ON o.id = s.organization_id
           JOIN plans p ON p.id = s.plan_id
          WHERE s.status IN ('on_hold', 'past_due') OR (s.grace_until IS NOT NULL AND s.grace_until > ?)
          ORDER BY p.price_monthly_cents DESC LIMIT 50`,
      )
        .bind(now)
        .all(),
      c.env.DB.prepare(
        `SELECT p.id, p.organization_id AS org_id, o.name, p.amount_cents, p.currency, p.created_at
           FROM payments p JOIN organizations o ON o.id = p.organization_id
          WHERE p.status = 'failed' AND p.created_at >= ?
          ORDER BY p.created_at DESC LIMIT 50`,
      )
        .bind(now - 30 * DAY_MS)
        .all(),
      c.env.DB.prepare(
        `SELECT w.id, w.organization_id AS org_id, o.name, w.url, w.consecutive_failures,
                (SELECT d.last_error FROM webhook_deliveries d WHERE d.webhook_id = w.id ORDER BY d.created_at DESC LIMIT 1) AS last_error
           FROM webhooks w JOIN organizations o ON o.id = w.organization_id
          WHERE w.active = 1 AND w.consecutive_failures >= 3
          ORDER BY w.consecutive_failures DESC LIMIT 50`,
      ).all(),
      c.env.DB.prepare(
        `SELECT id, dodo_event_id, type, status, error, created_at FROM dodo_events
          WHERE status != 'processed'
          ORDER BY created_at DESC LIMIT 50`,
      ).all(),
    ]);

    /**
     * Accounts using more than the plan they are on allows.
     *
     * Read from `usage_counters` against `plans.limits_json` rather than
     * recomputed, so this agrees with what the customer sees on their own usage
     * page. At 80% it is an upsell; over 100% on a `meter` limit it is revenue
     * we are not charging for.
     */
    /**
     * Wrapped in a sub-select because SQLite cannot reference a SELECT alias from
     * WHERE, and `cap` is a `json_extract` over the plan's limits that has no
     * business being written three times.
     */
    const period = new Date().toISOString().slice(0, 7);
    const atLimit = await c.env.DB.prepare(
      `SELECT * FROM (
         SELECT u.organization_id AS org_id, o.name, u.metric, u.used,
                COALESCE((${PLAN_OF_ORG}), 'free') AS plan,
                json_extract(p.limits_json, '$.' || u.metric || '_per_month') AS cap
           FROM usage_counters u
           JOIN organizations o ON o.id = u.organization_id
           JOIN plans p ON p.id = COALESCE((${PLAN_OF_ORG}), 'free')
          WHERE u.period = ?
       )
       WHERE cap IS NOT NULL AND cap > 0 AND used >= cap * 0.8
       ORDER BY (CAST(used AS REAL) / cap) DESC
       LIMIT 50`,
    )
      .bind(period)
      .all();

    return c.json({
      dunning: dunning.results ?? [],
      failedPayments: failedPayments.results ?? [],
      failingWebhooks: failingWebhooks.results ?? [],
      stuckBillingEvents: stuckEvents.results ?? [],
      atLimit: atLimit.results ?? [],
    });
  },
);

// ─────────────────────────────── accounts ───────────────────────────────

const SORTS = {
  created: "o.created_at DESC",
  responses: "responses_30d DESC",
  forms: "forms DESC",
  ai: "ai_tokens_30d DESC",
  active: "last_active_at DESC",
  mrr: "mrr_cents DESC",
} as const;

coreRouter.get(
  "/admin/accounts",
  validator(
    "query",
    z.object({
      q: z.string().max(120).optional(),
      plan: z.enum(["free", "pro", "business"]).optional(),
      cohort: z
        .enum(["created_form", "published", "form_opened", "first_response", "ten_responses", "paid", "no_form", "stalled"])
        .optional(),
      /** Bound to accounts created in the last N days, matching the funnel that linked here. */
      since: z.coerce.number().int().min(1).max(3650).optional(),
      sort: z.enum(["created", "responses", "forms", "ai", "active", "mrr"]).default("created"),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }),
  ),
  describeRoute({
    tags: ["admin"],
    summary: "Every organization, with the numbers that decide what to do about it",
    responses: {
      200: {
        description: "Accounts",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                accounts: z.array(
                  z.object({
                    id: z.string(),
                    name: z.string(),
                    slug: z.string(),
                    created_at: z.number(),
                    owner_email: z.string().nullable(),
                    plan: z.string(),
                    seats: z.number(),
                    forms: z.number(),
                    responses_30d: z.number(),
                    ai_tokens_30d: z.number(),
                    ai_cost_micro_30d: z.number(),
                    last_active_at: z.number().nullable(),
                    mrr_cents: z.number(),
                  }),
                ),
                total: z.number(),
                limit: z.number(),
                offset: z.number(),
              }),
            ),
          },
        },
      },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const { q, plan, cohort, sort, limit, offset, since: sinceDays } = c.req.valid("query");
    const since_days = sinceDays ?? null;
    const since = Date.now() - 30 * DAY_MS;

    /**
     * Correlated subqueries rather than a pile of GROUP BY joins.
     *
     * They are evaluated per output row, which is what makes the default
     * `created DESC` page cheap: fifty rows, five lookups each, all behind
     * existing indexes. Sorting by a computed column does force the whole set to
     * be evaluated — acceptable while the account base is small, and the reason
     * every such sort is an explicit opt-in rather than the default.
     */
    // Numbered parameters throughout: `?1` is the 30-day cut-off and appears in
    // three subqueries, which `?` placeholders cannot express.
    const filters: string[] = [];
    if (q) filters.push(`(o.name LIKE ?2 OR o.slug LIKE ?2 OR EXISTS (SELECT 1 FROM members m JOIN users u ON u.id = m.user_id WHERE m.organization_id = o.id AND u.email LIKE ?2))`);
    if (plan) filters.push(`COALESCE((${PLAN_OF_ORG}), 'free') = ?3`);
    /**
     * Funnel cohorts read `stage >= n`, exactly as the funnel counts them, so
     * clicking a bar lands on the same accounts the bar counted. `no_form` and
     * `stalled` are not funnel steps and stay as their own predicates.
     */
    const stage = FUNNEL_STAGES.find(([key]) => key === cohort)?.[2];
    if (stage !== undefined && stage > 0) filters.push(`(${STAGE_OF_ORG}) >= ${stage}`);
    if (cohort === "no_form") filters.push(`NOT EXISTS (SELECT 1 FROM forms f WHERE f.organization_id = o.id AND f.deleted_at IS NULL)`);
    /*
      Built something and then stopped: the cohort worth an email.

      Runs to stage 3, not 2, now that "someone opened it" is its own step —
      an account whose form was opened and never answered has still collected
      nothing, which is what this cohort is named for.
    */
    if (cohort === "stalled") filters.push(`(${STAGE_OF_ORG}) BETWEEN 1 AND 3`);
    /**
     * The same window the funnel was cohorted on, when the caller came from it.
     * Without it a 30-day funnel links into an all-time list and the counts
     * differ for a second, subtler reason than the one `STAGE_OF_ORG` fixes.
     *
     * Written as an always-present nullable predicate rather than appended
     * conditionally — the same shape `audit.ts` uses — because SQLite sizes a
     * statement by its highest `?N`, so a placeholder that comes and goes
     * changes the parameter count and the bind list stops matching.
     */
    filters.push(`(?6 IS NULL OR o.created_at >= ?6)`);

    const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
    const sql = `
      SELECT o.id, o.name, o.slug, o.created_at,
             (${OWNER_OF_ORG}) AS owner_email,
             COALESCE((${PLAN_OF_ORG}), 'free') AS plan,
             (SELECT COUNT(*) FROM members m WHERE m.organization_id = o.id) AS seats,
             (SELECT COUNT(*) FROM forms f WHERE f.organization_id = o.id AND f.deleted_at IS NULL) AS forms,
             (SELECT COUNT(*) FROM submissions s WHERE s.organization_id = o.id AND s.is_test = 0 AND s.started_at >= ?1) AS responses_30d,
             (SELECT COALESCE(SUM(g.prompt_tokens + g.completion_tokens), 0) FROM ai_generations g WHERE g.organization_id = o.id AND g.created_at >= ?1) AS ai_tokens_30d,
             (SELECT COALESCE(SUM(g.cost_usd_micro), 0) FROM ai_generations g WHERE g.organization_id = o.id AND g.created_at >= ?1) AS ai_cost_micro_30d,
             (SELECT MAX(t) FROM (
                SELECT MAX(s.started_at) AS t FROM submissions s WHERE s.organization_id = o.id
                UNION ALL SELECT MAX(a.created_at) FROM form_activity a WHERE a.organization_id = o.id
              )) AS last_active_at,
             COALESCE((SELECT CASE WHEN s.cycle = 'yearly' THEN p.price_yearly_cents / 12 ELSE p.price_monthly_cents END
                         FROM subscriptions s JOIN plans p ON p.id = s.plan_id
                        WHERE s.organization_id = o.id AND s.status IN ('active','trialing')
                          AND s.dodo_subscription_id NOT LIKE 'internal_manual_%'
                        ORDER BY s.created_at DESC LIMIT 1), 0) AS mrr_cents
        FROM organizations o
        ${where}
       ORDER BY ${SORTS[sort]}
       LIMIT ?4 OFFSET ?5`;

    const res = await c.env.DB.prepare(sql)
      .bind(
        since,
        q ? `%${q}%` : null,
        plan ?? null,
        limit,
        offset,
        since_days ? Date.now() - since_days * DAY_MS : null,
      )
      .all();

    /**
     * The count of what this filter matched, not of every organization — a
     * pager that says "1–50 of 19" because the total ignored the filter is a
     * pager nobody can use.
     */
    const total = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM organizations o ${where}`,
    )
      .bind(
        since,
        q ? `%${q}%` : null,
        plan ?? null,
        limit,
        offset,
        since_days ? Date.now() - since_days * DAY_MS : null,
      )
      .first<{ n: number }>();
    return c.json({ accounts: res.results ?? [], total: total?.n ?? 0, limit, offset });
  },
);

coreRouter.get(
  "/admin/accounts/:orgId",
  describeRoute({
    tags: ["admin"],
    summary: "One organization, in full",
    responses: {
      200: {
        description: "Account",
        content: {
          "application/json": {
            schema: resolver(
              z.object({
                org: z.record(z.string(), z.unknown()),
                plan: z.object({ id: z.string(), name: z.string() }).nullable(),
                /** The plan's `limits_json`, so usage can be shown against its ceiling. */
                limits: z.record(z.string(), z.number().nullable()),
                members: OpsRows,
                subscription: z.record(z.string(), z.unknown()).nullable(),
                forms: OpsRows,
                usage: OpsRows,
                overrides: OpsRows,
                audit: OpsRows,
                denials: OpsRows,
              }),
            ),
          },
        },
      },
      404: { description: "Not an admin, or no such org" },
    },
  }),
  async (c) => {
    const orgId = c.req.param("orgId");
    const org = await c.env.DB.prepare(
      `SELECT o.id, o.name, o.slug, o.logo, o.created_at, o.postal_address FROM organizations o WHERE o.id = ?`,
    )
      .bind(orgId)
      .first();
    if (!org) return c.json({ error: { code: "not_found", message: "Not found" } }, 404);

    const period = new Date().toISOString().slice(0, 7);
    /**
     * The plan's limits, resolved the same way `getEntitlements` resolves them.
     *
     * Sent alongside usage because a usage number without its ceiling is not a
     * usage number — "18 responses" means nothing until you know whether the cap
     * is 20 or 50,000. Free orgs have no `subscriptions` row, hence the fallback.
     */
    const planRow = await c.env.DB.prepare(
      `SELECT p.id, p.name, p.limits_json
         FROM plans p
        WHERE p.id = COALESCE((SELECT s.plan_id FROM subscriptions s
                                WHERE s.organization_id = ?1
                                ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 ELSE 2 END,
                                         s.created_at DESC LIMIT 1), 'free')`,
    )
      .bind(orgId)
      .first<{ id: string; name: string; limits_json: string }>();

    const [members, subscription, forms, usage, overrides, audit, denials] = await Promise.all([
      c.env.DB.prepare(
        `SELECT u.id, u.email, u.name, u.email_verified, u.created_at, m.role, m.created_at AS joined_at,
                (SELECT MAX(s.created_at) FROM sessions s WHERE s.user_id = u.id) AS last_session_at
           FROM members m JOIN users u ON u.id = m.user_id
          WHERE m.organization_id = ? ORDER BY m.created_at ASC`,
      )
        .bind(orgId)
        .all(),
      c.env.DB.prepare(
        `SELECT s.*, p.name AS plan_name, p.price_monthly_cents, p.price_yearly_cents, p.limits_json
           FROM subscriptions s JOIN plans p ON p.id = s.plan_id
          WHERE s.organization_id = ?
          ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 ELSE 2 END, s.created_at DESC LIMIT 1`,
      )
        .bind(orgId)
        .first(),
      /**
       * Structure only — title, status, size, how it is doing. Never the
       * document and never a response: what a customer's respondents typed is
       * not something this console browses.
       */
      c.env.DB.prepare(
        `SELECT f.id, f.title, f.slug, f.status, f.created_at, f.updated_at,
                (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id AND s.is_test = 0 AND s.status = 'completed') AS completed,
                (SELECT COUNT(*) FROM submissions s WHERE s.form_id = f.id AND s.is_test = 0) AS started,
                json_array_length(json_extract(COALESCE((SELECT v.schema_json FROM form_versions v WHERE v.id = f.active_version_id), f.working_schema), '$.blocks')) AS blocks
           FROM forms f WHERE f.organization_id = ? AND f.deleted_at IS NULL
          ORDER BY f.updated_at DESC LIMIT 200`,
      )
        .bind(orgId)
        .all(),
      c.env.DB.prepare(`SELECT metric, used, period FROM usage_counters WHERE organization_id = ? AND period = ?`)
        .bind(orgId, period)
        .all(),
      c.env.DB.prepare(`SELECT kind, key, value, reason, expires_at, created_at FROM entitlement_overrides WHERE organization_id = ?`)
        .bind(orgId)
        .all(),
      c.env.DB.prepare(
        `SELECT id, action, actor_type, actor_label, resource_type, resource_id, created_at
           FROM audit_logs WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50`,
      )
        .bind(orgId)
        .all(),
      // Which paywall they keep hitting — the single best signal of what this
      // particular account would pay for.
      c.env.DB.prepare(
        `SELECT feature, surface, denial_count, first_denied_at, last_denied_at, converted_at
           FROM feature_access_log WHERE organization_id = ? ORDER BY denial_count DESC LIMIT 20`,
      )
        .bind(orgId)
        .all(),
    ]);

    let limits: Record<string, number | null> = {};
    try {
      limits = planRow ? (JSON.parse(planRow.limits_json) as Record<string, number | null>) : {};
    } catch {
      // A malformed catalogue row costs the meters their ceilings, not the page.
    }

    return c.json({
      org,
      plan: planRow ? { id: planRow.id, name: planRow.name } : null,
      limits,
      members: members.results ?? [],
      subscription: subscription ?? null,
      forms: forms.results ?? [],
      usage: usage.results ?? [],
      overrides: overrides.results ?? [],
      audit: audit.results ?? [],
      denials: denials.results ?? [],
    });
  },
);
