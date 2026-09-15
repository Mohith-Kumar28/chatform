-- Bug reports grouped into issues, so a hundred reports read as the dozen problems they are.
--
-- A report's topic says roughly what area it is about; an issue says which exact problem.
-- "An input or picker" with eighty reports is fifteen different bugs, and nobody can triage
-- eighty rows. Each report with a note is matched, when it arrives, to the issue it describes —
-- or opens a new one — and the founders work the issues.
--
-- ── What is stored, and what is not ──
--
-- Only what cannot be derived cheaply. An issue's report count, the people and forms it
-- touches, when it was last seen, whether it is resolved and whether it has come back are all
-- read from its reports with GROUP BY. Stored counts drift the first time a merge, a move or a
-- deleted report forgets to update one, and nothing would ever notice.
--
-- The centroid is the one summary kept: the mean of its reports' embeddings, which the matcher
-- needs for every incoming report and cannot recompute on each one. It is a cache — rebuilt
-- from the member embeddings on merge, move and rebuild, never adjusted by hand.
--
-- ── Why embeddings are TEXT ──
--
-- Little-endian Float32 as base64. Remote D1 and local Miniflare hand BLOB columns back in
-- different shapes, and TEXT behaves identically in both and reads in `wrangler d1 execute`.
-- Per-report vectors sit in their own table so the inbox's column list can never pull ~5 KB
-- per row by accident.
--
-- Hand-written, as 0021 onward are.
CREATE TABLE IF NOT EXISTS feedback_issues (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  -- Set when an admin renamed it, so a later rebuild never overwrites their words.
  title_edited INTEGER NOT NULL DEFAULT 0,
  -- The topic of the report that opened it, for display. Matching does not filter on it.
  topic TEXT,
  centroid TEXT NOT NULL,
  centroid_n INTEGER NOT NULL DEFAULT 1,
  -- Set when merged away; the survivor's id. Never matched against again.
  merged_into TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback_embeddings (
  feedback_id TEXT PRIMARY KEY NOT NULL,
  vector TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (feedback_id) REFERENCES respondent_feedback(id) ON UPDATE no action ON DELETE cascade
);

ALTER TABLE respondent_feedback ADD COLUMN issue_id TEXT;
-- How close the report was to its issue's centroid when it joined — for "why is this here".
ALTER TABLE respondent_feedback ADD COLUMN issue_similarity REAL;

-- Every derived number an issue shows is a GROUP BY over this.
CREATE INDEX IF NOT EXISTS idx_respondent_feedback_issue ON respondent_feedback (issue_id, created_at);
