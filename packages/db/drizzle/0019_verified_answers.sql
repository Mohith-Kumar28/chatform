-- One-time codes now prove two different things, so a challenge has to say which.
--
-- `otp_challenges` was built for the sign-in gate alone: one outstanding code per
-- session, and `verifyPhoneChallenge` simply took the newest unconsumed row. That
-- stops being true the moment a *question* can ask for a code too — a form that
-- gates on sign-in and then asks for a delivery number has two live challenges for
-- two different destinations, and whichever was sent last would answer for both.
--
-- `scope` is what a code was sent for: `auth` for the gate, `block:<ref>` for an
-- answer. Verification reads its own scope and nothing else, so the two flows
-- cannot consume each other's codes and the send caps count separately.
--
-- `channel` is how it left: an email answer gets a mailed code, a phone answer an
-- SMS. Kept on the row rather than derived from the destination so the resend the
-- respondent sees ("we'll email it again") is the one that actually happens.
--
-- Both default to the sign-in gate's behaviour, so rows written before this — and
-- any code in flight during the deploy — still verify exactly as they did.
ALTER TABLE otp_challenges ADD COLUMN scope TEXT NOT NULL DEFAULT 'auth';--> statement-breakpoint
ALTER TABLE otp_challenges ADD COLUMN channel TEXT NOT NULL DEFAULT 'sms';--> statement-breakpoint

-- Every read is "this session, this scope, newest first"; the old index stopped at
-- the session and made the scope a filter over rows it had already fetched.
CREATE INDEX IF NOT EXISTS idx_otp_session_scope ON otp_challenges (session_id, scope, created_at);
