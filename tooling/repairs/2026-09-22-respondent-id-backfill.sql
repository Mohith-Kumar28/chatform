-- Give every response a respondent id, and drop the ones that were never responses.
--
-- The Respondent ID column was blank on 143 production rows. None of them were
-- the browser fingerprint failing: every chat response since `respondents`
-- shipped (b6758c3, 11 Sept 17:05 UTC) has one. The blanks were three cohorts:
--
--   api       57 rows, all 21 Sept 13:31 -> 22:21 UTC, all one key on
--             org_0afbd3d1: the `pnpm api:verify` run against production.
--             16 of their 17 forms are already deleted. Not respondents.
--
--   signed    69 chat rows from before `respondents` existed, with a verified
--             sign-in on the row. Resolved to a person by that identity (or
--             their email, where a person already owns it), exactly as
--             `resolveRespondent` would have at the time.
--
--   anonymous 17 chat rows from before it, no sign-in. Three have no answers:
--             deleted, as an empty conversation leaves no row today. The rest
--             get a person each, as `openResponse` now mints for a response
--             with nothing to recognise its author by.
--
-- Three people held two or three open drafts on one form, which `0027` forbids
-- once they share a respondent id. Checked by hand, ids hardcoded:
--
--   frm_9bf393edf78a  keep sbm_b5492787e7f24922938a (8 answers),
--                     delete sbm_fa0123e4180f4d3ba9b8, sbm_e3cbb960732b47d2917d (empty)
--   frm_a90fed423354  keep sbm_7161cc9c5ded460c8efe (newest),
--                     delete sbm_25b5945706a142bfa386 (empty)
--   frm_demo00001     keep sbm_83e973b701f0411fb064 (7 answers), fold in
--                     sbm_437433141a1248b2b946 (4 answers) where it does not collide
--
-- One more clash, made while verifying this fix: a browser test on 22 Sept
-- 14:43 UTC opened sbm_8476965a78f44c659f5b (one answer) on the demo form as
-- rsp_7b91919241fd4bd8978e, who also owns the 10 Sept draft
-- sbm_da870f4b68654249804b (three answers) by sign-in. The test row goes; the
-- real one keeps its answers and takes the id.
--
-- Scratch tables rather than CTEs, because the new ids are random and each has
-- to be read back by three later statements.

-- ── 1. Not responses ────────────────────────────────────────────────────────

DELETE FROM submissions
 WHERE source = 'api' AND respondent_id IS NULL
   AND api_key_id = 'cWrbE8YzNGEN9H125BNDm3RCKDgMK1zD';

DELETE FROM submissions
 WHERE source = 'chat' AND respondent_id IS NULL AND respondent_subject IS NULL
   AND status = 'abandoned'
   AND NOT EXISTS (SELECT 1 FROM submission_answers a WHERE a.submission_id = submissions.id);

-- ── 2. Duplicate drafts ─────────────────────────────────────────────────────

UPDATE submission_answers
   SET submission_id = 'sbm_83e973b701f0411fb064'
 WHERE submission_id = 'sbm_437433141a1248b2b946'
   AND NOT EXISTS (
     SELECT 1 FROM submission_answers keep
      WHERE keep.submission_id = 'sbm_83e973b701f0411fb064'
        AND keep.block_ref = submission_answers.block_ref
   );

UPDATE chat_sessions SET submission_id = CASE submission_id
    WHEN 'sbm_fa0123e4180f4d3ba9b8' THEN 'sbm_b5492787e7f24922938a'
    WHEN 'sbm_e3cbb960732b47d2917d' THEN 'sbm_b5492787e7f24922938a'
    WHEN 'sbm_25b5945706a142bfa386' THEN 'sbm_7161cc9c5ded460c8efe'
    WHEN 'sbm_437433141a1248b2b946' THEN 'sbm_83e973b701f0411fb064'
  END
 WHERE submission_id IN ('sbm_fa0123e4180f4d3ba9b8', 'sbm_e3cbb960732b47d2917d',
                         'sbm_25b5945706a142bfa386', 'sbm_437433141a1248b2b946');

