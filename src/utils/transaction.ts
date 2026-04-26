import type {
	FrontendTransaction,
	Transaction,
	TransactionMetadata,
	TransactionUser,
} from "split-expense-shared-types";

/**
 * Builds a FrontendTransaction from a raw Transaction + its TransactionUser rows.
 * Mirrors the conversion logic in useTransactions.ts:processTransactionData().
 */
export function buildFrontendTransaction(
	tx: Transaction,
	users: TransactionUser[],
	currentUserId: string | undefined,
): FrontendTransaction {
	const metadata = (JSON.parse(tx.metadata) as TransactionMetadata) || {
		owedAmounts: {},
		paidByShares: {},
		owedToAmounts: {},
	};

	let totalOwed = 0;
	for (const tu of users) {
		if (currentUserId === tu.owed_to_user_id) totalOwed += tu.amount;
		if (currentUserId === tu.user_id) totalOwed -= tu.amount;
	}

	return {
		transactionId: tx.transaction_id,
		description: tx.description,
		totalAmount: tx.amount,
		date: tx.created_at,
		amountOwed: metadata.owedAmounts,
		paidBy: metadata.paidByShares,
		owedTo: metadata.owedToAmounts,
		totalOwed,
		currency: tx.currency,
		linkedBudgetEntryIds: tx.linkedBudgetEntryIds,
	};
}
