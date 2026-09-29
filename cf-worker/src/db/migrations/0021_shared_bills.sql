CREATE TABLE `bills` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL REFERENCES `groups`(`groupid`),
	`title` text NOT NULL,
	`amount_minor` integer NOT NULL CHECK (`amount_minor` > 0),
	`currency` text NOT NULL,
	`first_due_date` text NOT NULL,
	`recurrence` text NOT NULL CHECK (`recurrence` IN ('once', 'daily', 'weekly', 'monthly')),
	`payer_user_id` text NOT NULL REFERENCES `user`(`id`),
	`split_basis_points` text NOT NULL,
	`is_active` integer NOT NULL DEFAULT 1,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `bills_group_active_idx` ON `bills` (`group_id`, `is_active`);--> statement-breakpoint
CREATE TABLE `bill_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`bill_id` text NOT NULL REFERENCES `bills`(`id`) ON DELETE CASCADE,
	`group_id` text NOT NULL REFERENCES `groups`(`groupid`),
	`due_date` text NOT NULL,
	`amount_minor` integer NOT NULL CHECK (`amount_minor` > 0),
	`currency` text NOT NULL,
	`payer_user_id` text NOT NULL REFERENCES `user`(`id`),
	`split_basis_points` text NOT NULL,
	`paid_at` text,
	`linked_transaction_id` text,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_occurrences_bill_date_idx` ON `bill_occurrences` (`bill_id`, `due_date`);--> statement-breakpoint
CREATE INDEX `bill_occurrences_group_date_idx` ON `bill_occurrences` (`group_id`, `due_date`);--> statement-breakpoint
CREATE TABLE `bill_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`occurrence_id` text NOT NULL REFERENCES `bill_occurrences`(`id`) ON DELETE CASCADE,
	`user_id` text NOT NULL REFERENCES `user`(`id`),
	`kind` text NOT NULL CHECK (`kind` IN ('upcoming', 'overdue')),
	`created_at` text NOT NULL,
	`read_at` text
);--> statement-breakpoint
CREATE UNIQUE INDEX `bill_reminders_unique_idx` ON `bill_reminders` (`occurrence_id`, `user_id`, `kind`);--> statement-breakpoint
CREATE INDEX `bill_reminders_user_read_idx` ON `bill_reminders` (`user_id`, `read_at`);
