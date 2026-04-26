import { BudgetEntryCard } from "@/components/BudgetEntryCard";
import { useBudgetEntry } from "@/hooks/useBudgetEntry";
import { useDeleteBudgetEntry } from "@/hooks/useBudget";
import { useNavigate, useParams } from "react-router-dom";

export default function BudgetEntryDetail() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const { data, isLoading, isError } = useBudgetEntry(id);
	const del = useDeleteBudgetEntry();

	if (isLoading) return <div data-test-id="loading">Loading…</div>;
	if (isError || !data) {
		return (
			<div data-test-id="not-found">
				Entry not found or you don't have access.
			</div>
		);
	}

	return (
		<div
			className="budget-entry-detail"
			data-test-id="budget-entry-detail-page"
		>
			<button
				onClick={() => navigate(-1)}
				data-test-id="back-link"
				style={{ marginBottom: 16, cursor: "pointer" }}
			>
				← Back
			</button>
			<BudgetEntryCard
				budgetEntry={data.budgetEntry}
				linkedTransaction={data.linkedTransaction}
				linkedTransactionUsers={data.linkedTransactionUsers}
			/>
			<button
				onClick={async () => {
					await del.mutateAsync(data.budgetEntry.id);
					navigate("/budget");
				}}
				data-test-id="delete"
				style={{ marginTop: 16, cursor: "pointer", color: "red" }}
			>
				Delete
			</button>
		</div>
	);
}
