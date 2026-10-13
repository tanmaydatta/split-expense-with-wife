import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorContainer } from "@/components/MessageContainer";
import { TransactionCard } from "@/components/TransactionCard";
import { TransactionDetails } from "@/components/TransactionDetails";
import { Surface, UiButton, UiPage, UiPageDescription, UiPageHeader, UiPageTitle } from "@/components/ui";
import { useTransaction } from "@/hooks/useTransaction";
import { useDeleteTransaction } from "@/hooks/useTransactions";
import { buildFrontendTransaction } from "@/utils/transaction";
import { useState } from "react";
import { useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import type { ReduxState } from "split-expense-shared-types";
import "../entry-detail.css";

export default function TransactionDetail() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { data, isLoading, isError } = useTransaction(id);
	const del = useDeleteTransaction();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const currentUserId = useSelector(
		(state: ReduxState) => state.value?.user?.id,
	);

	if (isLoading) return <UiPage><Surface data-test-id="loading">Loading expense…</Surface></UiPage>;
	if (isError || !data) {
		return <UiPage><Surface data-test-id="not-found">Entry not found or you don't have access.</Surface></UiPage>;
	}

	const tx = data.transaction;
	const frontendTx = buildFrontendTransaction(
		tx,
		data.transactionUsers,
		currentUserId,
	);

	const deleteTransaction = async () => {
		try {
			await del.mutateAsync(tx.transaction_id);
			navigate("/expenses");
		} catch {
			// The mutation error is displayed below the heading, so the user can retry.
		}
	};

	return (
		<UiPage className="entry-detail-page" data-test-id="transaction-detail-page">
			<UiPageHeader>
				<div>
					<UiPageTitle>Expense details</UiPageTitle>
					<UiPageDescription>Review this expense and its linked budget entry.</UiPageDescription>
				</div>
				<UiButton type="button" onClick={() => navigate(-1)} data-test-id="back-link">← Back</UiButton>
			</UiPageHeader>
			{del.error && <ErrorContainer message={del.error.message || "Could not delete expense"} onClose={del.reset} />}
			<TransactionCard
				transaction={frontendTx}
				linkedBudgetEntry={data.linkedBudgetEntry}
				expanded
			>
				<TransactionDetails {...frontendTx} />
			</TransactionCard>
			<div className="entry-detail-actions">
				<UiButton type="button" $tone="danger" onClick={() => setConfirmOpen(true)} disabled={del.isPending} data-test-id="delete">
					Delete expense
				</UiButton>
			</div>
			<ConfirmDialog
				open={confirmOpen}
				title="Delete expense?"
				message="This removes the expense from your group's records."
				confirmText="Delete expense"
				onCancel={() => setConfirmOpen(false)}
				onConfirm={() => { setConfirmOpen(false); void deleteTransaction(); }}
			/>
		</UiPage>
	);
}
