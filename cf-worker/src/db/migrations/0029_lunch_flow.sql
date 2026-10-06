-- Lunch Flow preserves raw provider signs; account calibration is explicit.
ALTER TABLE bank_accounts ADD COLUMN amount_multiplier INTEGER CHECK (amount_multiplier IN (-1, 1));
ALTER TABLE bank_transactions ADD COLUMN raw_amount_minor INTEGER;
-- One Personal API destination per owner prevents duplicate account imports.
CREATE UNIQUE INDEX bank_connections_lunch_flow_owner_idx ON bank_connections(user_id) WHERE provider = 'lunch_flow';
ALTER TABLE bank_transactions ADD COLUMN row_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bank_connections ADD COLUMN last_background_attempt_at TEXT;
