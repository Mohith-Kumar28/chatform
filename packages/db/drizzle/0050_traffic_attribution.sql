-- Where each sign-up came from, as columns rather than JSON, so the platform
-- console can group sign-ups by campaign and channel with an index instead of
-- parsing `context_json` row by row. Filled at sign-up by
-- `apps/api/src/lib/user-context.ts`; older rows are classified by the cron
-- (`backfillSignupAttribution`), because the classifier is code, not SQL.
-- `channel` NULL means "not classified yet".
ALTER TABLE `user_sign_ins` ADD `visitor_id` text;
--> statement-breakpoint
ALTER TABLE `user_sign_ins` ADD `channel` text;
--> statement-breakpoint
ALTER TABLE `user_sign_ins` ADD `source` text;
--> statement-breakpoint
ALTER TABLE `user_sign_ins` ADD `medium` text;
--> statement-breakpoint
ALTER TABLE `user_sign_ins` ADD `campaign` text;
--> statement-breakpoint
ALTER TABLE `user_sign_ins` ADD `landing_path` text;
--> statement-breakpoint
CREATE INDEX `idx_user_sign_ins_kind_created` ON `user_sign_ins` (`kind`, `created_at`);
--> statement-breakpoint
-- Campaign links made in the console's link builder. The link itself carries
-- the UTMs; this row only names it and remembers it, so the Campaigns page can
-- list links that have not had a visitor yet.
CREATE TABLE `campaign_links` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `destination` text NOT NULL,
  `source` text NOT NULL,
  `medium` text NOT NULL,
  `campaign` text NOT NULL,
  `content` text,
  `created_by` text,
  `created_at` integer NOT NULL,
  `archived_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_links_campaign` ON `campaign_links` (`campaign`);
