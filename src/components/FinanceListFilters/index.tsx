import { useState } from "react";
import { FieldLabel, UiButton } from "@/components/ui";
import { SearchInput } from "@/components/SearchInput";
import type { useFinanceListFilters } from "@/hooks/useFinanceListFilters";
import "./index.css";

type Props = {
	state: ReturnType<typeof useFinanceListFilters>;
	currencies: string[];
	kind: "budget" | "expenses";
};

export function FinanceListFilters({ state, currencies, kind }: Props) {
	const [expanded, setExpanded] = useState(
		() => window.matchMedia("(min-width: 761px)").matches,
	);
	const [clearVersion, setClearVersion] = useState(0);
	const clear = () => {
		state.clear();
		setClearVersion((v) => v + 1);
	};
	const directionOptions =
		kind === "budget"
			? [
					["credit", "Credit"],
					["debit", "Debit"],
				]
			: [
					["owed", "You are owed"],
					["owe", "You owe"],
					["zero", "No net balance"],
				];
	return (
		<section
			className="finance-filters"
			aria-label={`${kind === "budget" ? "Budget" : "Expense"} list filters`}
		>
			<div className="finance-filter-search">
				<SearchInput
					key={clearVersion}
					value={state.filters.q ?? ""}
					onDebouncedChange={(value) => state.update("q", value)}
					placeholder={
						kind === "budget"
							? "Search this budget by description"
							: "Search expenses by description"
					}
				/>
				{state.activeCount > 0 && (
					<UiButton
						type="button"
						onClick={clear}
						data-test-id="clear-all-filters"
					>
						Clear all ({state.activeCount})
					</UiButton>
				)}
			</div>
			<details
				className="finance-filter-details"
				open={expanded}
				onToggle={(event) => setExpanded(event.currentTarget.open)}
			>
				<summary>
					Filters{state.activeCount > 0 ? ` · ${state.activeCount} active` : ""}
				</summary>
				<div className="finance-filter-grid">
					<FilterInput
						state={state}
						field="dateFrom"
						label="Date from (UTC)"
						type="date"
					/>
					<FilterInput
						state={state}
						field="dateTo"
						label="Date to (UTC)"
						type="date"
					/>
					<FilterInput
						state={state}
						field="minAmount"
						label="Total amount minimum"
						type="number"
					/>
					<FilterInput
						state={state}
						field="maxAmount"
						label="Total amount maximum"
						type="number"
					/>
					<FieldLabel>
						Currency
						<select
							className="form-select"
							value={state.filters.currency ?? ""}
							onChange={(e) => state.update("currency", e.target.value)}
						>
							<option value="">All currencies</option>
							{Array.from(
								new Set([
									...currencies,
									...(state.filters.currency ? [state.filters.currency] : []),
								]),
							)
								.sort()
								.map((currency) => (
									<option key={currency} value={currency}>
										{currency}
									</option>
								))}
						</select>
					</FieldLabel>
					<FieldLabel>
						Direction
						<select
							className="form-select"
							value={state.filters.direction ?? "all"}
							onChange={(e) => state.update("direction", e.target.value)}
						>
							<option value="all">All</option>
							{directionOptions.map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</FieldLabel>
					<FieldLabel>
						Sort by
						<select
							className="form-select"
							value={state.filters.sort ?? "newest"}
							onChange={(e) => state.update("sort", e.target.value)}
						>
							<option value="newest">Newest first</option>
							<option value="oldest">Oldest first</option>
							<option value="amount-asc">Total amount: low to high</option>
							<option value="amount-desc">Total amount: high to low</option>
						</select>
					</FieldLabel>
				</div>
				<p className="finance-filter-help">
					Amounts use each entry's original currency
					{kind === "budget"
						? " and ignore the credit/debit sign"
						: ", including everyone's shares"}
					. No currency conversion.
					{kind === "expenses" &&
						" Direction is your net share when the expense was created, not payment status."}
				</p>
			</details>
			{state.error && (
				<p role="alert" className="finance-filter-error">
					{state.error}
				</p>
			)}
		</section>
	);
}

function FilterInput({
	state,
	field,
	label,
	type,
}: {
	state: Props["state"];
	field: "dateFrom" | "dateTo" | "minAmount" | "maxAmount";
	label: string;
	type: "date" | "number";
}) {
	return (
		<FieldLabel>
			{label}
			<input
				className="form-control"
				type={type}
				min={type === "number" ? "0" : undefined}
				step={type === "number" ? "any" : undefined}
				inputMode={type === "number" ? "decimal" : undefined}
				value={state.params.get(field) ?? ""}
				onChange={(event) => state.update(field, event.target.value)}
			/>
		</FieldLabel>
	);
}
