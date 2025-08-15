PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`transaction_id` text(100) PRIMARY KEY NOT NULL,
	`description` text(255) NOT NULL,
	`amount` real NOT NULL,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`metadata` text,
	`currency` text(10) NOT NULL,
	`group_id` text NOT NULL,
	`deleted` text
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("transaction_id", "description", "amount", "created_at", "metadata", "currency", "group_id", "deleted") SELECT "transaction_id", "description", "amount", "created_at", "metadata", "currency", "group_id", "deleted" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE INDEX `transactions_group_id_deleted_created_at_idx` ON `transactions` (`group_id`,`deleted`,`created_at`);--> statement-breakpoint
CREATE INDEX `transactions_created_at_idx` ON `transactions` (`created_at`);--> statement-breakpoint
CREATE INDEX `transactions_group_id_idx` ON `transactions` (`group_id`);