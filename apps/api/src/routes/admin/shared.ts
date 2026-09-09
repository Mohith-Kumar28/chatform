import { z } from "zod";
import type { Bindings } from "../../env.js";
import { utcDay } from "../../lib/platform-rollup.js";

/**
 * The pieces every admin route needs, written once.
 *
 * Chiefly the two correlated sub-selects. "What plan is this organization on"
 * and "who owns it" are asked by nearly every query here, and both have a wrong
 * answer that looks right: a plan lookup that filters on `status = 'active'`
 * silently reports a customer in their dunning grace period as Free, and an
 * owner lookup that compares `members.role = 'owner'` misses everyone whose role
 * is the comma-separated `owner,admin`. Keeping them here means there is one
 * version of each to get right.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const RANGES = { "7d": 7, "30d": 30, "90d": 90, "365d": 365 } as const;
export type RangeKey = keyof typeof RANGES;
export const RangeQuery = z.object({ range: z.enum(["7d", "30d", "90d", "365d"]).default("30d") });

/**
 * The plan-ranking sub-select, matching `loadSubscription()` in
 * `lib/entitlements.ts` exactly. Correlates on an outer `o` aliased to
 * `organizations`.
 */
export const PLAN_OF_ORG = `
  SELECT s.plan_id FROM subscriptions s
   WHERE s.organization_id = o.id
   ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 ELSE 2 END, s.created_at DESC
   LIMIT 1`;

/**
 * The organization's owner, for a "who do I email about this" column.
 *
 * `members.role` holds a comma-separated list, so it is matched with LIKE rather
 * than compared — a member whose role is `owner,admin` is still the owner.
 */
export const OWNER_OF_ORG = `
  SELECT u.email FROM members m JOIN users u ON u.id = m.user_id
   WHERE m.organization_id = o.id AND m.role LIKE '%owner%'
   ORDER BY m.created_at ASC LIMIT 1`;

/**
 * A subscription's monthly-equivalent value in cents.
 *
 * A yearly plan is not twelve times a monthly one, and counting its full price
 * as a month's revenue is the single most common way an MRR figure is wrong.
 * Manual grants are excluded everywhere this is used: an internally comped
 * account pays nothing and must not appear as revenue.
 */
export const MRR_CENTS = `
  CASE WHEN s.cycle = 'yearly' THEN p.price_yearly_cents / 12.0 ELSE p.price_monthly_cents END
  + MAX(0, s.seats - COALESCE(json_extract(p.limits_json, '$.seats'), s.seats)) * p.seat_price_cents`;

export const NOT_COMPED = `s.dodo_subscription_id NOT LIKE 'internal_manual_%'`;

/**
 * "This organization has published a form at some point." Correlates on `o`.
 *
 * Two conditions, because neither alone is sufficient. `form_versions.published_at`
 * is an *event* timestamp and the right thing to count publishes-per-day by, but
 * it is not a reliable record of state: a form can carry an `active_version_id`
 * — which only a publish can set — with no dated version row behind it, and
 * checking `published_at` alone then reports an account that has been live for
 * months as never having shipped anything.
 *
 * Deliberately not `forms.status = 'published'` either: closing a form sets its
 * status to `closed`, and an account that published and later closed has still
 * published.
 */
export const HAS_PUBLISHED = `
  EXISTS (SELECT 1 FROM forms f
           WHERE f.organization_id = o.id AND f.deleted_at IS NULL
             AND (f.active_version_id IS NOT NULL
                  OR EXISTS (SELECT 1 FROM form_versions v WHERE v.form_id = f.id AND v.published_at IS NOT NULL)))`;

/**
 * How far an organization got: 0 nothing, 1 built, 2 published, 3 collecting,
 * 4 collecting properly, 5 paying. Correlates on an outer `o`.
 *
 * The single definition behind both the activation funnel and the account
 * cohorts, and it has to be single or the two disagree in the most damaging
 * possible way: the funnel said "Published it — 3", clicking it listed one
 * account, and a chart that contradicts the list it links to is worse than no
 * chart at all.
 *
 * They disagreed because the funnel reads *cumulatively* — whoever reached a
 * response plainly got past building, whatever the publish table happens to
 * record — while the cohort filter tested the one condition on its own. Reading
 * `stage >= n` on both sides makes them agree by construction rather than by
 * two expressions being kept in step by hand.
 */
