-- Additive covering indexes for household-scoped maintenance keyset reads.
-- No financial or category data is changed.
CREATE INDEX IF NOT EXISTS transactions_group_live_id_idx ON transactions(group_id,deleted,transaction_id);
CREATE INDEX IF NOT EXISTS budget_entries_budget_live_id_idx ON budget_entries(budget_id,deleted,budget_entry_id);
