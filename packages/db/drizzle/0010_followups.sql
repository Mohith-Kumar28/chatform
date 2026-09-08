-- Abandoned-response follow-ups.
--
-- One row per nudge, scheduled the moment a response is abandoned and swept by
-- the cron that already runs every five minutes. A row rather than a delayed
-- queue message because Cloudflare Queues caps `delaySeconds` at twelve hours
-- and this cadence runs to days — and because a row can be cancelled when the
-- respondent comes back, shown in the results table, and re-checked at send
-- time against settings that changed after it was scheduled. None of which an
-- in-flight message can do.
CREATE TABLE IF NOT EXISTS followups (
  id               TEXT PRIMARY KEY,
  submission_id    TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  form_id          TEXT NOT NULL,
  organization_id  TEXT NOT NULL,
  -- 'email' today. The column exists so WhatsApp and SMS are additive rather
  -- than a migration; see the plan's scope note on why they are not built yet.
  channel          TEXT NOT NULL DEFAULT 'email',
  -- Snapshotted at schedule time, never re-resolved. Editing the form later
  -- must not be able to redirect a nudge that is already queued.
  address          TEXT NOT NULL,
  address_source   TEXT NOT NULL,
  step             INTEGER NOT NULL,
  -- scheduled | sent | skipped | cancelled | failed | holdout
  status           TEXT NOT NULL DEFAULT 'scheduled',
  reason           TEXT,
  scheduled_at     INTEGER NOT NULL,
  sent_at          INTEGER,
  created_at       INTEGER NOT NULL
);

-- Scheduling is idempotent: `INSERT … ON CONFLICT DO NOTHING` against this is
-- what makes `scheduleFollowUps` safe to call twice, the same defence
-- `openResponse` already uses for the submission row itself.
CREATE UNIQUE INDEX IF NOT EXISTS uq_followups_submission_step ON followups (submission_id, step);
-- The sweep's only query.
CREATE INDEX IF NOT EXISTS idx_followups_due ON followups (status, scheduled_at);
-- Cancelling on completion or resume, and the results table's badge.
CREATE INDEX IF NOT EXISTS idx_followups_submission ON followups (submission_id);

-- Addresses that must not be mailed.
--
-- `organization_id` NULL means global, and that is the whole point of the
-- column being nullable: a hard bounce or a spam complaint is a fact about an
-- address and applies everywhere, while someone opting out of one customer's
-- nudges has said nothing about anybody else's. Scoping those together would
-- either leak one customer's unsubscribes into another's or keep mailing an
-- address that is already burning our reputation.
--
-- Transactional mail deliberately does not consult this table. Someone who
-- opted out of a customer's follow-ups must still be able to reset their
-- password.
CREATE TABLE IF NOT EXISTS email_suppressions (
  organization_id  TEXT,
  address          TEXT NOT NULL,
  -- unsubscribe | bounce | complaint | manual | at_capture
  reason           TEXT NOT NULL,
  created_at       INTEGER NOT NULL
);

-- SQLite treats NULLs as distinct in a UNIQUE index, so the global rows are not
-- deduplicated by this and are inserted through a guarded path instead.
CREATE UNIQUE INDEX IF NOT EXISTS uq_suppressions_org_address ON email_suppressions (organization_id, address);
CREATE INDEX IF NOT EXISTS idx_suppressions_address ON email_suppressions (address);

-- Answering time, accumulated across sittings.
--
-- `duration_ms` is computed as `now - started_at`, which was right while a
-- response could only be finished in one go. A response resumed three days
-- later would report a three-day completion time — straight into the
-- completion-time analytics customers pay to read. This holds the time actually
-- spent answering so the abandonment gap can be excluded.
ALTER TABLE submissions ADD COLUMN active_ms INTEGER NOT NULL DEFAULT 0;
