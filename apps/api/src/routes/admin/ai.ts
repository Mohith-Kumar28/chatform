import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import { z } from "zod";
import type { Bindings } from "../../env.js";
import type { PlatformAdminVars } from "../../lib/platform-admin.js";
import {
  DAY_MS,
  MRR_CENTS,
  NOT_COMPED,
  OpsRows,
  PLAN_OF_ORG,
  RANGES,
  RangeQuery,
  dayKeys,
  loadMetrics,
  rows,
  seriesOf,
  sumByDimension,
  type RangeKey,
} from "./shared.js";

/**
 * What the product costs to run, and who it is losing money on.
 *
 * Every response on this platform is an LLM conversation, so AI is the marginal
 * cost of the whole business — the one line that scales with usage rather than
 * with headcount. This page exists to answer one question before it becomes a
 * problem: is any account consuming more in tokens than it pays us?
 *
 * The margin table is where that lands. Cost per org against revenue per org,
 * with the free-tier accounts that cost real money separated out — a free plan
 * is a marketing expense, and an expense worth knowing the size of.
 */

export const aiRouter = new Hono<{ Bindings: Bindings; Variables: Partial<PlatformAdminVars> }>();

const AiResponse = z.object({
  days: z.array(z.string()),
  costSeries: z.array(z.number()),
  tokenSeries: z.array(z.number()),
  callSeries: z.array(z.number()),
  byModel: z.array(z.object({ key: z.string(), value: z.number() })),
  byKind: z.array(z.object({ key: z.string(), value: z.number() })),
  totals: z.object({
    costMicro: z.number(),
    tokens: z.number(),
    calls: z.number(),
    errors: z.number(),
    errorRate: z.number(),
    costPerConversationMicro: z.number(),
    conversations: z.number(),
  }),
  latency: z.array(
    z.object({ model: z.string(), calls: z.number(), p50: z.number(), p90: z.number(), errorRate: z.number() }),
  ),
  topSpenders: OpsRows,
  lossMakers: OpsRows,
});

/**
 * Percentiles, the way SQLite can do them.
 *
 * There is no `percentile()`, so latency is read off an ordered scan with an
 * OFFSET — the same trick `analytics-service.ts` uses for median completion
 * time. Bounded to the window and to one model at a time, so it stays an
 * indexed range rather than a table scan.
 */
