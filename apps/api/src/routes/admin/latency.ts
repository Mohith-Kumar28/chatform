import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import type { PlatformAdminVars } from "../../lib/platform-admin.js";
import { DAY_MS, RANGES, RangeQuery, dayKeys, rows, type RangeKey } from "./shared.js";

/**
 * How long respondents wait for the form to answer them.
 *
 * One row per turn in `chat_turn_timings`. The wait is what the respondent's
 * browser measured, from pressing send to the first sign of a reply, network
 * included. Where the browser never reported (a closed tab, an old client), the
 * server's own first-word time stands in. Averages hide the slow tail, so
 * everything here is a percentile, broken down by whatever might explain it.
 */

export const latencyRouter = new Hono<{ Bindings: Bindings; Variables: Partial<PlatformAdminVars> }>();

const Percentiles = z.object({
  turns: z.number(),
  p50: z.number(),
  p90: z.number(),
  p95: z.number(),
  p99: z.number(),
});

const LatencyResponse = z.object({
  totals: Percentiles.extend({
    prev: Percentiles,
    /** Median of the server's own time to first word, so network can be told apart from us. */
    serverP50: z.number(),
    /** Cached input over all input, on turns the model ran. */
    cacheHitRate: z.number(),
    prevCacheHitRate: z.number(),
  }),
  days: z.array(z.string()),
  p50Series: z.array(z.number()),
  p95Series: z.array(z.number()),
  breakdowns: z.array(
    z.object({
      dimension: z.string(),
      rows: z.array(Percentiles.extend({ key: z.string() })),
    }),
  ),
  slowest: z.array(
    z.object({
      sessionId: z.string(),
      formId: z.string().nullable(),
      formTitle: z.string().nullable(),
      createdAt: z.number(),
      waitMs: z.number(),
      serverMs: z.number().nullable(),
      path: z.string().nullable(),
      isFinal: z.boolean(),
      steps: z.number().nullable(),
      tools: z.string().nullable(),
      device: z.string().nullable(),
      browser: z.string().nullable(),
      country: z.string().nullable(),
    }),
  ),
});

/** The wait: what the browser saw, else the server's first word, else the next card. */
const WAIT = `COALESCE(c.client_ms, c.first_word_ms, c.next_card_ms)`;
/** Rows the session wrote (not a bare client report), from real respondents. */
const REAL = `c.is_test = 0 AND c.path IS NOT NULL`;

/**
 * Nearest-rank percentiles per group, in one pass.
 *
 * SQLite has no `percentile()`, but it has window functions: number every row
 * within its group by wait, and the p-th percentile is the smallest wait whose
 * rank reaches p% of the group.
 */
function percentileSql(key: string, where: string, limit = 12): string {
  return `
    WITH t AS (
      SELECT ${key} AS k, ${WAIT} AS v
        FROM chat_turn_timings c LEFT JOIN forms f ON f.id = c.form_id
       WHERE ${REAL} AND ${where} AND ${WAIT} IS NOT NULL
    ), r AS (
      SELECT k, v, ROW_NUMBER() OVER (PARTITION BY k ORDER BY v) AS rn, COUNT(*) OVER (PARTITION BY k) AS n FROM t
    )
    SELECT COALESCE(k, 'unknown') AS key, MAX(n) AS turns,
           MIN(CASE WHEN rn * 100 >= n * 50 THEN v END) AS p50,
           MIN(CASE WHEN rn * 100 >= n * 90 THEN v END) AS p90,
           MIN(CASE WHEN rn * 100 >= n * 95 THEN v END) AS p95,
           MIN(CASE WHEN rn * 100 >= n * 99 THEN v END) AS p99
      FROM r GROUP BY k ORDER BY turns DESC LIMIT ${limit}`;
}

type Row = { key: string; turns: number; p50: number; p90: number; p95: number; p99: number };

const EMPTY = { turns: 0, p50: 0, p90: 0, p95: 0, p99: 0 };

function strip(r: Row | undefined) {
  if (!r) return EMPTY;
  return { turns: r.turns, p50: r.p50 ?? 0, p90: r.p90 ?? 0, p95: r.p95 ?? 0, p99: r.p99 ?? 0 };
}

/** What each breakdown groups by. Keys are shown as-is, so they read as labels. */
const DIMENSIONS: { dimension: string; key: string }[] = [
  { dimension: "Path", key: "c.path" },
  { dimension: "Turn", key: `CASE WHEN c.is_final = 1 THEN 'Last question' ELSE 'Other questions' END` },
  {
    dimension: "Model steps",
    key: `CASE WHEN c.steps IS NULL THEN 'No model' WHEN c.steps >= 3 THEN '3+' ELSE CAST(c.steps AS TEXT) END`,
  },
  { dimension: "Mode", key: "c.mode" },
  { dimension: "Question type", key: "c.block_type" },
  { dimension: "Device", key: "c.device" },
  { dimension: "Browser", key: "c.browser" },
  { dimension: "Country", key: "c.country" },
  { dimension: "Form", key: "f.title" },
];

