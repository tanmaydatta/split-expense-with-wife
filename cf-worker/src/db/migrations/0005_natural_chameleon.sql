ALTER TABLE `budget` ADD `budget_id` text(100);--> statement-breakpoint
CREATE INDEX `budget_budget_id_idx` ON `budget` (`budget_id`);