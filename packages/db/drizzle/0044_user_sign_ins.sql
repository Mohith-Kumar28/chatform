-- Where and on what a customer signed up, and every sign-in since: the same
-- geo, network and device record a response carries (`meta.context`), built by
-- the same function. Read by the admin console's account page. The raw IP is
-- never stored.
CREATE TABLE `user_sign_ins` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('sign_up', 'sign_in')),
  `method` text,
  `context_json` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `idx_user_sign_ins_user` ON `user_sign_ins` (`user_id`, `created_at`);