async function latencyFor(env: Bindings, model: string, since: number) {
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END), 0) AS errors
       FROM ai_generations WHERE model = ? AND created_at >= ? AND latency_ms IS NOT NULL`,
  )
    .bind(model, since)
    .first<{ n: number; errors: number }>();
  const n = count?.n ?? 0;
  if (n === 0) return { model, calls: 0, p50: 0, p90: 0, errorRate: 0 };

  const at = async (offset: number) => {
    const row = await env.DB.prepare(
      `SELECT latency_ms AS v FROM ai_generations
        WHERE model = ? AND created_at >= ? AND latency_ms IS NOT NULL
        ORDER BY latency_ms LIMIT 1 OFFSET ?`,
    )
      .bind(model, since, offset)
      .first<{ v: number }>();
    return row?.v ?? 0;
  };

  return {
    model,
    calls: n,
    p50: await at(Math.floor(n / 2)),
    p90: await at(Math.min(n - 1, Math.floor(n * 0.9))),
    errorRate: Math.round(((count?.errors ?? 0) / n) * 1000) / 10,
  };
}

aiRouter.get(
  "/admin/ai",
  validator("query", RangeQuery),
  describeRoute({
    tags: ["admin"],
    summary: "AI spend, latency, and which accounts cost more than they pay",
    responses: {
      200: { description: "AI cost", content: { "application/json": { schema: resolver(AiResponse) } } },
      404: { description: "Not an admin" },
    },
  }),
  async (c) => {
    const range = c.req.valid("query").range as RangeKey;
    const days = RANGES[range];
    const window = dayKeys(days);
    const windowSet = new Set(window);
    const since = Date.now() - days * DAY_MS;

    const metrics = await loadMetrics(c.env, window[0]!, window[window.length - 1]!);

    const [totals, conversations, models, topSpenders] = await Promise.all([
      c.env.DB.prepare(
        `SELECT COUNT(*) AS calls,
                COALESCE(SUM(prompt_tokens + completion_tokens), 0) AS tokens,
                COALESCE(SUM(cost_usd_micro), 0) AS cost,
                COALESCE(SUM(CASE WHEN status != 'ok' THEN 1 ELSE 0 END), 0) AS errors
           FROM ai_generations WHERE created_at >= ?`,
      )
        .bind(since)
        .first<{ calls: number; tokens: number; cost: number; errors: number }>(),
      c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM chat_sessions WHERE created_at >= ? AND is_test = 0`,
      )
        .bind(since)
        .first<{ n: number }>(),
      rows<{ model: string }>(
        c.env.DB.prepare(`SELECT DISTINCT model FROM ai_generations WHERE created_at >= ? LIMIT 12`).bind(since),
      ),
      /**
       * Cost against revenue, per account.
       *
       * `mrr_cents` is monthly and the cost window is `range`, so the two are
       * only directly comparable at 30 days — the UI says so rather than
       * pretending otherwise. What is unambiguous at any range is the ordering:
       * these are the accounts the AI bill is being run up by.
       */
      rows(
        c.env.DB.prepare(
          `SELECT o.id AS org_id, o.name,
                  COALESCE((${PLAN_OF_ORG}), 'free') AS plan,
                  COALESCE(SUM(g.prompt_tokens + g.completion_tokens), 0) AS tokens,
                  COALESCE(SUM(g.cost_usd_micro), 0) AS cost_micro,
                  COUNT(g.id) AS calls,
                  COALESCE((SELECT ${MRR_CENTS} FROM subscriptions s JOIN plans p ON p.id = s.plan_id
                             WHERE s.organization_id = o.id AND s.status IN ('active','trialing') AND ${NOT_COMPED}
                             ORDER BY s.created_at DESC LIMIT 1), 0) AS mrr_cents,
                  (SELECT COUNT(*) FROM chat_sessions cs WHERE cs.organization_id = o.id AND cs.is_test = 0 AND cs.created_at >= ?1) AS conversations
             FROM ai_generations g
             JOIN organizations o ON o.id = g.organization_id
            WHERE g.created_at >= ?1
            GROUP BY o.id
            ORDER BY cost_micro DESC
            LIMIT 40`,
        ).bind(since),
      ),
    ]);

    const latency = await Promise.all(models.map((m) => latencyFor(c.env, m.model, since)));

    /**
     * Losing money on an account is cost exceeding revenue over the same month.
     *
     * A free account with any cost at all qualifies by definition, which would
     * make the list useless — so free accounts only appear once they have cost
     * something worth noticing. A cent of Gemini is not a business problem.
     */
    const FREE_FLOOR_MICRO = 50_000; // $0.05
    const lossMakers = topSpenders
      .filter((r) => {
        const cost = Number(r.cost_micro ?? 0);
        const revenueMicro = Number(r.mrr_cents ?? 0) * 10_000; // cents → USD micros
        return revenueMicro > 0 ? cost > revenueMicro : cost >= FREE_FLOOR_MICRO;
      })
      .slice(0, 20);

    const calls = totals?.calls ?? 0;
    const convos = conversations?.n ?? 0;
    const cost = totals?.cost ?? 0;

    return c.json({
      days: window,
      costSeries: seriesOf(metrics, "ai_cost_micro", window),
      tokenSeries: seriesOf(metrics, "ai_tokens", window),
      callSeries: seriesOf(metrics, "ai_calls", window),
      byModel: sumByDimension(metrics, "ai_cost_micro_by_model", windowSet),
      byKind: sumByDimension(metrics, "ai_calls_by_kind", windowSet),
      totals: {
        costMicro: cost,
        tokens: totals?.tokens ?? 0,
        calls,
        errors: totals?.errors ?? 0,
        errorRate: calls > 0 ? Math.round(((totals?.errors ?? 0) / calls) * 1000) / 10 : 0,
        conversations: convos,
        // The unit-economics number: what one conversation costs to run.
        costPerConversationMicro: convos > 0 ? Math.round(cost / convos) : 0,
      },
      latency: latency.sort((a, b) => b.calls - a.calls),
      topSpenders,
      lossMakers,
    });
  },
);
