-- Telling two respondents apart when neither has signed in.
--
-- The only thing we had was a hashed IP, which is a network rather than a
-- person: a hundred people in one office share it, and one person moving from
-- wifi to mobile data stops sharing it with themselves. It was wrong in both
-- directions and it was the sole input to the `allowResubmissions` gate.
--
-- A device signal computed in the browser is the better key for that gate, and
-- it is also the only way to hand somebody back a half-finished response after
-- they cleared their storage or opened the form in a private window — the two
-- cases where the session id in `localStorage` is gone but the person is not.
--
-- `submissions.fingerprint` and `forms.fingerprint_salt` already exist for
-- exactly this and were never written to. This adds the missing half: the same
-- key on the session, so the gate can be checked before a response row exists.
--
-- Salted per form on the way in, so the same device answering two different
-- customers' forms produces two unrelated values and nothing here can be used
-- to follow somebody around.
ALTER TABLE chat_sessions ADD COLUMN fingerprint TEXT;

-- Both reads are "this form, this device": the resubmission gate, and the
-- lookup that finds an anonymous respondent's unfinished response.
CREATE INDEX IF NOT EXISTS idx_chat_sessions_form_fp ON chat_sessions (form_id, fingerprint);
