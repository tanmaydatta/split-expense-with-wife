ALTER TABLE `scheduled_action_history` ADD `workflow_instance_id` text;--> statement-breakpoint
ALTER TABLE `scheduled_action_history` ADD `workflow_status` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `scheduled_action_history_workflow_instance_idx` ON `scheduled_action_history` (`workflow_instance_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `scheduled_action_history_action_date_unique_idx` ON `scheduled_action_history` (`scheduled_action_id`,`executed_at`);