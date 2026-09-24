-- What each AI call's money was spent ON, not just how much.
--
-- `cost_usd` answers "how much". It cannot answer the question the admin page is actually asked:
-- is a conversation turn expensive because its prompt is long, because the model thinks a lot
-- before replying, because tools make it go round the loop again, or because of a per-request
-- fee like the `web` plugin's searches? Those need the token split the provider already reports
-- and a price for each slice.
--
-- ── Token detail (INTEGER, nullable) ──
--
-- Slices of `prompt_tokens` / `completion_tokens`, never additions to them. NULL means the
-- provider did not say, which is not zero.
--
--   cache_read_tokens / cache_write_tokens   input served from, or written to, the prompt cache
--   reasoning_tokens                         output spent thinking, billed but never shown
--   steps / tool_calls                       model round trips, and the tool calls behind them
--
-- ── Cost split (REAL, nullable) ──
--
-- `cost_usd` stays the number OpenRouter charged, untouched. The split apportions THAT figure,
-- so the five parts always add back up to it exactly:
--
--   cost_input_usd       fresh (uncached) input
--   cost_cached_usd      cache reads and writes
--   cost_output_usd      visible reply
--   cost_reasoning_usd   thinking tokens
--   cost_other_usd       what no token accounts for: web-search fees, per-request fees
--
-- The weights come from OpenRouter's live price list (`/api/v1/models`), read when the row is
-- written, never from a table in this repo. `0028` exists because a hand-kept rate table went
-- stale; weighting a reported total by the rates the same source publishes today is not that.
-- NULL when the call was unpriced or the price list could not be read.
--
-- `cost_tool_steps_usd` is a different cut of the same money, and is reported rather than
-- apportioned: OpenRouter's own cost for every step after the first, i.e. what the tool round trips
-- cost on their own. It overlaps the five parts; it is not a sixth.
--
-- New columns only, all nullable: rows written before this read as "not broken down", which is
-- the truth, and nothing is backfilled because the token detail was never stored.

ALTER TABLE `ai_generations` ADD COLUMN `cache_read_tokens` integer;
--> statement-breakpoint
ALTER TABLE `ai_generations` ADD COLUMN `cache_write_tokens` integer;
--> statement-breakpoint
ALTER TABLE `ai_generations` ADD COLUMN `reasoning_tokens` integer;
--> statement-breakpoint
ALTER TABLE `ai_generations` ADD COLUMN `steps` integer;
--> statement-breakpoint
ALTER TABLE `ai_generations` ADD COLUMN `tool_calls` integer;
--> statement-breakpoint
ALTER TABLE `ai_generations` ADD COLUMN `cost_input_usd` real;
--> statement-breakpoint
ALTER TABLE `ai_generations` ADD COLUMN `cost_cached_usd` real;
--> statement-breakpoint
ALTER TABLE `ai_generations` ADD COLUMN `cost_output_usd` real;
--> statement-breakpoint
ALTER TABLE `ai_generations` ADD COLUMN `cost_reasoning_usd` real;
--> statement-breakpoint
ALTER TABLE `ai_generations` ADD COLUMN `cost_other_usd` real;
--> statement-breakpoint
ALTER TABLE `ai_generations` ADD COLUMN `cost_tool_steps_usd` real;
