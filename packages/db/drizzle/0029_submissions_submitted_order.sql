-- The results table reads newest-submitted first, and nothing indexed that order.
--
-- The list sorts on `COALESCE(completed_at, started_at)` — the instant the table prints in
-- its Submitted column — because sorting on `started_at` alone filed a response begun on
-- Monday and finished on Wednesday under Monday, halfway down a table whose dates then read
-- as shuffled. Every existing index on this table stores `started_at`, so the new order is a
-- sort the planner can only do by reading every response the form has ever taken: fifty rows
-- on screen, three thousand rows read, once per page turn.
--
-- An index on the expression itself, matching the ORDER BY term for term, so D1 walks it
-- backwards and stops at the page. `form_id` leads because every caller is one form.
--
-- Hand-written, as 0021 through 0028 were: `drizzle-kit generate` diffs against a meta
-- snapshot that does not know about the hand-added tables and re-emits them as CREATEs.
CREATE INDEX IF NOT EXISTS `idx_submissions_form_submitted`
  ON `submissions` (`form_id`, COALESCE(`completed_at`, `started_at`));
