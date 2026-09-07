CREATE TABLE `form_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`form_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`form_version_id` text,
	`kind` text NOT NULL,
	`actor_type` text DEFAULT 'user' NOT NULL,
	`actor_id` text,
	`actor_label` text,
	`source` text DEFAULT 'builder' NOT NULL,
	`summary` text NOT NULL,
	`changes` text,
	`change_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`form_version_id`) REFERENCES `form_versions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_activity_form_created` ON `form_activity` (`form_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_activity_form_version` ON `form_activity` (`form_id`,`form_version_id`);