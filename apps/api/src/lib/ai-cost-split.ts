import type { Bindings } from "../env.js";
import type { TokenUsage } from "./ai.js";

/**
 * What one call's money bought.
 *
 * OpenRouter reports one number per call, the total it charged. That answers
 * "how much" and nothing else: a conversation turn that costs a lot could be a
 * long prompt, a model that thinks before every reply, or a web-search fee, and
 * each one is fixed differently. This splits the reported total into those
 * parts.
 *
 * ## The total is never ours
 *
 * `costUsd` is apportioned, not rebuilt. The weights are OpenRouter's own live
 * rates for the model that ran, read from its public price list and never from
 * a table in this repo (see `0028_openrouter_reported_cost.sql` for what a
 * hand-kept table did). The five parts always add back up to the charged figure
 * exactly. Where the tokens account for less than the charge, the gap goes to
 * `other` (web-search and per-request fees are the ones seen so far). Where
 * they account for more, as when a provider discount goes unreported, every
 * part is scaled down and `other` is zero.
 *
 * `null` whenever the call was unpriced or the price list could not be read.
 * A breakdown with no weights behind it would be a guess drawn as a chart.
 */
export interface CostSplit {
  input: number;
  cached: number;
  output: number;
  reasoning: number;
  other: number;
}

/** OpenRouter's per-model pricing, USD per token (or per request/search). */
export interface ModelRates {
  prompt: number;
  completion: number;
  inputCacheRead?: number;
  inputCacheWrite?: number;
  internalReasoning?: number;
}

export function splitCost(usage: TokenUsage, rates: ModelRates | null): CostSplit | null {
  if (usage.costUsd === null || !rates) return null;
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const reasoningTokens = Math.min(usage.reasoningTokens ?? 0, usage.output);
  const fresh = Math.max(0, usage.input - cacheRead - cacheWrite);

  const priced = {
    input: fresh * rates.prompt,
    cached: cacheRead * (rates.inputCacheRead ?? rates.prompt) + cacheWrite * (rates.inputCacheWrite ?? rates.prompt),
    output: (usage.output - reasoningTokens) * rates.completion,
    reasoning: reasoningTokens * (rates.internalReasoning ?? rates.completion),
  };
  const tokens = priced.input + priced.cached + priced.output + priced.reasoning;
  const total = usage.costUsd;

  if (tokens <= 0) return { input: 0, cached: 0, output: 0, reasoning: 0, other: total };
  // Below a billionth of a dollar the gap is float noise, not a fee.
  if (total >= tokens) {
    const gap = total - tokens;
    return { ...priced, other: gap < 1e-9 ? 0 : gap };
  }
  const k = total / tokens;
  return { input: priced.input * k, cached: priced.cached * k, output: priced.output * k, reasoning: priced.reasoning * k, other: 0 };
}

const RATES_KEY = "openrouter:rates:v1";
const RATES_TTL_SECONDS = 6 * 60 * 60;

/**
 * Per-isolate copy, so a busy isolate reads KV at most once per model per TTL.
 * A plain map holding nothing at start-up; nothing here runs at global scope.
 */
const memo = new Map<string, { rates: ModelRates | null; until: number }>();

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * The live price of one model, as OpenRouter publishes it.
 *
 * The whole list is fetched (it is one public, unauthenticated GET) and cached
 * in KV for six hours, so a price change reaches new rows within the day and a
 * burst of calls costs one request, not one each. Never throws, never blocks a
 * caller for long: the answer on any failure is `null`, and the row goes out
 * unsplit.
 *
 * Under `ENVIRONMENT=test` the network is never touched. A test that wants a
 * split seeds `RATES_KEY` in KV instead.
 */
export async function modelRates(env: Pick<Bindings, "KV_CONFIG" | "ENVIRONMENT">, model: string): Promise<ModelRates | null> {
  const hit = memo.get(model);
  if (hit && hit.until > Date.now()) return hit.rates;

  let table = (await env.KV_CONFIG.get(RATES_KEY, "json").catch(() => null)) as Record<string, ModelRates> | null;
  if (!table && env.ENVIRONMENT !== "test") {
    table = await fetchRates();
    if (table) await env.KV_CONFIG.put(RATES_KEY, JSON.stringify(table), { expirationTtl: RATES_TTL_SECONDS }).catch(() => {});
  }
  const rates = table?.[model] ?? null;
  memo.set(model, { rates, until: Date.now() + (table ? RATES_TTL_SECONDS * 1000 : 60_000) });
  return rates;
}

async function fetchRates(): Promise<Record<string, ModelRates> | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { id: string; pricing?: Record<string, unknown> }[] };
    const table: Record<string, ModelRates> = {};
    for (const m of body.data ?? []) {
      const p = m.pricing ?? {};
      const prompt = num(p.prompt);
      const completion = num(p.completion);
      if (prompt === undefined || completion === undefined) continue;
      table[m.id] = {
        prompt,
        completion,
        inputCacheRead: num(p.input_cache_read),
        inputCacheWrite: num(p.input_cache_write),
        internalReasoning: num(p.internal_reasoning),
      };
    }
    return Object.keys(table).length > 0 ? table : null;
  } catch (err) {
    console.error("openrouter_rates_failed", { message: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/** Exposed for tests: the KV key a test seeds, and a way to forget the memo. */
export const RATES_KV_KEY = RATES_KEY;
export function forgetRates(): void {
  memo.clear();
}
