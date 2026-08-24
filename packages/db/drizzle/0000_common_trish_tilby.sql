CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`account_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_accounts_provider` ON `accounts` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `idx_accounts_user` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `ai_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`session_id` text,
	`form_id` text,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`cost_usd_micro` integer DEFAULT 0 NOT NULL,
	`latency_ms` integer,
	`status` text DEFAULT 'ok' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_ai_gen_org_created` ON `ai_generations` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_ai_gen_kind` ON `ai_generations` (`kind`,`created_at`);--> statement-breakpoint
CREATE TABLE `analytics_rollup_daily` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`form_id` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`sessions_started` integer DEFAULT 0 NOT NULL,
	`sessions_completed` integer DEFAULT 0 NOT NULL,
	`avg_completion_ms` integer,
	`median_completion_ms` integer,
	`p90_completion_ms` integer,
	`per_block_json` text,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_rollup_date_form` ON `analytics_rollup_daily` (`date`,`form_id`);--> statement-breakpoint
CREATE INDEX `idx_rollup_form_date` ON `analytics_rollup_daily` (`form_id`,`date`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`start` text,
	`prefix` text,
	`key` text NOT NULL,
	`user_id` text NOT NULL,
	`refill_interval` integer,
	`refill_amount` integer,
	`last_refill_at` integer,
	`enabled` integer DEFAULT true,
	`rate_limit_enabled` integer DEFAULT true,
	`rate_limit_max` integer,
	`rate_limit_time_window` integer,
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
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_key_unique` ON `api_keys` (`key`);--> statement-breakpoint
CREATE INDEX `idx_apikeys_user` ON `api_keys` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_apikeys_org` ON `api_keys` (`organization_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`actor_label` text,
	`action` text NOT NULL,
	`resource_type` text,
	`resource_id` text,
	`ip_hash` text,
	`user_agent` text,
	`meta` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_audit_org_created` ON `audit_logs` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_resource` ON `audit_logs` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`role` text NOT NULL,
	`block_ref` text,
	`content` text NOT NULL,
	`meta` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chat_messages_session` ON `chat_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `chat_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`form_version_id` text,
	`organization_id` text NOT NULL,
	`respondent_token_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`current_block_ref` text,
	`current_index` integer,
	`collected_count` integer DEFAULT 0 NOT NULL,
	`turn_count` integer DEFAULT 0 NOT NULL,
	`variables_json` text,
	`state_snapshot_json` text,
	`token_usage_json` text,
	`submission_id` text,
	`ip_hash` text,
	`country` text,
	`hidden_fields` text,
	`meta` text,
	`created_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`form_version_id`) REFERENCES `form_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_sessions_respondent_token_hash_unique` ON `chat_sessions` (`respondent_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_form_activity` ON `chat_sessions` (`form_id`,`last_activity_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_status` ON `chat_sessions` (`status`);--> statement-breakpoint
CREATE INDEX `idx_chat_sessions_org_created` ON `chat_sessions` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `dodo_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`dodo_customer_id` text NOT NULL,
	`billing_email` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dodo_customers_organization_id_unique` ON `dodo_customers` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `dodo_customers_dodo_customer_id_unique` ON `dodo_customers` (`dodo_customer_id`);--> statement-breakpoint
CREATE TABLE `dodo_events` (
	`id` text PRIMARY KEY NOT NULL,
	`dodo_event_id` text NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`processed_at` integer,
	`status` text DEFAULT 'received' NOT NULL,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dodo_events_dodo_event_id_unique` ON `dodo_events` (`dodo_event_id`);--> statement-breakpoint
CREATE TABLE `files` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`form_id` text,
	`session_id` text,
	`uploaded_by` text DEFAULT 'respondent' NOT NULL,
	`uploader_user_id` text,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`checksum_sha256` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reject_reason` text,
	`created_at` integer NOT NULL,
	`confirmed_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `files_r2_key_unique` ON `files` (`r2_key`);--> statement-breakpoint
CREATE INDEX `idx_files_session` ON `files` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_files_status_created` ON `files` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `form_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`schema_json` text NOT NULL,
	`thumbnail_r2_key` text,
	`official` integer DEFAULT false NOT NULL,
	`organization_id` text,
	`usage_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `form_templates_slug_unique` ON `form_templates` (`slug`);--> statement-breakpoint
CREATE TABLE `form_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`version` integer NOT NULL,
	`schema_json` text NOT NULL,
	`theme_json` text,
	`settings_json` text,
	`checksum` text NOT NULL,
	`note` text,
	`published_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_versions_form_version` ON `form_versions` (`form_id`,`version`);--> statement-breakpoint
CREATE INDEX `idx_versions_form_pub` ON `form_versions` (`form_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `forms` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`created_by` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`active_version_id` text,
	`working_schema` text NOT NULL,
	`theme_json` text,
	`settings_json` text,
	`og_image_r2_key` text,
	`close_at` integer,
	`closed_reason` text,
	`fingerprint_salt` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `forms_slug_unique` ON `forms` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_forms_workspace` ON `forms` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_forms_org` ON `forms` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_forms_status` ON `forms` (`status`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_status` integer,
	`response_body` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_idem_endpoint_key_org` ON `idempotency_keys` (`endpoint`,`request_hash`,`organization_id`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`form_id` text,
	`provider` text NOT NULL,
	`config_json` text NOT NULL,
	`status` text DEFAULT 'connected' NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_integrations_org` ON `integrations` (`organization_id`);--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer NOT NULL,
	`inviter_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_invitations_org` ON `invitations` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_invitations_email` ON `invitations` (`email`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_members_org_user` ON `members` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `idx_members_user` ON `members` (`user_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`logo` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_slug_unique` ON `organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`subscription_id` text,
	`dodo_payment_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`status` text NOT NULL,
	`invoice_url` text,
	`paid_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_dodo_payment_id_unique` ON `payments` (`dodo_payment_id`);--> statement-breakpoint
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`dodo_product_id` text,
	`dodo_price_monthly_id` text,
	`dodo_price_yearly_id` text,
	`price_monthly_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`limits_json` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`active_organization_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `submission_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`form_id` text NOT NULL,
	`block_ref` text NOT NULL,
	`block_type` text NOT NULL,
	`value_json` text NOT NULL,
	`value_number` real,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`submission_id`) REFERENCES `submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_answers_sub_ref` ON `submission_answers` (`submission_id`,`block_ref`);--> statement-breakpoint
CREATE INDEX `idx_answers_form_ref` ON `submission_answers` (`form_id`,`block_ref`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`form_version_id` text,
	`organization_id` text NOT NULL,
	`session_id` text,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`search_text` text,
	`fingerprint` text,
	`hidden_fields` text,
	`meta` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`duration_ms` integer,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`form_version_id`) REFERENCES `form_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_submissions_form_status` ON `submissions` (`form_id`,`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_submissions_org_started` ON `submissions` (`organization_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `idx_submissions_form_fp` ON `submissions` (`form_id`,`fingerprint`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`dodo_subscription_id` text NOT NULL,
	`dodo_product_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`current_period_start` integer,
	`current_period_end` integer,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`seats` integer DEFAULT 1 NOT NULL,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_dodo_subscription_id_unique` ON `subscriptions` (`dodo_subscription_id`);--> statement-breakpoint
CREATE INDEX `idx_subscriptions_org_status` ON `subscriptions` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `usage_counters` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`period` text NOT NULL,
	`metric` text NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`limit_override` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_usage_org_period_metric` ON `usage_counters` (`organization_id`,`period`,`metric`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_verifications_identifier` ON `verifications` (`identifier`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`webhook_id` text NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`response_status` integer,
	`last_error` text,
	`next_retry_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`webhook_id`) REFERENCES `webhooks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_wh_deliveries_webhook` ON `webhook_deliveries` (`webhook_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_wh_deliveries_retry` ON `webhook_deliveries` (`status`,`next_retry_at`);--> statement-breakpoint
CREATE TABLE `webhooks` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`form_id` text,
	`url` text NOT NULL,
	`secret` text NOT NULL,
	`events` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_webhooks_org` ON `webhooks` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_webhooks_form` ON `webhooks` (`form_id`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_workspaces_org_slug` ON `workspaces` (`organization_id`,`slug`);