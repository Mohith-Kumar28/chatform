-- Deleting an account schedules it rather than doing it. The person is signed
-- out everywhere and can sign back in to recover it for 30 days; after that
-- the purge sweep removes the account and everything only it owned.
--
-- deleted_at  when they asked; NULL on every live account. Purged 30 days on.

ALTER TABLE `users` ADD `deleted_at` integer;

CREATE INDEX `idx_users_deleted_at` ON `users` (`deleted_at`) WHERE `deleted_at` IS NOT NULL;
