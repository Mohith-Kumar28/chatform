-- Where a slow reply's time went, call by call.
-- `chat_turn_timings` said how long a turn took and how many model round trips
-- it made, but not how long each one took, who served it, or why there was a
-- second one. Those are the three questions every slow reply raises, and the
-- only place they could be answered was OpenRouter's own log, one generation at
-- a time. All nullable: turns that ran no model have nothing to put here, and
-- neither do rows written before this.
ALTER TABLE `chat_turn_timings` ADD COLUMN `prep_ms` integer;
--> statement-breakpoint
ALTER TABLE `chat_turn_timings` ADD COLUMN `model_ms` integer;
--> statement-breakpoint
ALTER TABLE `chat_turn_timings` ADD COLUMN `extract_ms` integer;
--> statement-breakpoint
ALTER TABLE `chat_turn_timings` ADD COLUMN `model` text;
--> statement-breakpoint
ALTER TABLE `chat_turn_timings` ADD COLUMN `provider` text;
--> statement-breakpoint
ALTER TABLE `chat_turn_timings` ADD COLUMN `second_step` text;
--> statement-breakpoint
ALTER TABLE `chat_turn_timings` ADD COLUMN `stalls` integer;
--> statement-breakpoint
ALTER TABLE `chat_turn_timings` ADD COLUMN `steps_json` text;
