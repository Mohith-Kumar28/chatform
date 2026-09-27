-- One row per respondent turn: how long they waited, and what the turn did.
-- The session writes its half when the turn ends; the browser reports the wait
-- it actually saw (network included) as `client_ms`. Either can land first, so
-- both upsert on (session_id, turn_id) and every server column is nullable.
CREATE TABLE `chat_turn_timings` (
	`session_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`organization_id` text,
	`form_id` text,
	`created_at` integer NOT NULL,
	`is_test` integer DEFAULT 0 NOT NULL,
	`kind` text,
	`mode` text,
	`path` text,
	`is_final` integer DEFAULT 0 NOT NULL,
	`block_type` text,
	`gate_ms` integer,
	`first_word_ms` integer,
	`next_card_ms` integer,
	`total_ms` integer,
	`steps` integer,
	`tools` text,
	`input_tokens` integer,
	`cache_read_tokens` integer,
	`device` text,
	`browser` text,
	`os` text,
	`country` text,
	`client_ms` integer,
	PRIMARY KEY (`session_id`, `turn_id`)
);
CREATE INDEX `idx_turn_timings_created` ON `chat_turn_timings` (`created_at`);
