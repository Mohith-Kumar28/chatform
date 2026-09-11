-- One unfinished response per person per form, said by the database.
--
-- `findOpenResponseId` has claimed this invariant since it was written, and the results table
-- disproved it: one respondent, one form, two `abandoned` rows three minutes apart — one with
-- three answers, one with none. Both sessions carried `started_over = 1`, and "Start over" was
-- the one path that skipped the lookup entirely and went straight to an INSERT. So the rule
-- lived in a function any caller could decline to call, which is not where a rule lives.
--
-- A *finished* response may still multiply: that is `allowResubmissions`, and it is the author's
-- decision. What cannot multiply is a draft. Being half-way through a form is a fact about a
-- person, not about the tab they have open; a second open row splits their answers, shows the
-- author two respondents where there was one, and earns each copy its own reminder email.
--
-- ── Why `respondent_id` and not the verified identity ──
--
-- `respondent_provider`/`respondent_subject` only exist once somebody has signed in, and the
-- duplicates this is here to stop are made in the minutes before that — a reload, a start-over,
-- a second tab. `respondent_id` is the platform-wide person from `0026`, resolved at session
-- creation from whatever the visit offered (device key, sign-in subject, email address), so it
-- is set earlier, and it survives the merge that happens when two of those turn out to name one
-- person. It is the strongest key available at the moment a row is created, which is the moment
-- that has to be constrained.
--
-- Rows with no `respondent_id` are outside the index: a headless API caller who volunteered
-- nothing to recognise anybody by has no person to be one draft of.
--
-- `is_test` is a key column rather than a filter, so a `*_test_` key's traffic and real traffic
-- never collide with each other.
--
-- Hand-written, as 0018 through 0026 were: `drizzle-kit generate` diffs against a meta snapshot
-- that stopped at 0021 and would re-emit the hand-added tables as CREATEs.

-- ── 1. Fold the duplicates that already exist ─────────────────────────────────
--
-- The survivor of each group is the most recently touched row, breaking ties on the id. Ordered
-- by nothing the next statement changes, on purpose: answer counts would be the better rule and
-- the move below rewrites them, so the two statements would disagree about who survived.
WITH open_rows AS (
  SELECT s.id,
         FIRST_VALUE(s.id) OVER (
           PARTITION BY s.form_id, s.respondent_id, s.is_test
           ORDER BY COALESCE(s.updated_at, s.started_at) DESC, s.id ASC
         ) AS survivor
    FROM submissions s
   WHERE s.respondent_id IS NOT NULL
     AND s.status IN ('in_progress', 'abandoned')
)
UPDATE submission_answers
   SET submission_id = (SELECT survivor FROM open_rows WHERE open_rows.id = submission_answers.submission_id)
 WHERE submission_id IN (SELECT id FROM open_rows WHERE id != survivor)
   -- `uq_answers_sub_ref` is why this is needed rather than a bare UPDATE: the same question
   -- answered on both rows would collide, and the survivor's own answer is the one to keep — it
   -- is the row somebody was still using.
   AND NOT EXISTS (
     SELECT 1 FROM submission_answers keep
      WHERE keep.submission_id = (SELECT survivor FROM open_rows WHERE open_rows.id = submission_answers.submission_id)
        AND keep.block_ref = submission_answers.block_ref
   );

-- A session that was writing into a losing row is repointed rather than orphaned, so a reconnect
-- that comes back to it lands on the row that survived instead of on an id that no longer exists.
WITH open_rows AS (
  SELECT s.id,
         FIRST_VALUE(s.id) OVER (
           PARTITION BY s.form_id, s.respondent_id, s.is_test
           ORDER BY COALESCE(s.updated_at, s.started_at) DESC, s.id ASC
         ) AS survivor
    FROM submissions s
   WHERE s.respondent_id IS NOT NULL
     AND s.status IN ('in_progress', 'abandoned')
)
UPDATE chat_sessions
   SET submission_id = (SELECT survivor FROM open_rows WHERE open_rows.id = chat_sessions.submission_id)
 WHERE submission_id IN (SELECT id FROM open_rows WHERE id != survivor);

-- The losing rows go, and `ON DELETE CASCADE` takes their leftover answers and their scheduled
-- follow-ups with them. Deleted rather than marked: a duplicate draft is not a state a response
-- can be in, and inventing a status for it would only move the problem into every query that
-- reads the table.
WITH open_rows AS (
  SELECT s.id,
         FIRST_VALUE(s.id) OVER (
           PARTITION BY s.form_id, s.respondent_id, s.is_test
           ORDER BY COALESCE(s.updated_at, s.started_at) DESC, s.id ASC
         ) AS survivor
    FROM submissions s
   WHERE s.respondent_id IS NOT NULL
     AND s.status IN ('in_progress', 'abandoned')
)
DELETE FROM submissions WHERE id IN (SELECT id FROM open_rows WHERE id != survivor);

-- ── 2. Make it impossible from here on ───────────────────────────────────────
--
-- `openResponse` reads a violation of this as "this person's draft already exists" and adopts
-- the row that is already there, so the constraint costs a respondent nothing. See
-- `lib/submissions.ts`.
CREATE UNIQUE INDEX IF NOT EXISTS uq_submissions_one_open_per_respondent
  ON submissions (form_id, respondent_id, is_test)
  WHERE respondent_id IS NOT NULL AND status IN ('in_progress', 'abandoned');

-- The lookup that finds the row to adopt, and the one a collision is then sent to. `0026`
-- indexed `(respondent_id, started_at)` for "everything this person ever answered"; this is the
-- per-form question, which that index leads with the wrong column for.
CREATE INDEX IF NOT EXISTS idx_submissions_form_respondent_status
  ON submissions (form_id, respondent_id, status);
