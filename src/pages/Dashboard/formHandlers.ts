import { scrollToTop } from "@/utils/scroll";
import type { DashboardFormData } from "@/hooks/useDashboard";
import type {
	DashboardFormInput,
	DashboardSubmitResponse,
	ReduxState,
} from "split-expense-shared-types";
import type { UseMutationResult } from "@tanstack/react-query";
import {
	toExistingSubmitPayload,
	type TransactionEntryMode,
} from "./transactionModes";

type DashboardSubmitMutation = UseMutationResult<
	DashboardSubmitResponse,
	Error,
	DashboardFormData
>;

export function createFormSubmitHandler(
	dashboardSubmit: DashboardSubmitMutation,
	data: ReduxState["value"],
	options: {
		categoryId?: string | null;
		categoryVersions?: Record<string, number>;
		bankSource?: DashboardFormData["bankSource"];
		mode?: TransactionEntryMode;
		onSuccess?: () => void;
		onSaved?: () => void;
	} = {},
) {
	return async ({ value }: { value: DashboardFormInput }, form: any) => {
		const effectiveMode =
			options.mode ??
			(value.addExpense && value.updateBudget
				? "purchase"
				: value.addExpense
					? "split_only"
					: "budget_adjustment");

		const formData = toExistingSubmitPayload(value, effectiveMode, {
			categoryId: options.categoryId,
			categoryVersions: options.categoryVersions,
			bankSource: options.bankSource,
			groupId: data?.extra?.group?.groupid ?? "",
		});

		if (!formData) {
			return;
		}

		dashboardSubmit.mutate(formData, {
			onSuccess: () => {
				options.onSaved?.();
				if (options.onSuccess) {
					options.onSuccess();
					return;
				}
				form.setFieldValue("amount", undefined as any);
				form.setFieldValue("description", "");
				scrollToTop();
			},
			onError: (error: Error) => {
				console.error("Error:", error);
				scrollToTop();
			},
		});
	};
}

export function createUserPercentageUpdater(form: any) {
	return (userId: string, percentage: number) => {
		const currentUsers = form.getFieldValue("users") || [];
		const updatedUsers = currentUsers.map((user: any) =>
			user.Id === userId ? { ...user, percentage } : user,
		);
		form.setFieldValue("users", updatedUsers);
	};
}

export function getSuccessMessage(
	dashboardSubmit: DashboardSubmitMutation,
): string {
	if (!dashboardSubmit.isSuccess) return "";

	const { data } = dashboardSubmit;
	if (!data) return "";

	const hasExpense = Boolean(data.transactionId);
	const hasBudget = Boolean(data.budgetEntryId);

	if (hasExpense && hasBudget) {
		return data.message || "Expense + Budget saved";
	}
	if (hasExpense) {
		return data.message || "Expense saved";
	}
	if (hasBudget) {
		return data.message || "Budget saved";
	}

	return data.message || "Success!";
}
