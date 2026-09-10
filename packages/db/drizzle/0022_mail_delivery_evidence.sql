-- What actually left, and where to look it up.
--
-- `mail_deliveries` recorded `sent` the moment `runMailJob` returned without
-- throwing, and three quite different things return without throwing: a job
-- that sent mail, a job that had nobody to mail because the form carries no
-- notification addresses, and a job that "sent" through the noop transport
-- because no provider is configured. All three read as a delivered message on
-- the health page. That is not a cosmetic problem: the first question anybody
-- asks when a notification does not arrive is "did we send it", and this table
-- answered yes to all three.
--
-- Two columns and one new status (`skipped`) separate them. Neither column is a
-- recipient address, and there is still no column for one. `domain` now carries
-- the deduped domains a job actually wrote to — it was empty for every
-- `submission` and `followup` row, because those jobs carry identifiers and the
-- consumer looks the addresses up, which left the one column meant to answer
-- "is Gmail rejecting us" blank for exactly the mail people ask that about.
--
-- Hand-written, as 0016 was. See that migration for why `drizzle-kit generate`
-- is not used on this table.

-- 'cloudflare' | 'resend' | 'noop', comma-separated on the rare job that used
-- more than one. `noop` is the important value: it means the message was
-- rendered, counted, and never sent, because no provider was configured.
ALTER TABLE mail_deliveries ADD COLUMN transport TEXT;

-- The provider's own ids for the messages this job sent, as a JSON array. This
-- is what makes a row here findable in Cloudflare's `emailSendingAdaptive` log
-- or Resend's dashboard, which is the difference between "we sent it" and "they
-- accepted it and then dropped it".
ALTER TABLE mail_deliveries ADD COLUMN message_ids TEXT;
