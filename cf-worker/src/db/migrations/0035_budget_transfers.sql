-- Explicit internal transfers. Additive metadata; existing financial rows are unchanged.
CREATE TABLE budget_transfers (
 id TEXT PRIMARY KEY,
 group_id TEXT NOT NULL REFERENCES groups(groupid),
 actor_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 source_budget_id TEXT NOT NULL REFERENCES group_budgets(id),
 destination_budget_id TEXT NOT NULL REFERENCES group_budgets(id),
 amount REAL NOT NULL CONSTRAINT budget_transfers_amount_check CHECK(amount > 0 AND amount <= 1000000000),
 currency TEXT NOT NULL,
 added_time TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL,
 deleted TEXT,
 deletion_token TEXT,
 CONSTRAINT budget_transfers_distinct_check CHECK(source_budget_id <> destination_budget_id),
 CONSTRAINT budget_transfers_request_unique UNIQUE(group_id,actor_id,request_id)
);
--> statement-breakpoint
CREATE TABLE budget_transfer_entries (
 entry_id TEXT PRIMARY KEY REFERENCES budget_entries(budget_entry_id),
 transfer_id TEXT NOT NULL REFERENCES budget_transfers(id),
 role TEXT NOT NULL CONSTRAINT budget_transfer_entries_role_check CHECK(role IN ('source','destination')),
 CONSTRAINT budget_transfer_entries_role_unique UNIQUE(transfer_id,role)
);
--> statement-breakpoint
-- Transfers cannot become expense or bank-link targets through any API path.
CREATE TRIGGER budget_transfer_no_expense_link BEFORE INSERT ON expense_budget_links
WHEN EXISTS(SELECT 1 FROM budget_transfer_entries WHERE entry_id=NEW.budget_entry_id)
BEGIN SELECT RAISE(ABORT,'Transfers cannot link to expenses'); END;
--> statement-breakpoint
CREATE TRIGGER budget_transfer_no_expense_relink BEFORE UPDATE OF budget_entry_id ON expense_budget_links
WHEN EXISTS(SELECT 1 FROM budget_transfer_entries WHERE entry_id=NEW.budget_entry_id)
BEGIN SELECT RAISE(ABORT,'Transfers cannot link to expenses'); END;
--> statement-breakpoint
CREATE TRIGGER budget_transfer_no_bank_link BEFORE UPDATE OF linked_budget_entry_id ON bank_transactions
WHEN EXISTS(SELECT 1 FROM budget_transfer_entries WHERE entry_id=NEW.linked_budget_entry_id)
BEGIN SELECT RAISE(ABORT,'Transfers cannot link to bank imports'); END;
--> statement-breakpoint
CREATE TRIGGER budget_transfer_no_bank_insert BEFORE INSERT ON bank_transactions
WHEN EXISTS(SELECT 1 FROM budget_transfer_entries WHERE entry_id=NEW.linked_budget_entry_id)
BEGIN SELECT RAISE(ABORT,'Transfers cannot link to bank imports'); END;
--> statement-breakpoint
