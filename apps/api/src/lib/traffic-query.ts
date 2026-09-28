import type { Bindings } from "../env.js";
import { TRAFFIC_BLOBS as B, TRAFFIC_DOUBLES as D } from "./traffic.js";

/**
 * Reading `chatform_traffic` back, through the Analytics Engine SQL API.
 *
 * Three rules every query here follows:
 *
 *   - **The window comes first.** Every statement is bounded by `timestamp`,
 *     written relative to `NOW()` so the SQL never carries a client value.
 *   - **Counts are weighted.** At high volume Analytics Engine keeps a sample
 *     and records how many rows each kept row stands for in `_sample_interval`,
 *     so a count is `sum(_sample_interval)`, never `count()`. Distinct visitors
 *     are `count(DISTINCT index1)`: the visitor is the sampling key, so a
 *     visitor is kept or dropped whole and the ratio between visitors and
 *     visits holds.
 *   - **Nothing is interpolated but constants.** The one user-typed value that
 *     reaches SQL (a campaign name) goes through `sqlText`, which allows only
 *     the characters a campaign name is normalised to.
 *
 * The API is one HTTP call per statement, so a report fans its statements out
 * in parallel and the caller caches the whole answer (`cachedJson`).
 */

const DATASET = "chatform_traffic";

export class TrafficNotConfigured extends Error {
  constructor() {
    super("CF_ANALYTICS_TOKEN is not set");
  }
}

const col = (key: keyof typeof B) => `blob${B[key]}`;
const dbl = (key: keyof typeof D) => `double${D[key]}`;

/** Row values arrive as strings for 64-bit integers; everything numeric is coerced on read. */
type Row = Record<string, string | number | null>;

export async function aeQuery(env: Bindings, sql: string): Promise<Row[]> {
  const token = env.CF_ANALYTICS_TOKEN;
  const account = env.CF_ACCOUNT_ID ?? env.AI_GATEWAY_ACCOUNT_ID;
  if (!token || !account) throw new TrafficNotConfigured();
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: `${sql} FORMAT JSON`,
  });
  const text = await res.text();
  if (!res.ok) {
    // A dataset that has never been written to does not exist yet: that is an
    // empty report, not a failure.
    if (/unknown table|does not exist/i.test(text)) return [];
    throw new Error(`analytics_engine_sql_${res.status}: ${text.slice(0, 300)}`);
  }
  try {
    return (JSON.parse(text) as { data?: Row[] }).data ?? [];
  } catch {
    throw new Error(`analytics_engine_sql_bad_json: ${text.slice(0, 200)}`);
  }
}

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const s = (v: unknown): string => (v == null ? "" : String(v));

/** Only the characters campaign names are normalised to; anything else cannot reach SQL. */
export function sqlText(value: string): string {
  return `'${value.toLowerCase().replace(/[^a-z0-9_.\-+ ]/g, "").slice(0, 150)}'`;
}

/**
 * `[from, to)` as SQL, in whole hours or minutes back from now.
 * `offset` shifts the window back by its own length, for the previous period.
 */
function windowSql(minutes: number, offset = 0): string {
  const from = `timestamp > NOW() - INTERVAL '${minutes * (offset + 1)}' MINUTE`;
  return offset === 0 ? from : `${from} AND timestamp <= NOW() - INTERVAL '${minutes * offset}' MINUTE`;
}

const VIEWS = `sumIf(_sample_interval, ${col("event")} = 'view')`;
const VISITORS = `count(DISTINCT index1)`;
const VISITS = `count(DISTINCT ${col("visitId")})`;

/** "2026-09-28 10:00:00" (UTC, as the SQL API prints it) as epoch ms. */
function epoch(t: unknown): number {
  const ms = Date.parse(`${s(t).replace(" ", "T")}Z`);
  return Number.isFinite(ms) ? ms : 0;
}

export interface Breakdown {
  key: string;
  visitors: number;
  visits: number;
  views: number;
}

async function breakdown(
  env: Bindings,
  where: string,
  expr: string,
  limit: number,
  extra = "",
): Promise<Breakdown[]> {
  const rows = await aeQuery(
    env,
    `SELECT ${expr} AS key, ${VISITORS} AS visitors, ${VISITS} AS visits, ${VIEWS} AS views
       FROM ${DATASET} WHERE ${where} ${extra}
      GROUP BY key ORDER BY visitors DESC LIMIT ${limit}`,
  );
  return rows.map((r) => ({ key: s(r.key), visitors: n(r.visitors), visits: n(r.visits), views: n(r.views) }));
}

