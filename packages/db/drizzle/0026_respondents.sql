-- A person who fills in forms, as a row of their own.
--
-- Until now nothing in this database represented a respondent. Identity was copied onto every
-- `submissions` row and never joined: one person answering three forms was three unrelated
-- tuples, and questions like "how many people" or "how often does this person come back" were
-- not expressible at any scope. This is that missing row.
--
-- ── Two tables, because a person has several names for themselves ──
--
-- `respondents` is the person. `respondent_keys` is every identifier we have ever seen them
-- under, each unique across the platform, each pointing back at one person. A visit hands us up
-- to three — the browser fingerprint, the verified sign-in subject, the email address — and any
-- one of them is enough to recognise somebody. When a visit presents two keys that currently
-- name two different people, those two people were always one, and the rows merge.
--
-- A single table with three nullable identifier columns would have looked simpler and cannot do
-- that: it has no way to hold the second device somebody answered from, and no way to record
-- that two rows turned out to be the same person without losing one of them.
--
-- ── The key values are global, unlike `submissions.fingerprint` ──
--
-- `forms.fingerprint_salt` deliberately makes the per-form device key incomparable between
-- forms, and that key keeps doing its per-form job unchanged — the resubmission gate and the
-- follow-up cap both still read it. The `device` keys here are derived from the same browser
-- fingerprint under one platform-wide salt instead, which is what makes a respondent the same
-- respondent on somebody else's form. That linkage is the entire purpose of this table and is
-- disclosed in the privacy policy.
--
-- `merged_into` is a tombstone rather than a delete: a losing row's id may already be stamped on
-- responses, sit in an export somebody downloaded, or be quoted in a support thread, and all of
-- those should still lead to the surviving person rather than to nothing.
--
-- Hand-written, as 0021 through 0025 were: `drizzle-kit generate` diffs against a meta snapshot
-- that does not know about the hand-added tables and re-emits them as CREATEs.
CREATE TABLE IF NOT EXISTS respondents (
  id TEXT PRIMARY KEY NOT NULL,
  -- Best known, not authoritative: whatever the most recent verified sign-in or answered
  -- question told us. Shown in the console so a row reads as a person rather than as a hash.
  display_name TEXT,
  email TEXT,
  phone TEXT,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  -- Set when this row lost a merge. Follow it to the survivor; never write to a row that has it.
  merged_into TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS respondent_keys (
  -- `device` | `identity` | `email`.
  kind TEXT NOT NULL,
  -- device:   sha256(<signing salt>:rsp:<fingerprint>), one value per browser, platform-wide
  -- identity: "<provider>:<subject>" from a verified sign-in
  -- email:    the address, lowercased
  value TEXT NOT NULL,
  respondent_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  -- The uniqueness that makes recognition work: one identifier names one person, and the insert
  -- that would break that is the insert that discovers a merge.
  PRIMARY KEY (kind, value),
  FOREIGN KEY (respondent_id) REFERENCES respondents(id) ON UPDATE no action ON DELETE cascade
);

-- Repointing every key of a losing row is the hot half of a merge.
CREATE INDEX IF NOT EXISTS idx_respondent_keys_respondent ON respondent_keys (respondent_id);

-- Which responses belong to this person. Nullable forever: a response made through the headless
-- API by a caller who volunteered no identity has no person to point at, and inventing one would
-- make the count of people meaningless.
ALTER TABLE submissions ADD COLUMN respondent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_submissions_respondent ON submissions (respondent_id, started_at);