export const STAGE_OF_ORG = `
  CASE
    WHEN EXISTS (SELECT 1 FROM subscriptions s WHERE s.organization_id = o.id
                  AND s.status IN ('active','trialing') AND ${NOT_COMPED}) THEN 5
    WHEN (SELECT COUNT(*) FROM submissions s
           WHERE s.organization_id = o.id AND s.is_test = 0 AND s.status = 'completed') >= 10 THEN 4
    WHEN (SELECT COUNT(*) FROM submissions s
           WHERE s.organization_id = o.id AND s.is_test = 0 AND s.status = 'completed') >= 1 THEN 3
    WHEN ${HAS_PUBLISHED} THEN 2
    WHEN EXISTS (SELECT 1 FROM forms f WHERE f.organization_id = o.id AND f.deleted_at IS NULL) THEN 1
    ELSE 0
  END`;

/** The funnel's steps, and the stage each one means. Read cumulatively. */
export const FUNNEL_STAGES = [
  ["signed_up", "Signed up", 0],
  ["created_form", "Created a form", 1],
  ["published", "Published it", 2],
  ["first_response", "First response", 3],
  ["ten_responses", "10 responses", 4],
  ["paid", "Paid", 5],
] as const;

/**
 * Operational rows are declared loosely on purpose.
 *
 * These are triage lists read by one human, joined out of tables whose columns
 * move with the billing integration. Pinning every field in zod would mean
 * editing two places per column, and the generated client gains nothing a
 * `Record` does not already give it. What *is* pinned is the envelope: which
 * lists exist, and that each is a list.
 */
export const OpsRows = z.array(z.record(z.string(), z.unknown()));

export interface MetricRow {
  date: string;
  metric: string;
  dimension: string;
  value: number;
}

export async function loadMetrics(env: Bindings, from: string, to: string): Promise<MetricRow[]> {
  const res = await env.DB.prepare(
    `SELECT date, metric, dimension, value FROM platform_metrics_daily WHERE date >= ? AND date <= ?`,
  )
    .bind(from, to)
    .all<MetricRow>();
  return res.results ?? [];
}

export function dayKeys(days: number, endExclusive = Date.now()): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(utcDay(endExclusive - i * DAY_MS));
  return out;
}

/** One metric's daily series, gaps filled with zero so a chart has no holes. */
export function seriesOf(rows: MetricRow[], metric: string, days: string[], dimension = ""): number[] {
  const byDate = new Map(
    rows.filter((r) => r.metric === metric && r.dimension === dimension).map((r) => [r.date, r.value]),
  );
  return days.map((d) => byDate.get(d) ?? 0);
}

export function sumOf(rows: MetricRow[], metric: string, days: Set<string>, dimension = ""): number {
  let n = 0;
  for (const r of rows) if (r.metric === metric && r.dimension === dimension && days.has(r.date)) n += r.value;
  return n;
}

/** Every dimension of a metric, summed across the window. */
export function sumByDimension(rows: MetricRow[], metric: string, days: Set<string>): { key: string; value: number }[] {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (r.metric !== metric || !days.has(r.date)) continue;
    by.set(r.dimension, (by.get(r.dimension) ?? 0) + r.value);
  }
  return [...by.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * The latest value of a snapshot metric (plan mix, MRR).
 *
 * Snapshots are written once a day and must not be summed — adding thirty
 * daily MRR readings together produces a number thirty times the truth.
 */
export function latestOf(rows: MetricRow[], metric: string): { dimension: string; value: number }[] {
  const day = rows.filter((r) => r.metric === metric).sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
  if (!day) return [];
  return rows.filter((r) => r.metric === metric && r.date === day).map((r) => ({ dimension: r.dimension, value: r.value }));
}

/** Rows out of a `.all()`, with the D1 result unwrapping done once. */
export async function rows<T = Record<string, unknown>>(stmt: D1PreparedStatement): Promise<T[]> {
  const res = await stmt.all<T>();
  return (res.results ?? []) as T[];
}
