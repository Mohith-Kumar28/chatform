import type { Bindings } from "../env.js";

/**
 * The dashboard's headline numbers: every form in a scope, added up.
 *
 * Per-form analytics lives in `analytics-service.ts` and is keyed by one form
 * id. This is the other axis, across forms, for the row of tiles above the
 * forms grid and for `GET /v1/analytics/overview`, so the two surfaces show the
 * same numbers.
 *
 * Two windows of `OVERVIEW_DAYS` each, the current one and the one before it, so every
 * tile can say which way it moved. Days are the caller's local days (`tzMinutes`
 * east of UTC), because "today" on a dashboard opened in India means the
 * Indian today. View counts are the exception: the beacon rolls them up by UTC
 * date, and that is the only granularity stored.
 *
 * Test responses never count, and neither does anything on an archived form,
 * which matches what the forms grid shows. Status is not filtered: a restored
 * form is a draft that still collected real answers.
 */

export const OVERVIEW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const PARTIAL = "('abandoned','in_progress','disqualified')";

/** A SQL fragment over `forms f` naming the forms to add up, with its bindings. */
export interface FormScope {
  orgId: string;
  sql: string;
  binds: unknown[];
}

interface Pair<T> {
  value: T;
  previous: T;
}

export interface OrgOverview {
  days: number;
  /** Completed responses so far today, on the caller's clock. */
  today: number;
  kpis: {
    responses: Pair<number>;
    views: Pair<number>;
    /** Of the responses started in the window, the share that finished. Null with no starts. */
    completionRate: Pair<number | null>;
    partial: Pair<number>;
    /** Median time to finish, over responses completed in the window. Null with none. */
    medianMs: Pair<number | null>;
  };
  /** One value per day, oldest first, for the sparklines. */
  series: {
    responses: number[];
    views: number[];
    completionRate: number[];
    partial: number[];
  };
}

/** Minutes east of UTC, clamped to the offsets that exist, as milliseconds. */
function shiftOf(tzMinutes: number): number {
  return Math.max(-840, Math.min(840, Math.round(tzMinutes))) * 60_000;
}

/** Epoch ms of the most recent midnight on a clock `tzMinutes` east of UTC. */
export function localMidnight(now: number, tzMinutes: number): number {
  const shiftMs = shiftOf(tzMinutes);
  return Date.parse(`${dayOf(now, shiftMs)}T00:00:00Z`) - shiftMs;
}

/** `YYYY-MM-DD` for the day `at` falls on, `shiftMs` east of UTC. */
function dayOf(at: number, shiftMs: number): string {
  return new Date(at + shiftMs).toISOString().slice(0, 10);
}