export interface PageRow {
  area: string;
  path: string;
  visitors: number;
  visits: number;
  views: number;
}

/** Pages grouped by area and path: two columns, because the dialect cannot join strings. */
async function pageBreakdown(env: Bindings, where: string, limit: number, extra = ""): Promise<PageRow[]> {
  const rows = await aeQuery(
    env,
    `SELECT ${col("area")} AS area, ${col("path")} AS path, ${VISITORS} AS visitors, ${VISITS} AS visits, ${VIEWS} AS views
       FROM ${DATASET} WHERE ${where} ${extra}
      GROUP BY area, path ORDER BY visitors DESC LIMIT ${limit}`,
  );
  return rows.map((r) => ({
    area: s(r.area),
    path: s(r.path),
    visitors: n(r.visitors),
    visits: n(r.visits),
    views: n(r.views),
  }));
}

export interface TrafficTotals {
  visitors: number;
  visits: number;
  views: number;
  newVisitors: number;
  /** Visits that saw exactly one page. */
  bounced: number;
  /** Visible time, summed over every page left in the period. */
  engagedMs: number;
}

async function totals(env: Bindings, where: string): Promise<TrafficTotals> {
  const [main, fresh, visits] = await Promise.all([
    aeQuery(
      env,
      `SELECT ${VISITORS} AS visitors, ${VISITS} AS visits, ${VIEWS} AS views,
              sumIf(${dbl("engagedMs")} * _sample_interval, ${col("event")} = 'leave') AS engaged
         FROM ${DATASET} WHERE ${where}`,
    ),
    aeQuery(env, `SELECT ${VISITORS} AS visitors FROM ${DATASET} WHERE ${where} AND ${col("isNew")} = '1'`),
    aeQuery(
      env,
      `SELECT count() AS visits, countIf(views = 1) AS bounced FROM (
         SELECT ${col("visitId")} AS visit, sumIf(_sample_interval, ${col("event")} = 'view') AS views
           FROM ${DATASET} WHERE ${where} GROUP BY visit
       ) WHERE views > 0`,
    ),
  ]);
  const m = main[0] ?? {};
  return {
    visitors: n(m.visitors),
    visits: n(m.visits),
    views: n(m.views),
    newVisitors: n(fresh[0]?.visitors),
    bounced: n(visits[0]?.bounced),
    engagedMs: n(m.engaged),
  };
}

export interface GeoPoint {
  country: string;
  region: string;
  city: string;
  lat: number;
  lon: number;
  visitors: number;
  visits: number;
}

export interface Vitals {
  key: string;
  samples: number;
  lcp: number | null;
  inp: number | null;
  ttfb: number | null;
  cls: number | null;
}

/** p75 of each vital, per `expr`. A zero means "not measured" and is weighted out. */
async function vitals(env: Bindings, where: string, expr: string, limit: number): Promise<Vitals[]> {
  const p75 = (d: keyof typeof D) =>
    `quantileExactWeighted(0.75)(${dbl(d)}, if(${dbl(d)} > 0, _sample_interval, 0))`;
  const rows = await aeQuery(
    env,
    `SELECT ${expr} AS key, sumIf(_sample_interval, ${dbl("lcp")} > 0 OR ${dbl("ttfb")} > 0) AS samples,
            ${p75("lcp")} AS lcp, ${p75("inp")} AS inp, ${p75("ttfb")} AS ttfb, ${p75("cls")} AS cls
       FROM ${DATASET} WHERE ${where} AND ${col("event")} = 'leave'
      GROUP BY key HAVING samples > 0 ORDER BY samples DESC LIMIT ${limit}`,
  );
  const orNull = (v: unknown) => (n(v) > 0 ? Math.round(n(v)) : null);
  return rows.map((r) => ({
    key: s(r.key),
    samples: n(r.samples),
    lcp: orNull(r.lcp),
    inp: orNull(r.inp),
    ttfb: orNull(r.ttfb),
    // Stored ×1000 so it survives as a double without float noise.
    cls: n(r.cls) > 0 ? Math.round(n(r.cls)) / 1000 : null,
  }));
}

