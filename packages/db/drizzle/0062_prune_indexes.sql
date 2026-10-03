-- Indexes for the queries 0061 did not reach.
--
-- 0061 covered the hot ones. These run hourly or daily now, so each scan was
-- cheap, but every one grows with its table and an index costs nothing here.
-- Partial indexes, so they only hold the rows the prune is looking for.
--
-- feature_access_log  unconverted denials past 90 days (pruneGateLog)
-- exports             expired export files (pruneExpiredExports)
-- submissions / chat_sessions / respondent_payments
--                     test rows past 30 days (pruneTestData)
-- payment_accounts    OAuth tokens close to expiry (sweepPaymentTokens)
--
-- And what a pass over every query in the API found, request paths first:
--
-- files(org, status, size_bytes)      storage used, read on every upload; it
--                                     walked every confirmed file on the platform
-- submissions(form, status, is_test, completed_at)
--                                     the dashboard's "completed today" per form card
-- submissions(session_id)             GET /v1/files/:id and late payment settlement
-- *.form_version_id                   foreign-key checks when a form is purged: each
--                                     deleted version scanned three whole tables
-- webhook_deliveries(created_at)      the hourly delivery prune and admin health
-- lower(email) on users, invitations  invitation lookups compare case-insensitively

CREATE INDEX `idx_fal_unconverted_denied` ON `feature_access_log` (`last_denied_at`) WHERE `converted_at` IS NULL;

CREATE INDEX `idx_exports_expires` ON `exports` (`expires_at`) WHERE `expires_at` IS NOT NULL;

CREATE INDEX `idx_submissions_test_started` ON `submissions` (`started_at`) WHERE `is_test` = 1;

CREATE INDEX `idx_chat_sessions_test_created` ON `chat_sessions` (`created_at`) WHERE `is_test` = 1;

CREATE INDEX `idx_respondent_payments_test_created` ON `respondent_payments` (`created_at`) WHERE `is_test` = 1;

CREATE INDEX `idx_payment_accounts_oauth_expiry` ON `payment_accounts` (`access_expires_at`) WHERE `status` = 'active' AND `credential_kind` = 'oauth';

CREATE INDEX `idx_files_org_status` ON `files` (`organization_id`, `status`, `size_bytes`);

CREATE INDEX `idx_submissions_form_status_test_completed` ON `submissions` (`form_id`, `status`, `is_test`, `completed_at`);

CREATE INDEX `idx_submissions_session` ON `submissions` (`session_id`) WHERE `session_id` IS NOT NULL;

CREATE INDEX `idx_submissions_form_version` ON `submissions` (`form_version_id`);

CREATE INDEX `idx_chat_sessions_form_version` ON `chat_sessions` (`form_version_id`);

CREATE INDEX `idx_activity_version` ON `form_activity` (`form_version_id`);

CREATE INDEX `idx_wh_deliveries_created` ON `webhook_deliveries` (`created_at`);

CREATE INDEX `idx_users_email_lower` ON `users` (lower(`email`));

CREATE INDEX `idx_invitations_email_lower` ON `invitations` (lower(`email`));
