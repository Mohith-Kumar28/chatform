PRAGMA defer_foreign_keys=on;--> statement-breakpoint
CREATE TABLE `__new_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`config_id` text DEFAULT 'default' NOT NULL,
	`reference_id` text NOT NULL,
	`name` text,
	`start` text,
	`prefix` text,
	`key` text NOT NULL,
	`user_id` text,
	`created_by` text,
	`refill_interval` integer,
	`refill_amount` integer,
	`last_refill_at` integer,
	`enabled` integer DEFAULT true,
	`rate_limit_enabled` integer DEFAULT true,
	`rate_limit_max` integer,
	`rate_limit_time_window` integer,
	`request_count` integer DEFAULT 0 NOT NULL,
	`remaining` integer,
	`last_request` integer,
	`expires_at` integer,
	`permissions` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`organization_id` text,
	`workspace_id` text,
	`scopes` text,
	`environment` text DEFAULT 'live' NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Backfill rather than copy: `config_id`, `reference_id`, `created_by` and
-- `request_count` do not exist on the old table.
--
-- `reference_id` prefers the stored organization_id and falls back to the
-- creator's oldest membership, which is exactly how `resolveOrgId` used to
-- answer for these keys. A row where neither resolves is disabled below — a key
-- that cannot be attributed to an organization cannot be authorized either.
--
-- `config_id` is the literal 'default', not 'sk_live': that config is the
-- plugin's default one, and `configIdMatches` treats NULL and 'default' as the
-- same, so nothing has to be right about this column for an old key to verify.
INSERT INTO `__new_api_keys` (
  id, config_id, reference_id, name, start, prefix, key, user_id, created_by,
  refill_interval, refill_amount, last_refill_at, enabled, rate_limit_enabled,
  rate_limit_max, rate_limit_time_window, request_count, remaining, last_request,
  expires_at, permissions, metadata, created_at, updated_at,
  organization_id, workspace_id, scopes, environment, last_used_at)
SELECT
  k.id,
  'default',
  COALESCE(
    k.organization_id,
    (SELECT m.organization_id FROM members m WHERE m.user_id = k.user_id ORDER BY m.created_at ASC LIMIT 1),
    ''),
  k.name, k.start, COALESCE(k.prefix, 'sk_live_'), k.key, k.user_id, k.user_id,
  k.refill_interval, k.refill_amount, k.last_refill_at, COALESCE(k.enabled, 1), 1,
  600, 60000, 0, k.remaining, k.last_request,
  k.expires_at, k.permissions, k.metadata, k.created_at, k.updated_at,
  COALESCE(
    k.organization_id,
    (SELECT m.organization_id FROM members m WHERE m.user_id = k.user_id ORDER BY m.created_at ASC LIMIT 1)),
  k.workspace_id, k.scopes, k.environment, k.last_used_at
FROM `api_keys` k;--> statement-breakpoint
DROP TABLE `api_keys`;--> statement-breakpoint
ALTER TABLE `__new_api_keys` RENAME TO `api_keys`;--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_unique` ON `api_keys` (`key`);--> statement-breakpoint
CREATE INDEX `idx_apikeys_user` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_apikeys_org` ON `api_keys` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_apikeys_ref` ON `api_keys` (`reference_id`);--> statement-breakpoint
CREATE INDEX `idx_apikeys_config` ON `api_keys` (`config_id`);--> statement-breakpoint
-- Grandfather the legacy scope array into the plugin's permissions shape.
--
-- `routes/keys.ts` only ever wrote one value — ["forms:read","submissions:read",
-- "sessions:write"] — and nothing ever read it, so this is a constant rather
-- than a parse. Every key that exists keeps exactly the authority it should
-- have had; what it loses is the authority the `requirePermission` bypass
-- granted it by accident.
UPDATE `api_keys`
   SET `permissions` = '{"form":["read"],"response":["read"],"session":["create","write","read"]}'
 WHERE `permissions` IS NULL;--> statement-breakpoint
UPDATE `api_keys` SET `enabled` = 0 WHERE `reference_id` = '';