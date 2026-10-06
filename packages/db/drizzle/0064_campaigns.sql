-- Campaigns become a thing of their own, and a link knows which one it is.
--
-- Until now a campaign was only the `utm_campaign` string on a saved link, so
-- two links in one campaign could not be told apart: the console joined traffic
-- and sign-ups on that string and printed the same numbers on both rows.
--
-- `campaigns` is the effort itself: a name a person chose, the key that goes in
-- `utm_campaign`, when it runs, what it cost. `campaign_links` rows hang off it,
-- one per place the link is posted, each with a short code (`chatform.in/r/<code>`,
-- answered by the edge worker) and the channel it was made for. The link's id
-- rides the redirect as `utm_id`, lands on the visit in TrafficDO and on the
-- sign-up row here, which is what finally gives each link its own numbers.
--
-- Every link that already exists is kept: one campaign per distinct campaign
-- string, named after it, and a code cut from the link's own id so the backfill
-- needs nothing random. Their old long addresses carry no `utm_id`, so they
-- count for the campaign and not for the link until they are copied again.
--
-- The two indexes on `user_sign_ins` are for the campaign and link filters the
-- console now runs; the one on `payments` is for revenue per organization,
-- which had only the unique payment id to go on.

CREATE TABLE `campaigns` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `key` text NOT NULL,
  `notes` text,
  `status` text NOT NULL DEFAULT 'active',
  `starts_at` integer,
  `ends_at` integer,
  `spend_cents` integer,
  `spend_currency` text NOT NULL DEFAULT 'USD',
  `created_by` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_campaigns_key` ON `campaigns` (`key`);
--> statement-breakpoint
INSERT INTO `campaigns` (`id`, `name`, `key`, `status`, `created_at`, `updated_at`)
SELECT 'cmp_' || substr(MIN(`id`), 4), `campaign`, `campaign`,
       CASE WHEN SUM(CASE WHEN `archived_at` IS NULL THEN 1 ELSE 0 END) > 0 THEN 'active' ELSE 'archived' END,
       MIN(`created_at`), MIN(`created_at`)
  FROM `campaign_links` GROUP BY `campaign`;
--> statement-breakpoint
ALTER TABLE `campaign_links` ADD `campaign_id` text;
--> statement-breakpoint
ALTER TABLE `campaign_links` ADD `code` text;
--> statement-breakpoint
ALTER TABLE `campaign_links` ADD `label` text;
--> statement-breakpoint
ALTER TABLE `campaign_links` ADD `channel` text;
--> statement-breakpoint
ALTER TABLE `campaign_links` ADD `updated_at` integer;
--> statement-breakpoint
UPDATE `campaign_links`
   SET `campaign_id` = (SELECT `id` FROM `campaigns` WHERE `key` = `campaign_links`.`campaign`),
       `code` = lower(substr(`id`, 4, 8)),
       `label` = `name`,
       `channel` = 'other',
       `updated_at` = `created_at`;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_campaign_links_code` ON `campaign_links` (`code`);
--> statement-breakpoint
CREATE INDEX `idx_campaign_links_campaign_id` ON `campaign_links` (`campaign_id`);
--> statement-breakpoint
ALTER TABLE `user_sign_ins` ADD `content` text;
--> statement-breakpoint
ALTER TABLE `user_sign_ins` ADD `link_id` text;
--> statement-breakpoint
CREATE INDEX `idx_user_sign_ins_campaign_created` ON `user_sign_ins` (`campaign`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_user_sign_ins_link_created` ON `user_sign_ins` (`link_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `idx_payments_org` ON `payments` (`organization_id`, `status`);
