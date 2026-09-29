ALTER TABLE `bills` ADD COLUMN `scheduled_action_id` text REFERENCES `scheduled_actions`(`id`) ON DELETE SET NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `bills_scheduled_action_unique_idx` ON `bills` (`scheduled_action_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_occurrences_linked_transaction_unique_idx` ON `bill_occurrences` (`linked_transaction_id`);
