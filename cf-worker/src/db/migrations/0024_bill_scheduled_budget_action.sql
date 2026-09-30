ALTER TABLE bills ADD COLUMN scheduled_budget_action_id TEXT REFERENCES scheduled_actions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX bills_scheduled_budget_action_unique_idx ON bills(scheduled_budget_action_id);
