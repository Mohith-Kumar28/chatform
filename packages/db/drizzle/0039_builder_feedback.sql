-- Feedback from the people who build forms: bugs, feature requests and general feedback,
-- filed from the "?" button in the dashboard and the builder.
--
-- A table of its own rather than more rows in `respondent_feedback`. A respondent is
-- anonymous, hangs off a chat session and rates one conversation; an account owner is a
-- signed-in user on a plan, writes a structured report, and attaches screenshots. The two
-- share the triage columns and the issue grouping, and nothing else.
--
-- Issues are shared: `feedback_issues` gains a `pool` column so a builder's feature request
-- is never matched against a respondent's bug, and the rebuild of one pool leaves the other
-- alone.
--
-- Hand-written, as 0021 onward are.
CREATE TABLE IF NOT EXISTS builder_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT,
  -- Copied at filing, so a reply still reaches them after they change it or leave.
  user_email TEXT,
  user_name TEXT,
  organization_id TEXT,
  workspace_id TEXT,
  -- The plan and role at the moment of filing: "a Business owner asked for this" is the
  -- fact, and it must not change when they downgrade next month.
  plan_id TEXT,
  role TEXT,
  -- Set when a platform admin filed it while impersonating the user.
  impersonator_email TEXT,
  -- bug | feature | feedback
  kind TEXT NOT NULL,
  -- The product area they picked, from a fixed list in @repo/form-schema.
  area TEXT,
  -- 1 to 5, the face they picked. Feedback only.
  rating INTEGER,
  -- Bug: minor | annoying | blocking. Feature: nice | important | critical.
  severity TEXT,
  -- A short summary written by the tagger, for the inbox row and the mail subject.
  title TEXT,
  message TEXT NOT NULL,
  steps TEXT,
  expected TEXT,
  why TEXT,
  url TEXT,
  form_id TEXT,
  -- Viewport, locale, timezone, theme, recent console errors. JSON, printed, never queried.
  context_json TEXT,
  user_agent TEXT,
  -- JSON [{ key, bytes, type, auto }] — R2 objects under builder-feedback/.
  attachments_json TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  status_at INTEGER,
  status_by TEXT,
  internal_note TEXT,
  topic TEXT,
  tags TEXT,
  sentiment REAL,
  tagged_at INTEGER,
  issue_id TEXT,
  issue_similarity REAL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_builder_feedback_created ON builder_feedback (created_at);
CREATE INDEX IF NOT EXISTS idx_builder_feedback_status_created ON builder_feedback (status, created_at);
CREATE INDEX IF NOT EXISTS idx_builder_feedback_org_created ON builder_feedback (organization_id, created_at);
-- The daily cap.
CREATE INDEX IF NOT EXISTS idx_builder_feedback_user_created ON builder_feedback (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_builder_feedback_issue ON builder_feedback (issue_id, created_at);

CREATE TABLE IF NOT EXISTS builder_feedback_embeddings (
  feedback_id TEXT PRIMARY KEY NOT NULL,
  vector TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (feedback_id) REFERENCES builder_feedback(id) ON UPDATE no action ON DELETE cascade
);

-- respondent | builder. Every issue that exists today was opened by a respondent's report.
ALTER TABLE feedback_issues ADD COLUMN pool TEXT NOT NULL DEFAULT 'respondent';
CREATE INDEX IF NOT EXISTS idx_feedback_issues_pool ON feedback_issues (pool);
