import { TransactionCard } from "@/components/TransactionCard";
import { TransactionDetails } from "@/components/TransactionDetails";
import { useTransaction } from "@/hooks/useTransaction";
import { useDeleteTransaction } from "@/hooks/useTransactions";
import { buildFrontendTransaction } from "@/utils/transaction";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import type { ReduxState } from "split-expense-shared-types";

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
	const frontendTx = buildFrontendTransaction(
		tx,
		data.transactionUsers,
		currentUserId,
	);

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