latencyRouter.get(
  "/admin/latency",
  validator("query", RangeQuery),
  describeRoute({
    tags: ["admin"],
    summary: "How long respondents wait for each reply, as percentiles and by what explains it",
    responses: {
      200: { description: "Turn latency", content: { "application/json": { schema: resolver(LatencyResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const range = c.req.valid("query").range as RangeKey;
    const days = RANGES[range];
    const window = dayKeys(days);
    const since = Date.now() - days * DAY_MS;
    const prevSince = since - days * DAY_MS;
    const db = c.env.DB;

    const period = `CASE WHEN c.created_at >= ${since} THEN 'now' ELSE 'prev' END`;
    const [overall, server, cache, daily, slowest, ...breakdowns] = await Promise.all([
      rows<Row>(db.prepare(percentileSql(period, `c.created_at >= ?`)).bind(prevSince)),
      db
        .prepare(
          `WITH t AS (
             SELECT COALESCE(c.first_word_ms, c.next_card_ms) AS v FROM chat_turn_timings c
              WHERE ${REAL} AND c.created_at >= ? AND COALESCE(c.first_word_ms, c.next_card_ms) IS NOT NULL
           ), r AS (SELECT v, ROW_NUMBER() OVER (ORDER BY v) AS rn, COUNT(*) OVER () AS n FROM t)
           SELECT MIN(CASE WHEN rn * 100 >= n * 50 THEN v END) AS p50 FROM r`,
        )
        .bind(since)
        .first<{ p50: number | null }>(),
      db
        .prepare(
          `SELECT COALESCE(SUM(CASE WHEN created_at >= ?1 THEN cache_read_tokens END), 0) AS hit,
                  COALESCE(SUM(CASE WHEN created_at >= ?1 THEN input_tokens END), 0) AS input,
                  COALESCE(SUM(CASE WHEN created_at < ?1 THEN cache_read_tokens END), 0) AS prev_hit,
                  COALESCE(SUM(CASE WHEN created_at < ?1 THEN input_tokens END), 0) AS prev_input
             FROM chat_turn_timings c WHERE ${REAL} AND c.created_at >= ?2 AND c.input_tokens > 0`,
        )
        .bind(since, prevSince)
        .first<{ hit: number; input: number; prev_hit: number; prev_input: number }>(),
      rows<Row>(
        db
          .prepare(percentileSql(`strftime('%Y-%m-%d', c.created_at / 1000, 'unixepoch')`, `c.created_at >= ?`, 400))
          .bind(since),
      ),
      rows<{
        session_id: string;
        form_id: string | null;
        title: string | null;
        created_at: number;
        wait: number;
        server: number | null;
        path: string | null;
        is_final: number;
        steps: number | null;
        tools: string | null;
        device: string | null;
        browser: string | null;
        country: string | null;
      }>(
        db
          .prepare(
            `SELECT c.session_id, c.form_id, f.title, c.created_at, ${WAIT} AS wait,
                    COALESCE(c.first_word_ms, c.next_card_ms) AS server, c.path, c.is_final, c.steps, c.tools,
                    c.device, c.browser, c.country
               FROM chat_turn_timings c LEFT JOIN forms f ON f.id = c.form_id
              WHERE ${REAL} AND c.created_at >= ? AND ${WAIT} IS NOT NULL
              ORDER BY wait DESC LIMIT 50`,
          )
          .bind(since),
      ),
      ...DIMENSIONS.map((d) => rows<Row>(db.prepare(percentileSql(d.key, `c.created_at >= ?`)).bind(since))),
    ]);

    const now = strip(overall.find((r) => r.key === "now"));
    const prev = strip(overall.find((r) => r.key === "prev"));
    const byDay = new Map(daily.map((r) => [r.key, r]));
    const rate = (hit: number, input: number) => (input > 0 ? Math.round((hit / input) * 1000) / 10 : 0);

    return c.json({
      totals: {
        ...now,
        prev,
        serverP50: server?.p50 ?? 0,
        cacheHitRate: rate(cache?.hit ?? 0, cache?.input ?? 0),
        prevCacheHitRate: rate(cache?.prev_hit ?? 0, cache?.prev_input ?? 0),
      },
      days: window,
      p50Series: window.map((d) => byDay.get(d)?.p50 ?? 0),
      p95Series: window.map((d) => byDay.get(d)?.p95 ?? 0),
      breakdowns: DIMENSIONS.map((d, i) => ({
        dimension: d.dimension,
        rows: breakdowns[i]!.map((r) => ({ key: r.key, ...strip(r) })),
      })),
      slowest: slowest.map((r) => ({
        sessionId: r.session_id,
        formId: r.form_id,
        formTitle: r.title,
        createdAt: r.created_at,
        waitMs: r.wait,
        serverMs: r.server,
        path: r.path,
        isFinal: r.is_final === 1,
        steps: r.steps,
        tools: r.tools,
        device: r.device,
        browser: r.browser,
        country: r.country,
      })),
    });
  },
);
