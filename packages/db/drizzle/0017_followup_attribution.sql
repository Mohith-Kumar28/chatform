-- What a nudge actually did.
--
-- Until now a follow-up row recorded only that we sent it. Whether anybody
-- opened the link, and whether opening it led to a finished response, was
-- unrecorded — so the one number the feature exists to produce ("how many
-- responses did this recover?") could not be computed at all, and the holdout
-- arm that `scheduleFollowUps` has been writing since day one had nothing to
-- be compared against.
--
-- Two timestamps rather than a status change, because these are orthogonal to
-- the send lifecycle: a row is `sent` whether or not it was clicked, and
-- collapsing them into `status` would lose the send date the moment somebody
-- came back.

-- When the resume link in this message was opened. Set once — a second visit
-- from the same message is the same recovery, and overwriting would move the
-- click into whichever day they last happened to reopen their inbox.
ALTER TABLE followups ADD COLUMN clicked_at INTEGER;

-- When the response this message was about reached `completed`. Credited to
-- the most recently clicked step, so a sequence of three cannot claim three
-- recoveries for one person.
ALTER TABLE followups ADD COLUMN recovered_at INTEGER;

-- The analytics query groups by step over one form and reads these two
-- columns. Without this it is a scan of every follow-up ever scheduled.
CREATE INDEX IF NOT EXISTS idx_followups_form_step ON followups (form_id, step);
