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

/** One model call inside a turn, as `TurnStep` stores it. */
const Call = z.object({
  model: z.string().nullable(),
  provider: z.string().nullable(),
  firstMs: z.number().nullable(),
  ms: z.number(),
  tools: z.array(z.string()),
  id: z.string().nullable(),
  stalled: z.boolean(),
});

const LatencyResponse = z.object({
  totals: Percentiles.extend({
    prev: Percentiles,
    /** Turns where the model ran, on their own: the instant ones outnumber and hide them. */
    ai: Percentiles.extend({ prev: Percentiles }),
    /** Median of the server's own time to first word, so network can be told apart from us. */
    serverP50: z.number(),
    /** Cached input over all input, on turns the model ran. */
    cacheHitRate: z.number(),
    prevCacheHitRate: z.number(),
  }),
  days: z.array(z.string()),
  p50Series: z.array(z.number()),
  p95Series: z.array(z.number()),
  aiP50Series: z.array(z.number()),
  /** Median time per part of an AI reply, over the turns that recorded it. */
  parts: z.array(z.object({ key: z.string(), ms: z.number(), turns: z.number() })),
  /** Every model call in the period, by who served it. */
  calls: z.array(
    z.object({
      model: z.string(),
      provider: z.string(),
      calls: z.number(),
      firstP50: z.number(),
      firstP90: z.number(),
      p50: z.number(),
      p90: z.number(),
      stalls: z.number(),
    }),
  ),
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
      stalls: z.number(),
      calls: z.array(Call),
    }),
  ),
});

/** OpenRouter's own account of one model call: who was tried, in what order, and how each answered. */
const GenerationResponse = z.object({
  generation: z
    .object({
      id: z.string(),
      model: z.string().nullable(),
      provider: z.string().nullable(),
      firstTokenMs: z.number().nullable(),
      totalMs: z.number().nullable(),
      promptTokens: z.number().nullable(),
      completionTokens: z.number().nullable(),
      reasoningTokens: z.number().nullable(),
      cachedTokens: z.number().nullable(),
      attempts: z.array(z.object({ provider: z.string().nullable(), status: z.number().nullable(), ms: z.number().nullable() })),
    })
    .nullable(),
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

/** Nearest-rank, the same rule as `percentileSql`, for the few things worked out here instead of in SQL. */
function pct(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((sorted.length * p) / 100) - 1)]!;
}

type StoredCall = z.infer<typeof Call>;

