-- The warnings before a deleted account is erased: three days out, then the
-- day before. Records the last one sent ('3d' or '1d') so each goes out once.
-- Cleared when the account is recovered.

ALTER TABLE `users` ADD `deletion_notice` text;
