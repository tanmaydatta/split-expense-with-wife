import { BudgetEntryCard } from "@/components/BudgetEntryCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorContainer } from "@/components/MessageContainer";
import { Surface, UiButton, UiPage, UiPageDescription, UiPageHeader, UiPageTitle } from "@/components/ui";
import { useBudgetEntry } from "@/hooks/useBudgetEntry";
import { useDeleteBudgetEntry } from "@/hooks/useBudget";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../entry-detail.css";

export default function BudgetEntryDetail() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { data, isLoading, isError } = useBudgetEntry(id);
	const del = useDeleteBudgetEntry();
	const [confirmOpen, setConfirmOpen] = useState(false);

	if (isLoading) return <UiPage><Surface data-test-id="loading">Loading budget entry…</Surface></UiPage>;
	if (isError || !data) {
		return <UiPage><Surface data-test-id="not-found">Entry not found or you don't have access.</Surface></UiPage>;
	}

	const deleteBudgetEntry = async () => {
		try {
			await del.mutateAsync(data.budgetEntry.id);
			navigate("/budget");
		} catch {
			// The mutation error is displayed below the heading, so the user can retry.
		}
	};

	return (
		<UiPage className="entry-detail-page" data-test-id="budget-entry-detail-page">
			<UiPageHeader>
				<div>
					<UiPageTitle>Budget entry details</UiPageTitle>
					<UiPageDescription>Review this entry and its linked expense.</UiPageDescription>
				</div>
				<UiButton type="button" onClick={() => navigate(-1)} data-test-id="back-link">← Back</UiButton>
			</UiPageHeader>
			{del.error && <ErrorContainer message={del.error.message || "Could not delete budget entry"} onClose={del.reset} />}
			<BudgetEntryCard
				budgetEntry={data.budgetEntry}
				linkedTransaction={data.linkedTransaction}
				linkedTransactionUsers={data.linkedTransactionUsers}
			/>
			<div className="entry-detail-actions">
				<UiButton type="button" $tone="danger" onClick={() => setConfirmOpen(true)} disabled={del.isPending} data-test-id="delete">
					Delete budget entry
				</UiButton>
			</div>
			<ConfirmDialog
				open={confirmOpen}
				title="Delete budget entry?"
				message="This removes the entry from your budget records."
				confirmText="Delete budget entry"
				onCancel={() => setConfirmOpen(false)}
				onConfirm={() => { setConfirmOpen(false); void deleteBudgetEntry(); }}
			/>
		</UiPage>
	);
}
