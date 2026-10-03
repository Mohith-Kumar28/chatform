-- Indexes for the queries that were reading whole tables.
--
-- D1 insights on 2026-10-03 showed ~3.5M rows read a day against a 14 MB
-- database. Almost none of it was traffic: the cron and the admin console were
-- filtering on columns no index led with, so every run read the whole table.
--
-- ai_generations(created_at)             platform rollup, AI admin page
-- form_activity(created_at, org)         activity prune, rollup, cohorts, active orgs
-- form_activity(org, created_at)         admin accounts list "last active"
-- form_versions(published_at)            forms_published rollup
-- organizations / accounts (created_at)  signup rollups, funnel, accounts list
-- respondents(last_seen_at, merged_into) orphan prune; merged_into was a nested
--                                        scan per row, so it grew with n²
-- chat_sessions(submission_id)           response transcripts on the results page
-- files(form_id)                         archive list upload counts
-- submissions(org, status, is_test, completed_at)  funnel and activation medians

CREATE INDEX `idx_ai_gen_created` ON `ai_generations` (`created_at`);

CREATE INDEX `idx_activity_created` ON `form_activity` (`created_at`, `organization_id`);

CREATE INDEX `idx_activity_org_created` ON `form_activity` (`organization_id`, `created_at`);

CREATE INDEX `idx_versions_published` ON `form_versions` (`published_at`);

CREATE INDEX `idx_orgs_created` ON `organizations` (`created_at`);

CREATE INDEX `idx_accounts_created` ON `accounts` (`created_at`);

CREATE INDEX `idx_respondents_last_seen` ON `respondents` (`last_seen_at`);

CREATE INDEX `idx_respondents_merged_into` ON `respondents` (`merged_into`) WHERE `merged_into` IS NOT NULL;

CREATE INDEX `idx_chat_sessions_submission` ON `chat_sessions` (`submission_id`) WHERE `submission_id` IS NOT NULL;

CREATE INDEX `idx_files_form` ON `files` (`form_id`);

CREATE INDEX `idx_submissions_org_status_completed` ON `submissions` (`organization_id`, `status`, `is_test`, `completed_at`);
