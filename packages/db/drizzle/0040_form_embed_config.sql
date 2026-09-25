-- The embed studio's choices (mode, corner, trigger, launcher text...), so they
-- survive a reload. JSON, owned by the web app's EmbedConfig; null = defaults.
ALTER TABLE `forms` ADD `embed_config` text;
