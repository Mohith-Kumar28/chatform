-- The two columns follow-ups need on existing tables.
--
-- Separate from `0010_followups.sql` because that migration had already been
-- applied by the time these were written, and D1 records a migration as done by
-- filename: editing an applied file means the statements added to it never run
-- anywhere they have already been seen, while a fresh database gets them. That
-- divergence is silent and shows up much later as a missing column in one
-- environment. A new file is the only way to add to a migration that has run.
--
-- The sender's physical postal address, for the footer of marketing mail.
-- CAN-SPAM requires it on any commercial message, and a nudge to somebody who
-- abandoned a form is commercial: the transactional exemption is a closed list
-- of five and none covers a transaction the recipient never agreed to enter
-- into. Null until the customer supplies it, and follow-ups do not enable
-- without it.
ALTER TABLE organizations ADD COLUMN postal_address TEXT;

-- The respondent declined follow-ups at the moment we asked for their address.
-- On the session rather than the response because the offer is made while the
-- address question is on screen, which can be before a response row exists at
-- all — answers create it lazily. A column rather than a flag inside `meta`
-- because the scheduler reads it on every abandonment.
ALTER TABLE chat_sessions ADD COLUMN followup_opt_out INTEGER NOT NULL DEFAULT 0;
