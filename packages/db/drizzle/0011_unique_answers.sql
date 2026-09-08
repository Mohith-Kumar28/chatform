-- "Is this team name already taken?"
--
-- A question can now be marked `unique`, and every answer to one is checked
-- against every answer that question has already collected on this form before
-- it is accepted. Without an index that check reads every row the question has
-- ever produced — on the hot path of answering, once per answer.
--
-- `COLLATE NOCASE` is on the column rather than in the query on purpose. The
-- comparison has to be case-insensitive ("Team Alpha" and "team alpha" are one
-- name to everybody except a database), and wrapping the column in `lower()` at
-- query time would make the index unusable for exactly the lookup it exists to
-- serve. So the collation lives here, and `findDuplicateAnswer` writes the
-- matching `value_json = ?N COLLATE NOCASE`.
--
-- Not a UNIQUE index: the flag is per question and per form, set and unset in
-- the builder, and this one table holds the answers to every question of every
-- form in the account. A constraint here would apply to all of them.
CREATE INDEX IF NOT EXISTS idx_answers_unique_lookup
  ON submission_answers (form_id, block_ref, value_json COLLATE NOCASE);
