-- The response a reminder link pointed at, held back from a session until the
-- sign-in shows the person who clicked is the one it belongs to. Set only for
-- a response signed in without a verified email (a phone sign-in), because
-- that reminder went to an address nobody proved. NULL everywhere else, and
-- on every session older than this. See `resumeSignInProvider` in
-- apps/api/src/lib/open-session.ts.
ALTER TABLE `chat_sessions` ADD `held_resume_id` text;
