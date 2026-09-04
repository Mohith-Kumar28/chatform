CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`form_id` text NOT NULL,
	`requested_by` text,
	`actor_type` text DEFAULT 'user' NOT NULL,
	`format` text DEFAULT 'csv' NOT NULL,
	`filters_json` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`r2_key` text,
	`row_count` integer,
	`bytes` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`expires_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_exports_org_created` ON `exports` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_exports_expiry` ON `exports` (`status`,`expires_at`);--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `source` text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `is_test` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `token_rotated_at` integer;--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_expiry` ON `chat_sessions` (`status`,`expires_at`);--> statement-breakpoint
ALTER TABLE `idempotency_keys` ADD `body_hash` text;--> statement-breakpoint
ALTER TABLE `idempotency_keys` ADD `expires_at` integer;--> statement-breakpoint
CREATE INDEX `idx_idem_expires` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
ALTER TABLE `submissions` ADD `source` text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `is_test` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `submissions` ADD `updated_at` integer;--> statement-breakpoint
ALTER TABLE `submissions` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `submissions` ADD `api_key_id` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `partial_notified_at` integer;--> statement-breakpoint
CREATE INDEX `idx_submissions_form_updated` ON `submissions` (`form_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_submissions_form_source` ON `submissions` (`form_id`,`source`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_submissions_expiry` ON `submissions` (`status`,`expires_at`);--> statement-breakpoint
ALTER TABLE `webhook_deliveries` ADD `message_json` text;--> statement-breakpoint
-- Backfill `updated_at` so the recency cursor and `updated_since` filter have a
-- value for every row that existed before this column did. A completed response
-- was last touched when it completed; anything else, when it started.
UPDATE `submissions` SET `updated_at` = COALESCE(`completed_at`, `started_at`) WHERE `updated_at` IS NULL;