DELETE FROM submissions
 WHERE id IN ('sbm_fa0123e4180f4d3ba9b8', 'sbm_e3cbb960732b47d2917d',
              'sbm_25b5945706a142bfa386', 'sbm_437433141a1248b2b946');

DELETE FROM submissions WHERE id = 'sbm_8476965a78f44c659f5b' AND form_id = 'frm_demo00001';

-- ── 3. Signed in: one person per identity ───────────────────────────────────

CREATE TABLE _backfill_identity (identity TEXT PRIMARY KEY, email TEXT, id TEXT NOT NULL, is_new INTEGER NOT NULL);

INSERT INTO _backfill_identity (identity, email, id, is_new)
SELECT ident, email,
       COALESCE(
         (SELECT respondent_id FROM respondent_keys WHERE kind = 'identity' AND value = ident),
         (SELECT respondent_id FROM respondent_keys WHERE kind = 'email' AND value = email),
         'rsp_' || lower(hex(randomblob(10)))),
       CASE WHEN EXISTS (SELECT 1 FROM respondent_keys WHERE kind = 'identity' AND value = ident)
              OR EXISTS (SELECT 1 FROM respondent_keys WHERE kind = 'email' AND value = email)
            THEN 0 ELSE 1 END
  FROM (SELECT respondent_provider || ':' || respondent_subject AS ident,
               lower(trim(MAX(respondent_email))) AS email
          FROM submissions
         WHERE respondent_id IS NULL AND respondent_subject IS NOT NULL
         GROUP BY 1);

INSERT INTO respondents (id, display_name, email, phone, first_seen_at, last_seen_at, created_at)
SELECT b.id, MAX(s.respondent_name), b.email, MAX(s.respondent_phone),
       MIN(s.started_at), MAX(COALESCE(s.updated_at, s.started_at)), CAST(unixepoch('subsec') * 1000 AS INTEGER)
  FROM _backfill_identity b
  JOIN submissions s ON s.respondent_provider || ':' || s.respondent_subject = b.identity
 WHERE b.is_new = 1 AND s.respondent_id IS NULL
 GROUP BY b.id;

INSERT INTO respondent_keys (kind, value, respondent_id, created_at)
SELECT 'identity', identity, id, CAST(unixepoch('subsec') * 1000 AS INTEGER) FROM _backfill_identity WHERE true
ON CONFLICT (kind, value) DO NOTHING;

INSERT INTO respondent_keys (kind, value, respondent_id, created_at)
SELECT 'email', email, id, CAST(unixepoch('subsec') * 1000 AS INTEGER) FROM _backfill_identity WHERE email IS NOT NULL AND email != ''
ON CONFLICT (kind, value) DO NOTHING;

UPDATE submissions
   SET respondent_id = (SELECT id FROM _backfill_identity b WHERE b.identity = submissions.respondent_provider || ':' || submissions.respondent_subject)
 WHERE respondent_id IS NULL AND respondent_subject IS NOT NULL;

DROP TABLE _backfill_identity;

-- ── 4. Anonymous: one person per response ───────────────────────────────────

CREATE TABLE _backfill_anon (submission_id TEXT PRIMARY KEY, id TEXT NOT NULL, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL);

INSERT INTO _backfill_anon (submission_id, id, first_seen, last_seen)
SELECT id, 'rsp_' || lower(hex(randomblob(10))), started_at, COALESCE(updated_at, started_at)
  FROM submissions WHERE respondent_id IS NULL;

INSERT INTO respondents (id, first_seen_at, last_seen_at, created_at)
SELECT id, first_seen, last_seen, CAST(unixepoch('subsec') * 1000 AS INTEGER) FROM _backfill_anon;

UPDATE submissions
   SET respondent_id = (SELECT id FROM _backfill_anon b WHERE b.submission_id = submissions.id)
 WHERE respondent_id IS NULL;

DROP TABLE _backfill_anon;