async function series(env: Bindings, where: string, bucket: "HOUR" | "DAY") {
  const [all, fresh] = await Promise.all([
    aeQuery(
      env,
      `SELECT toStartOfInterval(timestamp, INTERVAL '1' ${bucket}) AS t, ${VISITORS} AS visitors, ${VISITS} AS visits, ${VIEWS} AS views
         FROM ${DATASET} WHERE ${where} GROUP BY t ORDER BY t`,
    ),
    aeQuery(
      env,
      `SELECT toStartOfInterval(timestamp, INTERVAL '1' ${bucket}) AS t, ${VISITORS} AS visitors
         FROM ${DATASET} WHERE ${where} AND ${col("isNew")} = '1' GROUP BY t ORDER BY t`,
    ),
  ]);
  const newAt = new Map(fresh.map((r) => [epoch(r.t), n(r.visitors)]));
  return all.map((r) => {
    const at = epoch(r.t);
    return { at, visitors: n(r.visitors), visits: n(r.visits), views: n(r.views), newVisitors: newAt.get(at) ?? 0 };
  });
}

/** The periods the Traffic page offers. Analytics Engine keeps three months, so 90 days is the ceiling. */
export const TRAFFIC_RANGES = { "1d": 1, "7d": 7, "30d": 30, "90d": 90 } as const;
export type TrafficRange = keyof typeof TRAFFIC_RANGES;

export async function trafficReport(env: Bindings, range: TrafficRange) {
  const days = TRAFFIC_RANGES[range];
  const minutes = days * 24 * 60;
  const W = windowSql(minutes);
  const prev = windowSql(minutes, 1);
  const views = `${col("event")} = 'view'`;

  const [
    now,
    before,
    trend,
    hourly,
    channels,
    sources,
    referrers,
    campaigns,
    areas,
    pages,
    entries,
    exits,
    geo,
    devices,
    browsers,
    oses,
    languages,
    vitalsByArea,
    vitalsByCountry,
    users,
  ] = await Promise.all([
    totals(env, W),
    totals(env, prev),
    series(env, W, days <= 2 ? "HOUR" : "DAY"),
    // The weekday × hour grid, folded into the reader's zone on the client.
    days > 2
      ? aeQuery(
          env,
          `SELECT toStartOfInterval(timestamp, INTERVAL '1' HOUR) AS t, ${VISITORS} AS visitors
             FROM ${DATASET} WHERE ${windowSql(Math.min(minutes, 30 * 24 * 60))} GROUP BY t ORDER BY t`,
        ).then((rows) => rows.map((r) => ({ at: epoch(r.t), visitors: n(r.visitors) })))
      : Promise.resolve(null),
    breakdown(env, W, col("channel"), 10),
    aeQuery(
      env,
      `SELECT ${col("source")} AS source, ${col("channel")} AS channel, ${VISITORS} AS visitors, ${VISITS} AS visits, ${VIEWS} AS views
         FROM ${DATASET} WHERE ${W} GROUP BY source, channel ORDER BY visitors DESC LIMIT 25`,
    ).then((rows) =>
      rows.map((r) => ({ source: s(r.source), channel: s(r.channel), visitors: n(r.visitors), visits: n(r.visits), views: n(r.views) })),
    ),
    breakdown(env, W, col("referrerHost"), 25, `AND ${col("referrerHost")} != ''`),
    breakdown(env, W, col("campaign"), 25, `AND ${col("campaign")} != ''`),
    breakdown(env, W, col("area"), 10),
    pageBreakdown(env, W, 40, `AND ${views}`),
    pageBreakdown(env, W, 25, `AND ${views} AND ${dbl("isEntry")} = 1`),
    // The last page of each visit, its area and path taken from the same row.
    aeQuery(
      env,
      `SELECT area, path, count() AS visits FROM (
         SELECT ${col("visitId")} AS visit, argMax(${col("area")}, timestamp) AS area, argMax(${col("path")}, timestamp) AS path
           FROM ${DATASET} WHERE ${W} AND ${views} GROUP BY visit
       ) GROUP BY area, path ORDER BY visits DESC LIMIT 25`,
    ).then((rows) => rows.map((r) => ({ area: s(r.area), path: s(r.path), visits: n(r.visits) }))),
    aeQuery(
      env,
      `SELECT ${col("country")} AS country, ${col("region")} AS region, ${col("city")} AS city,
              avg(${dbl("lat")}) AS lat, avg(${dbl("lon")}) AS lon, ${VISITORS} AS visitors, ${VISITS} AS visits
         FROM ${DATASET} WHERE ${W} AND ${col("country")} != ''
        GROUP BY country, region, city ORDER BY visitors DESC LIMIT 400`,
    ).then((rows): GeoPoint[] =>
      rows.map((r) => ({
        country: s(r.country),
        region: s(r.region),
        city: s(r.city),
        lat: Math.round(n(r.lat) * 10) / 10,
        lon: Math.round(n(r.lon) * 10) / 10,
        visitors: n(r.visitors),
        visits: n(r.visits),
      })),
    ),
    breakdown(env, W, col("device"), 5, `AND ${col("device")} != ''`),
    breakdown(env, W, col("browser"), 10, `AND ${col("browser")} != ''`),
    breakdown(env, W, col("os"), 10, `AND ${col("os")} != ''`),
    breakdown(env, W, `substring(${col("language")}, 1, 2)`, 10, `AND ${col("language")} != ''`),
    vitals(env, W, col("area"), 10),
    vitals(env, W, col("country"), 12),
    // People signed in to the dashboard or builder: today, this week, this month.
    Promise.all(
      [1, 7, 30].map((d) =>
        aeQuery(
          env,
          `SELECT count(DISTINCT ${col("userId")}) AS users FROM ${DATASET}
            WHERE ${windowSql(d * 24 * 60)} AND ${col("userId")} != ''`,
        ).then((rows) => n(rows[0]?.users)),
      ),
    ),
  ]);

  return {
    range,
    bucket: days <= 2 ? ("hour" as const) : ("day" as const),
    totals: now,
    previous: before,
    series: trend,
    hourly,
    channels,
    sources,
    referrers,
    campaigns,
    areas,
    pages,
    entries,
    exits,
    geo,
    devices,
    browsers,
    oses,
    languages,
    vitals: { byArea: vitalsByArea, byCountry: vitalsByCountry },
    activeUsers: { day: users[0]!, week: users[1]!, month: users[2]! },
  };
}

