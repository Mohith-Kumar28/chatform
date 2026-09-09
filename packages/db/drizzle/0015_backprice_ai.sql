-- Put a cost on the AI calls that were recorded before there was one.
--
-- `ai_generations.cost_usd_micro` has existed since the first migration and was
-- never written: every row said the platform's AI was free. The column is
-- populated at write time now, from `apps/api/src/lib/ai-pricing.ts`, but that
-- only helps from today forward — and a cost chart whose first months are a flat
-- zero does not read as "we were not measuring", it reads as "it was free and
-- then suddenly was not".
--
-- The token counts were always recorded, so the cost is recoverable. This prices
-- the historical rows at the rates in `ai-pricing.ts` as of this migration.
--
-- It is the one place this codebase re-prices the past, and it is defensible
-- only because the alternative is a zero that is definitely wrong rather than an
-- estimate that is approximately right. Rows written from now on carry the cost
-- they were actually incurred at, and must never be rewritten this way again —
-- which is why the guard below is `cost_usd_micro = 0`, not a date.
--
-- Rates are USD per million tokens, expressed in micros:
--   gemini-3.7-flash       input 0.30  output 2.50
--   gemini-3.1-flash-lite  input 0.10  output 0.40
--   anything else          the most expensive we know, so a gap is visible
UPDATE ai_generations
   SET cost_usd_micro = CAST(
         CASE model
           WHEN 'google/gemini-3.1-flash-lite'
             THEN prompt_tokens * 0.10 + completion_tokens * 0.40
           ELSE prompt_tokens * 0.30 + completion_tokens * 2.50
         END AS INTEGER)
 WHERE cost_usd_micro = 0
   AND (prompt_tokens + completion_tokens) > 0;
--> statement-breakpoint

-- Throw away the derived daily metrics so they are recounted from the repriced
-- rows.
--
-- Without this the repricing is invisible: `platform_metrics_daily` was written
-- from the old zero-cost rows, the daily job only ever recomputes *today*, and
-- the backfill only fills days that have no rows at all — so every historical
-- day would keep reporting a cost of zero while the totals beside it, which are
-- read live, reported the real figure. Two numbers on one page disagreeing is
-- worse than both being wrong.
--
-- Safe because this table is entirely derived: the cron refills it from the
-- source tables within a few ticks, oldest day first.
DELETE FROM platform_metrics_daily;
