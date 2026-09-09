-- Every message the platform sends, and whether it arrived at the provider.
--
-- Everything transactional goes through one queue — sign-in codes, password
-- resets, team invitations, submission notifications, respondent auto-replies
-- and abandoned-response nudges — and until now the only record of any of it
-- was a `console.log` in the consumer. `followups` tracks its own schedule and
-- `email_suppressions` records who we stopped mailing, but neither says whether
-- a single OTP was actually accepted for delivery. An unverified sender or an
-- expired provider key takes sign-in down for every new account on the platform
-- and shows up nowhere.
--
-- **No recipient address, by construction.** The column does not exist, so the
-- platform console cannot leak one however it is queried. The domain is enough
-- to answer the operational question — "is Gmail rejecting us" — and is the
-- most that should ever reach a cross-tenant screen.
CREATE TABLE mail_deliveries (
  id              TEXT    PRIMARY KEY,
  -- 'invitation' | 'password_reset' | 'otp' | 'submission' | 'followup'
  kind            TEXT    NOT NULL,
  -- 'sent' | 'failed'
  status          TEXT    NOT NULL,
  -- How many messages the job produced. One completed response can fan out to
  -- eleven, so a count of jobs is not a count of mail.
  messages        INTEGER NOT NULL DEFAULT 0,
  -- The queue's own attempt number. A failure at the retry ceiling is a message
  -- that has gone to the dead-letter queue and will not be tried again.
  attempt         INTEGER NOT NULL DEFAULT 1,
  -- The recipient's domain, never the address.
  domain          TEXT    NOT NULL DEFAULT '',
  error           TEXT,
  organization_id TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_mail_deliveries_at ON mail_deliveries(created_at DESC);
CREATE INDEX idx_mail_deliveries_kind ON mail_deliveries(kind, status, created_at DESC);
CREATE INDEX idx_mail_deliveries_failed ON mail_deliveries(status, created_at DESC) WHERE status = 'failed';
