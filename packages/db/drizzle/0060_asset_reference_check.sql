-- Builder images (form media, logos, avatars) are referenced by their id inside
-- form documents and profile fields, never by a foreign key, so nothing removes
-- one that stopped being used. `sweepUnusedAssets` looks each one up about once
-- a day and deletes it when nothing names it any more.
--
-- checked_at  when the last lookup found it still in use; NULL until the first

ALTER TABLE `files` ADD `checked_at` integer;

CREATE INDEX `idx_files_asset_check` ON `files` (`checked_at`) WHERE `uploaded_by` = 'builder' AND `form_id` IS NULL;
