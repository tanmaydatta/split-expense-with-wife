import React from "react";
import { useSelector } from "react-redux";
import { Navigate, useLocation, useParams } from "react-router-dom";
import type { ReduxState } from "split-expense-shared-types";

export const MonthlyBudgetRedirect: React.FC = () => {
	const { budgetId, budgetName } = useParams<{
		budgetId?: string;
		budgetName?: string;
	}>();
	const location = useLocation();
	const targetParam = budgetId || budgetName;

	const data = useSelector((state: ReduxState) => state.value);
	const budgets = data?.extra?.group?.budgets || [];

	if (targetParam) {
		const matchedBudget = budgets.find(
			(b) =>
				b.id === targetParam ||
				b.budgetName.toLowerCase() === targetParam.toLowerCase(),
		);
		const resolvedId = matchedBudget ? matchedBudget.id : targetParam;

		return (
			<Navigate
				to={{
					pathname: `/budget/${resolvedId}`,
					hash: "#trends",
					search: location.search,
				}}
				replace
			/>
		);
	}

	return (
		<Navigate
			to={{
				pathname: "/budget",
				search: location.search,
			}}
			replace
		/>
	);
};
