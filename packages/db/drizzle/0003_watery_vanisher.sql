CREATE TABLE `entitlement_overrides` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`reason` text,
	`expires_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_override_org_key` ON `entitlement_overrides` (`organization_id`,`kind`,`key`);--> statement-breakpoint
CREATE TABLE `feature_access_log` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`feature` text NOT NULL,
	`surface` text,
	`first_denied_at` integer NOT NULL,
	`last_denied_at` integer NOT NULL,
	`denial_count` integer DEFAULT 1 NOT NULL,
	`converted_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_fal_org_feature` ON `feature_access_log` (`organization_id`,`feature`);--> statement-breakpoint
ALTER TABLE `plans` ADD `slug` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `dodo_product_monthly_id` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `dodo_product_yearly_id` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `seat_addon_product_id` text;--> statement-breakpoint
ALTER TABLE `plans` ADD `price_yearly_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` ADD `seat_price_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `plans` ADD `features_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `dodo_customer_id` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `cycle` text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `trial_ends_at` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `grace_until` integer;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `scheduled_plan_id` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `scheduled_at` integer;--> statement-breakpoint
-- Normalize the legacy role name onto the new four-role set (owner/admin/editor/viewer).
-- `member` stays registered as an alias in lib/permissions.ts, so an un-migrated row or a
-- Better Auth internal default still resolves to the same permissions.
UPDATE `members` SET `role` = 'editor' WHERE `role` = 'member';--> statement-breakpoint
-- Mirror the primary key into `slug` for rows that predate the column.
UPDATE `plans` SET `slug` = `id` WHERE `slug` IS NULL;
