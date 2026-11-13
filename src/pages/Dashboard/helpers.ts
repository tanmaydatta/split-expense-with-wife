import { CURRENCIES } from "split-expense-shared-types";
import type {
	Currency,
	DashboardUser,
	ReduxState,
} from "split-expense-shared-types";
import type { DashboardFormInput } from "split-expense-shared-types";
import {
	defaultTransactionMode,
	type TransactionEntryMode,
} from "./transactionModes";

export function getDefaultCurrency(sessionCurrency?: string): Currency {
	return sessionCurrency &&
		(CURRENCIES as readonly string[]).includes(sessionCurrency)
		? (sessionCurrency as Currency)
		: "USD";
}

export function getUsersFromAuth(data: ReduxState["value"]): DashboardUser[] {
	return data?.extra?.usersById
		? Object.values(data.extra.usersById).map((v) => ({
				FirstName: v.firstName,
				Id: v.id,
				percentage: 0,
			}))
		: [];
}

export function applyDefaultPercentages(
	users: DashboardUser[],
	data: ReduxState["value"],
): DashboardUser[] {
	return users.map((u) => {
		const userIdStr = u.Id.toString();
		const defaultPercentage =
			data?.extra?.group?.metadata?.defaultShare?.[userIdStr];
		return {
			...u,
			percentage:
				defaultPercentage !== undefined
					? defaultPercentage
					: 100 / users.length,
		} as DashboardUser;
	});
}

export function buildDefaultFormValues(
	data: ReduxState["value"],
	budgets: Array<{ id: string; name?: string }>,
	mode?: TransactionEntryMode,
): DashboardFormInput {
	const defaultCurrency = getDefaultCurrency(
		data?.extra?.group?.metadata?.defaultCurrency,
	);
	const defaultBudget = budgets.length > 0 ? budgets[0].id : "";
	const defaultPaidBy = data?.extra?.currentUser?.id || "";

	const usersFromAuth = getUsersFromAuth(data);
	const usersWithPercentages = applyDefaultPercentages(usersFromAuth, data);

	const effectiveMode =
		mode ?? defaultTransactionMode(budgets.length > 0);
	const addExpense =
		effectiveMode === "purchase" || effectiveMode === "split_only";
	const updateBudget =
		effectiveMode === "purchase" || effectiveMode === "budget_adjustment";

	return {
		addExpense,
		updateBudget,
		amount: undefined as any,
		description: "",
		currency: defaultCurrency,
		paidBy: defaultPaidBy,
		users: usersWithPercentages.map((u) => ({
			...u,
			percentage: u.percentage || 0,
		})),
		budgetId: defaultBudget,
		creditDebit: effectiveMode === "budget_adjustment" ? "Credit" : "Debit",
	};
}
