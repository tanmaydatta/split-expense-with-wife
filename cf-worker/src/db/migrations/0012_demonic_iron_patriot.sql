PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_budget_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`budget_entry_id` text(100),
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
INSERT INTO `__new_budget_entries`("id", "budget_entry_id", "description", "added_time", "price", "amount", "budget_id", "deleted", "currency") SELECT DISTINCT be."id", be."budget_entry_id", be."description", be."added_time", be."price", be."amount", COALESCE((SELECT gb.id FROM `group_budgets` gb WHERE gb."budget_name" = be."name" AND gb."group_id" = be."groupid" AND gb."deleted" IS NULL LIMIT 1), 'unknown_budget_' || be."name") as "budget_id", be."deleted", be."currency" FROM `budget_entries` be;--> statement-breakpoint
DROP TABLE IF EXISTS `budget_entries`;--> statement-breakpoint
ALTER TABLE `__new_budget_entries` RENAME TO `budget_entries`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_entries_monthly_query_idx` ON `budget_entries` (`budget_id`,`deleted`,`added_time`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_entries_budget_id_deleted_added_time_amount_idx` ON `budget_entries` (`budget_id`,`deleted`,`added_time`,`amount`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_entries_budget_id_deleted_idx` ON `budget_entries` (`budget_id`,`deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_entries_budget_id_idx` ON `budget_entries` (`budget_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_entries_amount_idx` ON `budget_entries` (`amount`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_entries_budget_id_added_time_idx` ON `budget_entries` (`budget_id`,`added_time`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_entries_added_time_idx` ON `budget_entries` (`added_time`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_entries_budget_entry_id_idx` ON `budget_entries` (`budget_entry_id`);--> statement-breakpoint
CREATE TABLE `__new_budget_totals` (
	`budget_id` text NOT NULL,
	`currency` text(10) NOT NULL,
	`total_amount` real DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`budget_id`, `currency`),
	FOREIGN KEY (`budget_id`) REFERENCES `group_budgets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_budget_totals`("budget_id", "currency", "total_amount", "updated_at") SELECT DISTINCT COALESCE((SELECT gb.id FROM `group_budgets` gb WHERE gb."budget_name" = bt."name" AND gb."group_id" = bt."group_id" AND gb."deleted" IS NULL LIMIT 1), 'unknown_budget_' || bt."name") as "budget_id", bt."currency", bt."total_amount", bt."updated_at" FROM `budget_totals` bt;--> statement-breakpoint
DROP TABLE IF EXISTS `budget_totals`;--> statement-breakpoint
ALTER TABLE `__new_budget_totals` RENAME TO `budget_totals`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `budget_totals_budget_id_idx` ON `budget_totals` (`budget_id`);