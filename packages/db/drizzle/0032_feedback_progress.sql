-- How far into the conversation a respondent was when they reported a bug.
--
-- A separate migration rather than two more lines in 0031, which is already applied: a peer
-- session can apply a migration mid-edit, and anything added to it afterwards silently never
-- runs for them.
--
-- ── Why this is stored, and not read from `chat_sessions` ──
--
-- `chat_sessions.collected_count` and `turn_count` are only written when a response finalises
-- (and on start-over). For a conversation that is still going — which is exactly when somebody
-- stops to say the picker is broken — both are zero, so the console and the founders' mail were
-- reporting "nothing answered yet" beside a replay that showed three answers. Joining to the
-- response by session does not fix it either: adopting a returning respondent's draft keeps the
-- draft's original session id. The only authoritative count is the live session object, so the
-- report asks it at the moment it is filed and writes the answer down here.
ALTER TABLE respondent_feedback ADD COLUMN answered INTEGER;
ALTER TABLE respondent_feedback ADD COLUMN turns INTEGER;