export async function computeOrgOverview(env: Bindings, scope: FormScope, tzMinutes = 0): Promise<OrgOverview> {
  const shiftMs = shiftOf(tzMinutes);
  const shiftSec = shiftMs / 1000;
  const now = Date.now();

  // Two windows of local days, oldest first: the previous window then the current one.
  const keys: string[] = [];
  for (let i = OVERVIEW_DAYS * 2 - 1; i >= 0; i--) keys.push(dayOf(now - i * DAY_MS, shiftMs));
  const prevKeys = keys.slice(0, OVERVIEW_DAYS);
  const curKeys = keys.slice(OVERVIEW_DAYS);
  // Midnight local time at the start of both windows, as epoch ms.
  const since = Date.parse(`${keys[0]}T00:00:00Z`) - shiftMs;
  const split = Date.parse(`${curKeys[0]}T00:00:00Z`) - shiftMs;

  const base = `s.organization_id = ? AND s.is_test = 0 AND f.deleted_at IS NULL AND ${scope.sql}`;
  const binds = [scope.orgId, ...scope.binds];
  const median = (from: number, to: number) =>
    env.DB.prepare(
      `SELECT s.duration_ms AS ms FROM submissions s JOIN forms f ON f.id = s.form_id
        WHERE ${base} AND s.status = 'completed' AND s.duration_ms IS NOT NULL AND s.completed_at >= ? AND s.completed_at < ?
        ORDER BY s.duration_ms
        LIMIT 1 OFFSET (SELECT (COUNT(*) - 1) / 2 FROM submissions s JOIN forms f ON f.id = s.form_id
                         WHERE ${base} AND s.status = 'completed' AND s.duration_ms IS NOT NULL AND s.completed_at >= ? AND s.completed_at < ?)`,
    ).bind(...binds, from, to, ...binds, from, to);

  const [startedRes, completedRes, viewsRes, medianCur, medianPrev] = (await env.DB.batch([
    // The started cohort, by the day it started: starts, how many of those
    // finished, and how many did not.
    env.DB.prepare(
      `SELECT strftime('%Y-%m-%d', s.started_at / 1000 + ?, 'unixepoch') AS d,
              COUNT(*) AS starts,
              SUM(CASE WHEN s.status = 'completed' THEN 1 ELSE 0 END) AS finished,
              SUM(CASE WHEN s.status IN ${PARTIAL} THEN 1 ELSE 0 END) AS partial
         FROM submissions s JOIN forms f ON f.id = s.form_id
        WHERE ${base} AND s.started_at >= ?
        GROUP BY d`,
    ).bind(shiftSec, ...binds, since),
    // Responses, by the day they arrived, which is what "new today" means.
    env.DB.prepare(
      `SELECT strftime('%Y-%m-%d', s.completed_at / 1000 + ?, 'unixepoch') AS d, COUNT(*) AS n
         FROM submissions s JOIN forms f ON f.id = s.form_id
        WHERE ${base} AND s.status = 'completed' AND s.completed_at >= ?
        GROUP BY d`,
    ).bind(shiftSec, ...binds, since),
    env.DB.prepare(
      `SELECT r.date AS d, SUM(r.views) AS n
         FROM analytics_rollup_daily r JOIN forms f ON f.id = r.form_id
        WHERE f.organization_id = ? AND f.deleted_at IS NULL AND ${scope.sql} AND r.date >= ?
        GROUP BY r.date`,
    ).bind(...binds, keys[0]),
    median(split, now + DAY_MS),
    median(since, split),
  ])) as [
    D1Result<{ d: string; starts: number; finished: number | null; partial: number | null }>,
    D1Result<{ d: string; n: number }>,
    D1Result<{ d: string; n: number | null }>,
    D1Result<{ ms: number }>,
    D1Result<{ ms: number }>,
  ];

  const started = new Map((startedRes.results ?? []).map((r) => [r.d, r]));
  const completed = new Map((completedRes.results ?? []).map((r) => [r.d, r.n]));
  const views = new Map((viewsRes.results ?? []).map((r) => [r.d, r.n ?? 0]));

  const seriesOf = (days: string[], pick: (d: string) => number) => days.map(pick);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const startsOn = (d: string) => started.get(d)?.starts ?? 0;
  const finishedOn = (d: string) => started.get(d)?.finished ?? 0;
  const partialOn = (d: string) => started.get(d)?.partial ?? 0;
  const rate = (days: string[]) => {
    const s = sum(seriesOf(days, startsOn));
    return s === 0 ? null : sum(seriesOf(days, finishedOn)) / s;
  };

  const responses = seriesOf(curKeys, (d) => completed.get(d) ?? 0);
  const viewSeries = seriesOf(curKeys, (d) => views.get(d) ?? 0);
  const partial = seriesOf(curKeys, partialOn);

  return {
    days: OVERVIEW_DAYS,
    today: responses[responses.length - 1] ?? 0,
    kpis: {
      responses: { value: sum(responses), previous: sum(seriesOf(prevKeys, (d) => completed.get(d) ?? 0)) },
      views: { value: sum(viewSeries), previous: sum(seriesOf(prevKeys, (d) => views.get(d) ?? 0)) },
      completionRate: { value: rate(curKeys), previous: rate(prevKeys) },
      partial: { value: sum(partial), previous: sum(seriesOf(prevKeys, partialOn)) },
      medianMs: { value: medianCur.results?.[0]?.ms ?? null, previous: medianPrev.results?.[0]?.ms ?? null },
    },
    series: {
      responses,
      views: viewSeries,
      // A day nobody started is drawn at zero rather than left as a gap.
      completionRate: seriesOf(curKeys, (d) => (startsOn(d) ? finishedOn(d) / startsOn(d) : 0)),
      partial,
    },
  };
}