export type TrafficReport = Awaited<ReturnType<typeof trafficReport>>;

const LIVE_MINUTES = 30;

/** The last half hour a minute at a time, who is here now, and where. */
export async function trafficLive(env: Bindings) {
  const W = windowSql(LIVE_MINUTES);
  const recent = windowSql(5);
  const [perMinute, online, pages, sources, countries] = await Promise.all([
    aeQuery(
      env,
      `SELECT toStartOfInterval(timestamp, INTERVAL '1' MINUTE) AS t, ${VISITORS} AS visitors, ${VIEWS} AS views
         FROM ${DATASET} WHERE ${W} GROUP BY t ORDER BY t`,
    ),
    aeQuery(env, `SELECT ${VISITORS} AS visitors FROM ${DATASET} WHERE ${recent}`),
    pageBreakdown(env, recent, 10),
    breakdown(env, W, col("source"), 8),
    breakdown(env, recent, col("country"), 8, `AND ${col("country")} != ''`),
  ]);

  const until = Math.floor(Date.now() / 60_000) * 60_000 + 60_000;
  const from = until - LIVE_MINUTES * 60_000;
  const visitors = new Array<number>(LIVE_MINUTES).fill(0);
  const views = new Array<number>(LIVE_MINUTES).fill(0);
  for (const r of perMinute) {
    const i = Math.floor((epoch(r.t) - from) / 60_000);
    if (i >= 0 && i < LIVE_MINUTES) {
      visitors[i] = n(r.visitors);
      views[i] = n(r.views);
    }
  }
  return {
    minutes: LIVE_MINUTES,
    until,
    online: n(online[0]?.visitors),
    visitors,
    views,
    pages: pages.map((p) => ({ area: p.area, path: p.path, visitors: p.visitors })),
    sources,
    countries,
  };
}

