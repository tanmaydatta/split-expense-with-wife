import type { DashboardFormData } from "@/hooks/useDashboard";
import type { DashboardFormInput } from "split-expense-shared-types";

export type TransactionEntryMode =
	| "purchase"
	| "split_only"
	| "budget_adjustment"
	| "transfer";

export function defaultTransactionMode(hasBudget: boolean): TransactionEntryMode {
	return hasBudget ? "purchase" : "split_only";
}

export interface SubmitPayloadOptions {
	categoryId?: string | null;
	categoryVersions?: Record<string, number>;
	bankSource?: DashboardFormData["bankSource"];
	groupId?: string;
}

export function toExistingSubmitPayload(
	values: DashboardFormInput,
	mode: TransactionEntryMode,
	options: SubmitPayloadOptions = {},
): DashboardFormData | null {
	if (mode === "transfer") {
		return null;
	}

	const addExpense = mode === "purchase" || mode === "split_only";
	const updateBudget = mode === "purchase" || mode === "budget_adjustment";

	const payload: DashboardFormData = {
		categoryId: options.categoryId,
		categoryVersions: options.categoryVersions,
		addExpense,
		updateBudget,
		...(options.bankSource ? { bankSource: options.bankSource } : {}),
	};

	if (addExpense && values.users && values.paidBy) {
		payload.expense = {
			amount: values.amount ?? 0,
			description: values.description,
			currency: values.currency,
			paidBy: values.paidBy,
			users: values.users,
		};
	}

	if (updateBudget && values.budgetId) {
		payload.budget = {
			amount: values.amount ?? 0,
			description: values.description,
			budgetId: values.budgetId,
			currency: values.currency,
			creditDebit: values.creditDebit ?? (mode === "purchase" ? "Debit" : "Debit"),
			groupId: options.groupId ?? "",
		};
	}

	return payload;
}
