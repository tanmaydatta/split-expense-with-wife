CREATE TABLE `scheduled_action_history` (
	`id` text PRIMARY KEY NOT NULL,
	`scheduled_action_id` text NOT NULL,
	`user_id` text NOT NULL,
	`action_type` text NOT NULL,
	`executed_at` text NOT NULL,
	`execution_status` text NOT NULL,
	`action_data` text NOT NULL,
	`result_data` text,
	`error_message` text,
	`execution_duration_ms` integer,
	FOREIGN KEY (`scheduled_action_id`) REFERENCES `scheduled_actions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `scheduled_action_history_user_executed_idx` ON `scheduled_action_history` (`user_id`,`executed_at`);--> statement-breakpoint
CREATE INDEX `scheduled_action_history_scheduled_action_idx` ON `scheduled_action_history` (`scheduled_action_id`,`executed_at`);--> statement-breakpoint
CREATE INDEX `scheduled_action_history_status_idx` ON `scheduled_action_history` (`execution_status`);--> statement-breakpoint
CREATE TABLE `scheduled_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action_type` text NOT NULL,
	`frequency` text NOT NULL,
	`start_date` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`action_data` text NOT NULL,
	`last_executed_at` text,
	`next_execution_date` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `scheduled_actions_user_next_execution_idx` ON `scheduled_actions` (`user_id`,`next_execution_date`);--> statement-breakpoint
CREATE INDEX `scheduled_actions_user_active_idx` ON `scheduled_actions` (`user_id`,`is_active`);