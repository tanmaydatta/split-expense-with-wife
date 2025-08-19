CREATE TABLE `group_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`budget_name` text NOT NULL,
	`description` text,
	`created_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`updated_at` text DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
	`deleted` text,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`groupid`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `group_budgets_group_id_idx` ON `group_budgets` (`group_id`);--> statement-breakpoint
CREATE INDEX `group_budgets_group_name_active_idx` ON `group_budgets` (`group_id`,`budget_name`) WHERE "group_budgets"."deleted" is null;--> statement-breakpoint
INSERT INTO group_budgets (id, group_id, budget_name, created_at, updated_at) SELECT 'budget_' || lower(hex(randomblob(8))) as id, groups.groupid, json_each.value as budget_name, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM groups, json_each(groups.budgets) WHERE groups.budgets IS NOT NULL AND groups.budgets != '' AND groups.budgets != '[]' AND json_valid(groups.budgets);