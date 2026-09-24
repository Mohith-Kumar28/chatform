-- The account a new verified-checkout question starts on. At most one per
-- organization is set; with none set, the oldest active account stands in.
ALTER TABLE payment_accounts ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