/** Per-campaign traffic, for the Campaigns page. Joined to sign-ups by the caller. */
export async function campaignTraffic(env: Bindings, days: number) {
  const W = windowSql(days * 24 * 60);
  const rows = await aeQuery(
    env,
    `SELECT ${col("campaign")} AS campaign, ${VISITORS} AS visitors, ${VISITS} AS visits, ${VIEWS} AS views,
            countIf(${col("event")} = 'view' AND ${col("area")} IN ('form', 'embed')) AS formViews
       FROM ${DATASET} WHERE ${W} AND ${col("campaign")} != ''
      GROUP BY campaign ORDER BY visitors DESC LIMIT 200`,
  );
  return rows.map((r) => ({
    campaign: s(r.campaign),
    visitors: n(r.visitors),
    visits: n(r.visits),
    views: n(r.views),
    formViews: n(r.formViews),
  }));
}

/** Visits that arrived from mail we sent, per mail kind (`utm_campaign`). */
export async function emailTraffic(env: Bindings, days: number) {
  const W = windowSql(days * 24 * 60);
  const rows = await aeQuery(
    env,
    `SELECT ${col("campaign")} AS kind, ${VISITORS} AS visitors, ${VISITS} AS visits
       FROM ${DATASET} WHERE ${W} AND ${col("medium")} = 'email' AND ${col("source")} = 'Chatform'
      GROUP BY kind ORDER BY visits DESC LIMIT 30`,
  );
  return rows.map((r) => ({ kind: s(r.kind), visitors: n(r.visitors), visits: n(r.visits) }));
}

/**
 * Yesterday's traffic, for the history `platform_metrics_daily` keeps after
 * Analytics Engine's three months are up. Windows are whole UTC days, so this is
 * the one place that bounds by absolute time.
 */
export async function dailyTrafficRollup(env: Bindings, day: string) {
  const start = `toDateTime('${day} 00:00:00')`;
  const W = `timestamp >= ${start} AND timestamp < ${start} + INTERVAL '1' DAY`;
  const [total, channels, areas, countries, campaigns] = await Promise.all([
    aeQuery(env, `SELECT ${VISITORS} AS visitors, ${VISITS} AS visits, ${VIEWS} AS views FROM ${DATASET} WHERE ${W}`),
    breakdown(env, W, col("channel"), 20),
    breakdown(env, W, col("area"), 20),
    breakdown(env, W, col("country"), 50, `AND ${col("country")} != ''`),
    breakdown(env, W, col("campaign"), 100, `AND ${col("campaign")} != ''`),
  ]);
  const t = total[0] ?? {};
  const rows: { metric: string; dimension: string; value: number }[] = [
    { metric: "traffic_visitors", dimension: "", value: n(t.visitors) },
    { metric: "traffic_visits", dimension: "", value: n(t.visits) },
    { metric: "traffic_views", dimension: "", value: n(t.views) },
  ];
  const add = (metric: string, list: Breakdown[]) => {
    for (const b of list) rows.push({ metric, dimension: b.key, value: b.visitors });
  };
  add("traffic_visitors_by_channel", channels);
  add("traffic_visitors_by_area", areas);
  add("traffic_visitors_by_country", countries);
  add("traffic_visitors_by_campaign", campaigns);
  return rows;
}

/**
 * One cached answer per key, shared by concurrent misses in this isolate.
 *
 * KV's shortest TTL is sixty seconds; anything shorter lives in the isolate
 * alone, which is what the live view wants: a poll every thirty seconds from
 * one admin should not be one SQL API call each, and two admins polling should
 * not be two.
 */
const inflight = new Map<string, Promise<unknown>>();
const memo = new Map<string, { at: number; value: unknown }>();

export async function cachedJson<T>(
  env: Bindings,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlSeconds * 1000) return hit.value as T;
  if (ttlSeconds >= 60) {
    const stored = await env.KV_CONFIG.get(key).catch(() => null);
    if (stored) {
      const value = JSON.parse(stored) as T;
      memo.set(key, { at: Date.now(), value });
      return value;
    }
  }
  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;
  const run = (async () => {
    try {
      const value = await load();
      memo.set(key, { at: Date.now(), value });
      if (ttlSeconds >= 60) {
        await env.KV_CONFIG.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds }).catch(() => {});
      }
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, run);
  return run;
}
