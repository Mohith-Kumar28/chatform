-- Deleting a form moves it to the Archive. It stays restorable for 30 days,
-- then the purge sweep removes it for good: responses, uploads and all.
--
-- purge_at      when the sweep may delete it; NULL on every live form
-- deleted_by    who archived it, so the warning mail reaches the person who acted
-- purge_notice  the last warning sent ('3d' or '1d'), so each goes out once

ALTER TABLE `forms` ADD `purge_at` integer;
ALTER TABLE `forms` ADD `deleted_by` text;
ALTER TABLE `forms` ADD `purge_notice` text;

CREATE INDEX `idx_forms_purge_at` ON `forms` (`purge_at`) WHERE `purge_at` IS NOT NULL;

-- Forms deleted before the Archive existed: 30 days from their deletion, and
-- never sooner than a week from now, so their owners still get both warnings.
UPDATE `forms`
   SET `purge_at` = MAX(`deleted_at` + 30 * 86400000, CAST(strftime('%s', 'now') AS INTEGER) * 1000 + 7 * 86400000)
 WHERE `deleted_at` IS NOT NULL AND `purge_at` IS NULL;
