CREATE TABLE `expense_budget_links` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text(100) NOT NULL,
	`budget_entry_id` text(100) NOT NULL,
	`group_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`transaction_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`budget_entry_id`) REFERENCES `budget_entries`(`budget_entry_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expense_budget_links_pair_idx` ON `expense_budget_links` (`transaction_id`,`budget_entry_id`);--> statement-breakpoint
CREATE INDEX `expense_budget_links_transaction_idx` ON `expense_budget_links` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `expense_budget_links_budget_entry_idx` ON `expense_budget_links` (`budget_entry_id`);--> statement-breakpoint
CREATE INDEX `expense_budget_links_group_idx` ON `expense_budget_links` (`group_id`);