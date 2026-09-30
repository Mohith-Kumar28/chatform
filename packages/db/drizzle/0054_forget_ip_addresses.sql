-- No IP address is read, hashed, stored or counted anywhere any more. Limits
-- key on the FingerprintJS device id or the signed-in user; sign-in attempts
-- are capped per account. This clears what the old code had written.
--
-- The columns stay, so older code reading them during a deploy finds NULL
-- rather than a missing column, and nothing writes to them again.

UPDATE `chat_sessions` SET `ip_hash` = NULL WHERE `ip_hash` IS NOT NULL;
UPDATE `sessions` SET `ip_address` = NULL WHERE `ip_address` IS NOT NULL;
UPDATE `import_trials` SET `ip_hash` = NULL WHERE `ip_hash` IS NOT NULL;
UPDATE `audit_logs` SET `ip_hash` = NULL WHERE `ip_hash` IS NOT NULL;

-- Daily import counters were keyed by device and, separately, by address.
-- They cannot be told apart once hashed, and they reset every day anyway.
DELETE FROM `import_quota`;
