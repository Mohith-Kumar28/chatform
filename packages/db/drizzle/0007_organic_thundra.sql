ALTER TABLE `integrations` ADD `secret_hash` text;--> statement-breakpoint
CREATE INDEX `idx_integrations_form` ON `integrations` (`form_id`,`provider`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_integrations_secret` ON `integrations` (`secret_hash`);