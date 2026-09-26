-- One row per plan email already sent, so the five-minute sweep sends each once.
-- `due_at` is the instant the notice is about (the day the plan ends), which
-- lets a customer who resubscribes and lapses again get told again.
CREATE TABLE `plan_notices` (
	`subscription_id` text NOT NULL,
	`kind` text NOT NULL,
	`due_at` integer NOT NULL,
	`organization_id` text NOT NULL,
	`sent_at` integer NOT NULL,
	PRIMARY KEY (`subscription_id`, `kind`, `due_at`),
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
