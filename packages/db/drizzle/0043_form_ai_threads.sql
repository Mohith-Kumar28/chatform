-- The builder AI bar's conversation about a form. It lived only in the
-- author's browser storage, so nobody else, a teammate or a support admin
-- acting as them, could see what had been asked. One row per form, the turns
-- as JSON, replaced whole on every save.
CREATE TABLE `form_ai_threads` (
  `form_id` text PRIMARY KEY NOT NULL,
  `turns_json` text NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`form_id`) REFERENCES `forms`(`id`) ON UPDATE no action ON DELETE cascade
);
