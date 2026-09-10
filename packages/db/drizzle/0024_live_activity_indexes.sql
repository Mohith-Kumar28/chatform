-- Timestamp indexes, so "what happened in the last thirty minutes" is not a scan of everything.
--
-- The platform console gained a live tile that reads the source tables directly — the rollup
-- runs on the cron and the overview is cached for five minutes, so neither can answer whether
-- anything is happening *now*. That query is bounded by time rather than by tenancy, and every
-- index this schema had on these tables leads with a form or an organization: `idx_submissions_
-- org_started` cannot serve a range over `started_at` alone, so the planner fell back to reading
-- the table. Fine today, a full scan of every submission ever taken on the day it matters.
--
-- `rollupPlatformDaily` runs the same shape of query — one UTC day of `users`, `forms`,
-- `submissions` and `chat_sessions` — every five minutes, so these pay for themselves twice.
--
-- Hand-written, as 0021 through 0023 were: `drizzle-kit generate` diffs against a meta snapshot
-- that does not know about the hand-added tables and re-emits them as CREATEs.
CREATE INDEX IF NOT EXISTS `idx_users_created` ON `users` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_forms_created` ON `forms` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_submissions_started` ON `submissions` (`started_at`);
CREATE INDEX IF NOT EXISTS `idx_submissions_completed` ON `submissions` (`completed_at`);
CREATE INDEX IF NOT EXISTS `idx_chat_sessions_created` ON `chat_sessions` (`created_at`);
