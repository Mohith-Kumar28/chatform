-- Webhook delivery queue: one row per (event, endpoint), retried on its own.
-- Before this, a retry re-enqueued the whole event and re-sent it to every
-- endpoint, including ones that had already accepted it.
ALTER TABLE `webhook_deliveries` ADD `event_id` text;
ALTER TABLE `webhook_deliveries` ADD `lease_until` integer;
ALTER TABLE `webhook_deliveries` ADD `delivered_at` integer;
ALTER TABLE `webhook_deliveries` ADD `updated_at` integer;
CREATE INDEX `idx_wh_deliveries_status` ON `webhook_deliveries` (`webhook_id`, `status`);

-- Every HTTP attempt a delivery made, so a retry never erases the one before it.
CREATE TABLE `webhook_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `delivery_id` text NOT NULL,
  `attempt` integer NOT NULL,
  `response_status` integer,
  `error` text,
  `response_body` text,
  `duration_ms` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`delivery_id`) REFERENCES `webhook_deliveries`(`id`) ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `idx_wh_attempts_delivery` ON `webhook_attempts` (`delivery_id`, `attempt`);

-- The old statuses. `failed` meant "a retry is scheduled", under a scheme that
-- re-sent to every endpoint; those rows go to the failed list, where they can
-- be retried on purpose. Test sends that failed are simply dead.
UPDATE `webhook_deliveries` SET `status` = 'dead', `next_retry_at` = NULL WHERE `status` = 'failed';
