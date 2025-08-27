PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_budget_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`budget_entry_id` text(100) NOT NULL,
	`description` text(100) NOT NULL,
	`added_time` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`price` text(100),
	`amount` real NOT NULL,
	`budget_id` text NOT NULL,
	`deleted` text,
	`currency` text(10) DEFAULT 'GBP' NOT NULL,
	FOREIGN KEY (`budget_id`) REFERENCES `group_budgets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_budget_entries`("id", "budget_entry_id", "description", "added_time", "price", "amount", "budget_id", "deleted", "currency") SELECT "id", "budget_entry_id", "description", "added_time", "price", "amount", "budget_id", "deleted", "currency" FROM `budget_entries`;--> statement-breakpoint
DROP TABLE `budget_entries`;--> statement-breakpoint
ALTER TABLE `__new_budget_entries` RENAME TO `budget_entries`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE UNIQUE INDEX `budget_entries_budget_entry_id_unique` ON `budget_entries` (`budget_entry_id`);--> statement-breakpoint
CREATE INDEX `budget_entries_monthly_query_idx` ON `budget_entries` (`budget_id`,`deleted`,`added_time`);--> statement-breakpoint
CREATE INDEX `budget_entries_budget_id_deleted_added_time_amount_idx` ON `budget_entries` (`budget_id`,`deleted`,`added_time`,`amount`);--> statement-breakpoint
CREATE INDEX `budget_entries_budget_id_deleted_idx` ON `budget_entries` (`budget_id`,`deleted`);--> statement-breakpoint
CREATE INDEX `budget_entries_budget_id_idx` ON `budget_entries` (`budget_id`);--> statement-breakpoint
CREATE INDEX `budget_entries_amount_idx` ON `budget_entries` (`amount`);--> statement-breakpoint
CREATE INDEX `budget_entries_budget_id_added_time_idx` ON `budget_entries` (`budget_id`,`added_time`);--> statement-breakpoint
CREATE INDEX `budget_entries_added_time_idx` ON `budget_entries` (`added_time`);