/** `steps_json` as written by `writeTurnTiming`. Old rows have none, and a bad one is no calls. */
function callsOf(json: string | null): StoredCall[] {
  if (!json) return [];
  try {
    const list = JSON.parse(json) as Partial<StoredCall>[];
    return list.map((c) => ({
      model: c.model ?? null,
      provider: c.provider ?? null,
      firstMs: c.firstMs ?? null,
      ms: c.ms ?? 0,
      tools: c.tools ?? [],
      id: c.id ?? null,
      stalled: c.stalled === true,
    }));
  } catch {
    return [];
  }
}

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
  {
    dimension: "Provider",
    key: `CASE WHEN c.steps IS NULL THEN 'No model' ELSE COALESCE(c.provider, 'Not recorded') END`,
  },
  {
    dimension: "Why a second call",
    key: `CASE WHEN c.steps IS NULL THEN 'No model' WHEN c.steps <= 1 THEN 'one_call' ELSE COALESCE(c.second_step, 'Not recorded') END`,
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
    const [overall, ai, aiDaily, aiTurns, server, cache, daily, slowest, ...breakdowns] = await Promise.all([
      rows<Row>(db.prepare(percentileSql(period, `c.created_at >= ?`)).bind(prevSince)),
      rows<Row>(db.prepare(percentileSql(period, `c.path = 'agent' AND c.created_at >= ?`)).bind(prevSince)),
      rows<Row>(
        db
          .prepare(
            percentileSql(`strftime('%Y-%m-%d', c.created_at / 1000, 'unixepoch')`, `c.path = 'agent' AND c.created_at >= ?`, 400),
          )
          .bind(since),
      ),
      // Read whole and added up here: each row carries a list of calls, and
      // there are few enough AI turns in any period to hold.
      rows<{
        gate_ms: number | null;
        prep_ms: number | null;
        model_ms: number | null;
        client_ms: number | null;
        server: number | null;
        steps_json: string | null;
      }>(
        db
          .prepare(
            `SELECT c.gate_ms, c.prep_ms, c.model_ms, c.client_ms, COALESCE(c.first_word_ms, c.next_card_ms) AS server, c.steps_json
               FROM chat_turn_timings c
              WHERE ${REAL} AND c.path = 'agent' AND c.created_at >= ?
              ORDER BY c.created_at DESC LIMIT 5000`,
          )
          .bind(since),
      ),
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
        stalls: number | null;
        steps_json: string | null;
      }>(
        db
          .prepare(
            `SELECT c.session_id, c.form_id, f.title, c.created_at, ${WAIT} AS wait,
                    COALESCE(c.first_word_ms, c.next_card_ms) AS server, c.path, c.is_final, c.steps, c.tools,
                    c.device, c.browser, c.country, c.stalls, c.steps_json
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
    const aiByDay = new Map(aiDaily.map((r) => [r.key, r]));

    // Where an AI reply's time goes: the median of each part, over the turns
    // that have it. Rows from before the parts were recorded have no model
    // split, so those parts are counted over fewer turns, and say so.
    const part = (key: string, values: (number | null)[]) => {
      const known = values.filter((v): v is number => v !== null && v >= 0);
      return { key, ms: pct(known, 50), turns: known.length };
    };
    const turnCalls = aiTurns.map((t) => callsOf(t.steps_json));
    const parts = [
      part(
        "gate",
        aiTurns.map((t) => t.gate_ms),
      ),
      part(
        "prep",
        aiTurns.map((t) => t.prep_ms),
      ),
      part(
        "first_call",
        turnCalls.map((c) => (c.length ? c[0]!.ms : null)),
      ),
      part(
        "later_calls",
        turnCalls.map((c) => (c.length > 1 ? c.slice(1).reduce((n, x) => n + x.ms, 0) : null)),
      ),
      part(
        "network",
        aiTurns.map((t) => (t.client_ms !== null && t.server !== null ? Math.max(0, t.client_ms - t.server) : null)),
      ),
    ];

    const groups = new Map<string, { model: string; provider: string; first: number[]; total: number[]; stalls: number }>();
    for (const call of turnCalls.flat()) {
      const model = call.model ?? "Not recorded";
      const provider = call.provider ?? "Not recorded";
      const key = `${model}\u0000${provider}`;
      const g = groups.get(key) ?? { model, provider, first: [], total: [], stalls: 0 };
      groups.set(key, g);
      if (call.stalled) {
        g.stalls += 1;
        continue;
      }
      g.total.push(call.ms);
      if (call.firstMs !== null) g.first.push(call.firstMs);
    }
    const calls = [...groups.values()]
      .map((g) => ({
        model: g.model,
        provider: g.provider,
        calls: g.total.length + g.stalls,
        firstP50: pct(g.first, 50),
        firstP90: pct(g.first, 90),
        p50: pct(g.total, 50),
        p90: pct(g.total, 90),
        stalls: g.stalls,
      }))
      .sort((a, b) => b.calls - a.calls);
    const rate = (hit: number, input: number) => (input > 0 ? Math.round((hit / input) * 1000) / 10 : 0);

    return c.json({
      totals: {
        ...now,
        prev,
        ai: { ...strip(ai.find((r) => r.key === "now")), prev: strip(ai.find((r) => r.key === "prev")) },
        serverP50: server?.p50 ?? 0,
        cacheHitRate: rate(cache?.hit ?? 0, cache?.input ?? 0),
        prevCacheHitRate: rate(cache?.prev_hit ?? 0, cache?.prev_input ?? 0),
      },
      days: window,
      p50Series: window.map((d) => byDay.get(d)?.p50 ?? 0),
      p95Series: window.map((d) => byDay.get(d)?.p95 ?? 0),
      aiP50Series: window.map((d) => aiByDay.get(d)?.p50 ?? 0),
      parts,
      calls,
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
        stalls: r.stalls ?? 0,
        calls: callsOf(r.steps_json),
      })),
    });
  },
);

/**
 * One model call, as OpenRouter recorded it.
 *
 * Our own timing says how long a call took. Only OpenRouter knows what it did
 * with that time: a provider it tried first that refused or hung, and the one
 * it fell back to, are both invisible from the response. Asked for one call at
 * a time, from the slowest replies, and never stored.
 */
latencyRouter.get(
  "/admin/latency/generation",
  validator("query", z.object({ id: z.string().regex(/^gen-[A-Za-z0-9_-]{4,80}$/) })),
  describeRoute({
    tags: ["admin"],
    summary: "OpenRouter's record of one model call: the providers it tried and how each answered",
    responses: {
      200: { description: "The generation", content: { "application/json": { schema: resolver(GenerationResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const { id } = c.req.valid("query");
    const key = c.env.OPENROUTER_API_KEY;
    if (!key) return c.json({ generation: null });
    type Raw = {
      id: string;
      model?: string | null;
      provider_name?: string | null;
      latency?: number | null;
      generation_time?: number | null;
      native_tokens_prompt?: number | null;
      native_tokens_completion?: number | null;
      native_tokens_reasoning?: number | null;
      native_tokens_cached?: number | null;
      provider_responses?: { provider_name?: string | null; status?: number | null; latency?: number | null }[] | null;
    };
    let raw: Raw | null = null;
    try {
      const res = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(id)}`, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) raw = ((await res.json()) as { data?: Raw }).data ?? null;
    } catch {
      raw = null;
    }
    if (!raw) return c.json({ generation: null });
    return c.json({
      generation: {
        id: raw.id,
        model: raw.model ?? null,
        provider: raw.provider_name ?? null,
        firstTokenMs: raw.latency ?? null,
        totalMs: raw.generation_time ?? null,
        promptTokens: raw.native_tokens_prompt ?? null,
        completionTokens: raw.native_tokens_completion ?? null,
        reasoningTokens: raw.native_tokens_reasoning ?? null,
        cachedTokens: raw.native_tokens_cached ?? null,
        attempts: (raw.provider_responses ?? []).map((a) => ({
          provider: a.provider_name ?? null,
          status: a.status ?? null,
          ms: a.latency ?? null,
        })),
      },
    });
  },
);
