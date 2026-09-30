-- Importing a form from Typeform, Google Forms or Tally (see apps/api/src/routes/import.ts).
--
-- A visitor who is not signed in can convert a form and talk to it before
-- making an account. That form has to live somewhere the chat runtime can
-- serve it from, so it is created, published, in a system organization that
-- nobody is a member of, and copied into the visitor's own workspace when they
-- choose "Use this form". The cron deletes unclaimed ones after a day.

CREATE TABLE `import_trials` (
  `token` text PRIMARY KEY NOT NULL,
  `form_id` text NOT NULL,
  `provider` text NOT NULL,
  `source_url` text NOT NULL,
  -- The import report shown beside the preview: counts and what wasn't copied.
  `report_json` text NOT NULL,
  -- Who converted it, hashed. Never a raw fingerprint or address.
  `device_hash` text,
  `ip_hash` text,
  `claimed_by` text,
  `claimed_form_id` text,
  `created_at` integer NOT NULL,
  `expires_at` integer NOT NULL
);
CREATE INDEX `idx_import_trials_expires` ON `import_trials` (`expires_at`);

-- Free conversions per signed-out visitor per UTC day, keyed by a hashed
-- device fingerprint and, separately, a hashed IP (a fingerprint is sent by
-- the browser and can be changed, an address is harder to).
CREATE TABLE `import_quota` (
  `key_hash` text NOT NULL,
  `day` text NOT NULL,
  `count` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (`key_hash`, `day`)
);

INSERT OR IGNORE INTO `organizations` (`id`, `name`, `slug`, `created_at`)
VALUES ('org_import_trials', 'Chatform import trials', 'chatform-import-trials', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

INSERT OR IGNORE INTO `workspaces` (`id`, `organization_id`, `name`, `slug`, `created_at`)
VALUES ('ws_import_trials', 'org_import_trials', 'Import trials', 'import-trials', CAST(strftime('%s', 'now') AS INTEGER) * 1000);

-- A trial is a demo of the product, so Free's monthly caps must not switch
-- the chat off for the next visitor. Each trial is already capped per visitor.
INSERT OR IGNORE INTO `entitlement_overrides` (`id`, `organization_id`, `kind`, `key`, `value`, `reason`, `created_at`)
VALUES
  ('ovr_import_ai_conv', 'org_import_trials', 'limit', 'ai_conversations_per_month', '', 'Import trials are capped per visitor instead', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('ovr_import_ai_tok', 'org_import_trials', 'limit', 'ai_tokens_per_month', '', 'Import trials are capped per visitor instead', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('ovr_import_resp', 'org_import_trials', 'limit', 'responses_ceiling_per_month', '', 'Import trials are capped per visitor instead', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('ovr_import_blocks', 'org_import_trials', 'limit', 'blocks_per_form', '200', 'Imported forms can be long', CAST(strftime('%s', 'now') AS INTEGER) * 1000),
  ('ovr_import_forms', 'org_import_trials', 'limit', 'forms_count', '', 'One per unclaimed trial', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
