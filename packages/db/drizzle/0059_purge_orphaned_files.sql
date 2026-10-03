-- Uploads orphaned before 0058: their organization, form or conversation was
-- deleted by a route that did not clean up after itself (deleting an
-- organization from settings, a response, a workspace with archived forms).
-- Deleting the rows queues their R2 objects through `trg_files_purge`.

DELETE FROM `files` WHERE `organization_id` NOT IN (SELECT `id` FROM `organizations`);
DELETE FROM `files` WHERE `form_id` IS NOT NULL AND `form_id` NOT IN (SELECT `id` FROM `forms`);
DELETE FROM `files` WHERE `session_id` IS NOT NULL AND `session_id` NOT IN (SELECT `id` FROM `chat_sessions`);
