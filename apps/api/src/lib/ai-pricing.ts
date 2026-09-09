/**
 * What a model call actually costs us, in USD micros.
 *
 * `ai_generations.cost_usd_micro` has existed since the first migration and has
 * never been anything but its default of 0 — every row said the platform's AI was
 * free. Tokens were recorded, so the number was recoverable in principle, but only
 * by somebody who also knew which model was which price on the day it ran. A rate
 * that lives beside the models it prices is the version that stays true.
 *
 * Rates are OpenRouter list prices in USD per million tokens, and they move. They
 * are deliberately a plain table rather than a fetch: an API call in the hot path
 * of every conversation turn, to price a row nobody reads until tomorrow, is the
 * wrong trade. When a price changes, change it here — historical rows keep the
 * cost they were written with, which is what makes a cost chart a record of what
 * was spent rather than a re-pricing of the past at today's rates.
 */

interface Rate {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

/** Keyed by the OpenRouter model slug written into `ai_generations.model`. */
const RATES: Record<string, Rate> = {
  "google/gemini-3.7-flash": { input: 0.3, output: 2.5 },
  "google/gemini-3.1-flash-lite": { input: 0.1, output: 0.4 },
};

/**
 * The fallback, for a model that reaches production before this table does.
 *
 * Deliberately the most expensive rate we know rather than zero. A model missing
 * from the table should make a cost chart look alarming and get fixed, not
 * quietly report that the interviews were free.
 */
const FALLBACK: Rate = { input: 0.3, output: 2.5 };

/** Cost of one call, in USD micros (USD × 1,000,000), rounded to an integer. */
export function costUsdMicro(model: string, promptTokens: number, completionTokens: number): number {
  const rate = RATES[model] ?? FALLBACK;
  const usd = (promptTokens * rate.input + completionTokens * rate.output) / 1_000_000;
  return Math.round(usd * 1_000_000);
}

export function isKnownModel(model: string): boolean {
  return model in RATES;
}
