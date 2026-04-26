import { TransactionCard } from "@/components/TransactionCard";
import { TransactionDetails } from "@/components/TransactionDetails";
import { useTransaction } from "@/hooks/useTransaction";
import { useDeleteTransaction } from "@/hooks/useTransactions";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import type {
	FrontendTransaction,
	ReduxState,
	TransactionMetadata,
} from "split-expense-shared-types";

export default function TransactionDetail() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { data, isLoading, isError } = useTransaction(id);
	const del = useDeleteTransaction();
	const currentUserId = useSelector(
		(state: ReduxState) => state.value?.user?.id,
	);

	if (isLoading) return <div data-test-id="loading">Loading…</div>;
	if (isError || !data) {
		return (
			<div data-test-id="not-found">
				Entry not found or you don't have access.
			</div>
		);
	}

	const tx = data.transaction;
	const metadata = (JSON.parse(tx.metadata) as TransactionMetadata) || {
		owedAmounts: {},
		paidByShares: {},
		owedToAmounts: {},
	};

	let totalOwed = 0;
	for (const tu of data.transactionUsers) {
		if (currentUserId === tu.owed_to_user_id) totalOwed += tu.amount;
		if (currentUserId === tu.user_id) totalOwed -= tu.amount;
	}

	const frontendTx: FrontendTransaction = {
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

	return (
		<div className="transaction-detail" data-test-id="transaction-detail-page">
			<button
				onClick={() => navigate(-1)}
				data-test-id="back-link"
				style={{ marginBottom: 16, cursor: "pointer" }}
			>
				← Back
			</button>
			<TransactionCard
				transaction={frontendTx}
				linkedBudgetEntry={data.linkedBudgetEntry}
				expanded
			>
				<TransactionDetails {...frontendTx} />
			</TransactionCard>
			<button
				onClick={async () => {
					await del.mutateAsync(tx.transaction_id);
					navigate("/expenses");
				}}
				data-test-id="delete"
				style={{ marginTop: 16, cursor: "pointer", color: "red" }}
			>
				Delete
			</button>
		</div>
	);
}
