-- A way for the person filling in a form to talk to the people who built the form software.
--
-- Until now there was none. A respondent whose date picker refused to open on their phone could
-- tell the customer whose form it was — who can do nothing about it — or nobody. The only mark
-- we leave on that page is the "Powered by chatform" footer, so that is where the line goes, and
-- this is where what they send lands.
--
-- ── Not scoped to an organization, on purpose ──
--
-- Every other table holding respondent-typed text is a customer's data and the platform console
-- is barred from reading it. This text was addressed to us instead, which is what makes it
-- readable there. `form_id` and `organization_id` ride along so a report can be reproduced on the
-- form it happened on; they are plain columns rather than foreign keys because a bug report has
-- to outlive the form that provoked it.
--
-- ── Who it is from ──
--
-- `respondent_id` is the platform-wide person from `0026`, resolved when the session opened, and
-- it is what the three-a-day cap counts. It is nullable and stays nullable: a browser that blocks
-- fingerprinting and a headless caller both resolve to nobody, and the cap falls back to the
-- session id there. No fingerprint is copied onto this row — the respondent is the join key those
-- copies exist to avoid.
--
-- Hand-written, as 0021 through 0029 were: `drizzle-kit generate` diffs against a meta snapshot
-- that does not know about the hand-added tables and re-emits them as CREATEs.
CREATE TABLE IF NOT EXISTS respondent_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  -- Null when the visit offered nothing to recognise anybody by. `SET NULL` rather than cascade:
  -- a merged-away person is still a real report.
  respondent_id TEXT,
  session_id TEXT,
  form_id TEXT,
  organization_id TEXT,
  -- 1 (unhappy) to 5 (delighted). The API refuses anything else.
  rating INTEGER NOT NULL,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'chat',
  -- The browser string, verbatim and unparsed: the most useful line in a bug report.
  user_agent TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (respondent_id) REFERENCES respondents(id) ON UPDATE no action ON DELETE set null
);

-- The console reads newest-first over a window.
CREATE INDEX IF NOT EXISTS idx_respondent_feedback_created ON respondent_feedback (created_at);
-- Both halves of the daily cap: one indexed lookup per submitted report, never a scan.
CREATE INDEX IF NOT EXISTS idx_respondent_feedback_respondent ON respondent_feedback (respondent_id, created_at);
CREATE INDEX IF NOT EXISTS idx_respondent_feedback_session ON respondent_feedback (session_id, created_at);
