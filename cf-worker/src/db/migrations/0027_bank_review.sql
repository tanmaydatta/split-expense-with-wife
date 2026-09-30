ALTER TABLE bank_transactions ADD COLUMN review_status TEXT NOT NULL DEFAULT 'unreviewed' CHECK (review_status IN ('unreviewed', 'ignored', 'matched', 'created'));
CREATE UNIQUE INDEX bank_transactions_linked_expense_idx ON bank_transactions(linked_transaction_id) WHERE linked_transaction_id IS NOT NULL;
