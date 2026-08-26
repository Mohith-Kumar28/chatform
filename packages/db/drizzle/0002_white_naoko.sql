CREATE TABLE `otp_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`destination` text NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`send_count` integer DEFAULT 1 NOT NULL,
	`consumed_at` integer,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_otp_session` ON `otp_challenges` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_otp_expires` ON `otp_challenges` (`expires_at`);--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `respondent_identity` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `respondent_provider` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `respondent_subject` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `respondent_email` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `respondent_phone` text;--> statement-breakpoint
ALTER TABLE `submissions` ADD `respondent_name` text;--> statement-breakpoint
CREATE INDEX `idx_submissions_form_respondent` ON `submissions` (`form_id`,`respondent_provider`,`respondent_subject`);