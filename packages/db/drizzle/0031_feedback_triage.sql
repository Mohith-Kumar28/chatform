-- A bug report becomes a piece of work, not a line in a feed.
--
-- `0030` gave a report a row and a rating. Everything here is about what happens after it
-- arrives: whether anybody has dealt with it, what it turned out to be about, and what the
-- respondent was actually looking at when they filed it.
--
-- ── Triage lives on the row, not in a table ──
--
-- One or two people read these. `status` plus who moved it and when is the whole workflow, and
-- a status-history table would be three joins to answer a question nobody asks; the audit log
-- already records the transitions for anyone who does. `status_by` holds an **email address,
-- not a user id** — platform admins are an allowlist in a worker secret (`lib/platform-admin.ts`),
-- not rows in `users`, so there is no id to point at.
--
-- ── The snapshot is a key, not a blob ──
--
-- What the respondent had on screen is captured in their browser and put in R2, and only the
-- key comes back here. It is deliberately not a row in `files`: that table meters storage
-- against the customer's plan, and this object is ours, about our software, stored because we
-- asked for it.
--
-- ── Why so few indexes ──
--
-- SQLite uses one index per table per query, so a filter on status *and* rating *and* account
-- picks one and post-filters the rest. Status and the two cluster drill-downs are the reads
-- that happen on every page load; rating is one value in five and "has a note" is about half
-- the table, and neither earns an index while every read is already anchored by a status
-- equality or a date range. The fix, if it ever becomes one, is a wider compound index rather
-- than more single-column ones.
--
-- Hand-written, as 0021 through 0030 were: `drizzle-kit generate` diffs against a meta snapshot
-- that does not know about the hand-added tables and re-emits them as CREATEs.

-- `new` | `resolved` | `spam`. Every existing row backfills to `new`, which is true — nobody
-- has looked at them — so the inbox correctly shows the whole table on the day this ships.
ALTER TABLE respondent_feedback ADD COLUMN status TEXT NOT NULL DEFAULT 'new';
ALTER TABLE respondent_feedback ADD COLUMN status_at INTEGER;
ALTER TABLE respondent_feedback ADD COLUMN status_by TEXT;
-- What we worked out about it, for the next person to open it. Never shown to the respondent.
ALTER TABLE respondent_feedback ADD COLUMN internal_note TEXT;

-- Which published version was running. `chat_sessions` has it too, but sessions are pruned in
-- other deployments' futures and a report has to stay self-describing.
ALTER TABLE respondent_feedback ADD COLUMN form_version_id TEXT;

-- What the note turned out to be about, from a fixed taxonomy — free text cannot be charted.
ALTER TABLE respondent_feedback ADD COLUMN topic TEXT;
ALTER TABLE respondent_feedback ADD COLUMN tags TEXT;
-- -1 (furious) to 1 (delighted), finer than the five faces. Null when there was no note to read.
ALTER TABLE respondent_feedback ADD COLUMN sentiment REAL;
ALTER TABLE respondent_feedback ADD COLUMN tagged_at INTEGER;

-- The R2 key of the screen they were looking at, and its size so the console can decline to
-- fetch something absurd.
ALTER TABLE respondent_feedback ADD COLUMN snapshot_key TEXT;
ALTER TABLE respondent_feedback ADD COLUMN snapshot_bytes INTEGER;

-- The inbox's default read: one status, newest first, no sort step.
CREATE INDEX IF NOT EXISTS idx_respondent_feedback_status_created
  ON respondent_feedback (status, created_at DESC);
-- "Every report from this account" and "every report on this form" — the two drill-downs the
-- cluster panels link into.
CREATE INDEX IF NOT EXISTS idx_respondent_feedback_org_created
  ON respondent_feedback (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_respondent_feedback_form_created
  ON respondent_feedback (form_id, created_at DESC);
