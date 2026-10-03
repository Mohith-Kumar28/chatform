-- What a deleted row leaves outside D1, queued by the database itself.
--
-- Uploads and exports live in R2, knowledge chunks in Vectorize, conversations
-- in a Durable Object per session. A row that names one of them can go by many
-- routes: a purge, a response delete, a workspace or organization cascade. Each
-- route used to have to remember the outside half, and several did not. These
-- triggers record it on every route, cascades included, and the five-minute
-- cron (`drainStoragePurges`) deletes what is queued.
--
-- kind  'r2' (an object key), 'vector' (a Vectorize id) or 'session' (a SessionDO name)

CREATE TABLE `storage_purges` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `kind` text NOT NULL,
  `ref` text NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `queued_at` integer NOT NULL
);

CREATE INDEX `idx_storage_purges_kind` ON `storage_purges` (`kind`, `id`);

-- `files` is the only index of the uploads in R2, so its rows queue their objects.
CREATE TRIGGER `trg_files_purge` AFTER DELETE ON `files`
BEGIN
  INSERT INTO `storage_purges` (`kind`, `ref`, `queued_at`)
  VALUES ('r2', OLD.`r2_key`, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
END;

CREATE TRIGGER `trg_exports_purge` AFTER DELETE ON `exports` WHEN OLD.`r2_key` IS NOT NULL
BEGIN
  INSERT INTO `storage_purges` (`kind`, `ref`, `queued_at`)
  VALUES ('r2', OLD.`r2_key`, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
END;

-- A chunk's id is its vector's id in Vectorize.
CREATE TRIGGER `trg_knowledge_chunks_purge` AFTER DELETE ON `knowledge_chunks`
BEGIN
  INSERT INTO `storage_purges` (`kind`, `ref`, `queued_at`)
  VALUES ('vector', OLD.`id`, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
END;

-- A conversation's transcript lives in its SessionDO, and its uploads in `files`
-- (which has no foreign keys, so nothing else would remove them).
CREATE TRIGGER `trg_chat_sessions_purge` AFTER DELETE ON `chat_sessions`
BEGIN
  INSERT INTO `storage_purges` (`kind`, `ref`, `queued_at`)
  VALUES ('session', OLD.`id`, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
  DELETE FROM `files` WHERE `session_id` = OLD.`id`;
END;

CREATE TRIGGER `trg_forms_files` AFTER DELETE ON `forms`
BEGIN
  DELETE FROM `files` WHERE `form_id` = OLD.`id`;
END;

CREATE TRIGGER `trg_organizations_files` AFTER DELETE ON `organizations`
BEGIN
  DELETE FROM `files` WHERE `organization_id` = OLD.`id`;
END;

-- Expired import trials were soft-deleted without a purge date, so the purge
-- sweep never took them. Nobody owns them; they are due now.
UPDATE `forms` SET `purge_at` = `deleted_at`
 WHERE `organization_id` = 'org_import_trials' AND `deleted_at` IS NOT NULL AND `purge_at` IS NULL;
