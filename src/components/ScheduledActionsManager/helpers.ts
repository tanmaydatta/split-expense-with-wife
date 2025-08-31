import type {
	AddBudgetActionData,
	AddExpenseActionData,
	AuthenticatedUser,
	GroupBudgetData,
	ReduxState,
} from "split-expense-shared-types";

export function computeUsersFromSession(
	session: ReduxState["value"],
): AuthenticatedUser[] {
	const usersById = session?.extra?.usersById || {};
	return Object.values(usersById || {});
}

export function computeBudgetsFromSession(
	session: ReduxState["value"],
): string[] {
	return (
		session?.extra?.group?.budgets?.map((b: GroupBudgetData) => b.id) || []
	);
}

export function computeCurrenciesFromSession(
	session: ReduxState["value"],
): string[] {
	return session?.extra?.currencies || ["USD"];
}

export function computeDefaultCurrency(
	session: ReduxState["value"],
	currencies: string[],
): string {
	const groupDefault = session?.extra?.group?.metadata?.defaultCurrency;
	return groupDefault || currencies[0] || "USD";
}

export function computeGroupDefaultShare(
	session: ReduxState["value"],
): Record<string, number> {
	return (session?.extra?.group?.metadata?.defaultShare || {}) as Record<
		string,
		number
	>;
}

export function computeDefaultPayer(
	groupDefaultShare: Record<string, number>,
	session: ReduxState["value"],
): string {
	const entries = Object.entries(groupDefaultShare) as Array<[string, number]>;
	if (entries.length > 0) {
		return entries.sort((a, b) => b[1] - a[1])[0][0];
	}
	return session?.extra?.currentUser?.id || "";
}

export function computeTodayAsLocalISODate(): string {
	const now = new Date();
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function computeInitialActionData(
	defaultCurrency: string,
	defaultPayer: string,
	groupDefaultShare: Record<string, number>,
): AddExpenseActionData {
	return {
		amount: 0,
		description: "",
		currency: defaultCurrency,
		paidByUserId: defaultPayer,
		splitPctShares: groupDefaultShare,
	};
}

export function computeExpenseActionData(
	currentAmount: number,
	currentDescription: string,
	currentCurrency: string,
	currentPaidBy: string,
	currentSplits: Record<string, number>,
): AddExpenseActionData {
	return {
		amount: currentAmount,
		description: currentDescription,
		currency: currentCurrency,
		paidByUserId: currentPaidBy,
		splitPctShares: currentSplits,
	};
}

export function computeBudgetActionData(
	currentAmount: number,
	currentDescription: string,
	currentCurrency: string,
	budgetId: string,
	type: "Credit" | "Debit",
): AddBudgetActionData {
	return {
		amount: currentAmount,
		description: currentDescription,
		currency: currentCurrency,
		budgetId,
		type,
	};
}
