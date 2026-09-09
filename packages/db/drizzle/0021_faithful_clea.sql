-- Knowledge base: sources an author adds to a form, and the chunks behind the vectors.
--
-- Hand-trimmed, as 0011 and 0016 were before it. `drizzle-kit generate` emits a diff
-- against its own meta snapshot, and that snapshot does not know about the tables added
-- by the hand-written migrations (0010's `followups`, 0016's `mail_deliveries` and
-- `email_suppressions`, 0014's platform tables). It therefore re-emits them as CREATEs,
-- and applying that verbatim fails on the first `table already exists`. Only the two new
-- tables belong in this file; the snapshot in `meta/` is correct and is left alone.
CREATE TABLE `knowledge_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`form_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`origin` text,
	`file_id` text,
	`raw_text` text,
	`external_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`bytes` integer DEFAULT 0 NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`checksum_sha256` text,
	`created_at` integer NOT NULL,
	`indexed_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_sources_form` ON `knowledge_sources` (`form_id`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_sources_status` ON `knowledge_sources` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`form_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `knowledge_sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_knowledge_chunks_source` ON `knowledge_chunks` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_chunks_form` ON `knowledge_chunks` (`form_id`);
