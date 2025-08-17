ALTER TABLE `budget` RENAME TO `budget_entries`;--> statement-breakpoint
DROP INDEX `budget_monthly_query_idx`;--> statement-breakpoint
DROP INDEX `budget_name_groupid_deleted_added_time_amount_idx`;--> statement-breakpoint
DROP INDEX `budget_name_groupid_deleted_idx`;--> statement-breakpoint
DROP INDEX `budget_name_price_idx`;--> statement-breakpoint
DROP INDEX `budget_name_idx`;--> statement-breakpoint
DROP INDEX `budget_amount_idx`;--> statement-breakpoint
DROP INDEX `budget_name_added_time_idx`;--> statement-breakpoint
DROP INDEX `budget_added_time_idx`;--> statement-breakpoint
DROP INDEX `budget_budget_id_idx`;--> statement-breakpoint
CREATE INDEX `budget_entries_monthly_query_idx` ON `budget_entries` (`name`,`groupid`,`deleted`,`added_time`);--> statement-breakpoint
CREATE INDEX `budget_entries_name_groupid_deleted_added_time_amount_idx` ON `budget_entries` (`name`,`groupid`,`deleted`,`added_time`,`amount`);--> statement-breakpoint
CREATE INDEX `budget_entries_name_groupid_deleted_idx` ON `budget_entries` (`name`,`groupid`,`deleted`);--> statement-breakpoint
CREATE INDEX `budget_entries_name_price_idx` ON `budget_entries` (`name`,`price`);--> statement-breakpoint
CREATE INDEX `budget_entries_name_idx` ON `budget_entries` (`name`);--> statement-breakpoint
CREATE INDEX `budget_entries_amount_idx` ON `budget_entries` (`amount`);--> statement-breakpoint
CREATE INDEX `budget_entries_name_added_time_idx` ON `budget_entries` (`name`,`added_time`);--> statement-breakpoint
CREATE INDEX `budget_entries_added_time_idx` ON `budget_entries` (`added_time`);--> statement-breakpoint
CREATE INDEX `budget_entries_budget_id_idx` ON `budget_entries` (`budget_id`);