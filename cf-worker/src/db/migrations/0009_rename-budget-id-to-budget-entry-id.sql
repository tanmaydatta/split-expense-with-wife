ALTER TABLE `budget_entries` RENAME COLUMN "budget_id" TO "budget_entry_id";--> statement-breakpoint
DROP INDEX `budget_entries_budget_id_idx`;--> statement-breakpoint
CREATE INDEX `budget_entries_budget_entry_id_idx` ON `budget_entries` (`budget_entry_id`);