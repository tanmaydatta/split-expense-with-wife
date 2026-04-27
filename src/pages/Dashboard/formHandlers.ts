import { scrollToTop } from "@/utils/scroll";
import type { DashboardFormData } from "@/hooks/useDashboard";
import type {
	DashboardFormInput,
	DashboardSubmitResponse,
	ReduxState,
} from "split-expense-shared-types";
import type { UseMutationResult } from "@tanstack/react-query";

type DashboardSubmitMutation = UseMutationResult<
	DashboardSubmitResponse,
	Error,
	DashboardFormData
>;

export function createFormSubmitHandler(
	dashboardSubmit: DashboardSubmitMutation,
	data: ReduxState["value"],
) {
	return async ({ value }: { value: DashboardFormInput }, form: any) => {
		const formData: DashboardFormData = {
			addExpense: value.addExpense,
			updateBudget: value.updateBudget,
		};

		if (value.addExpense && value.users) {
			formData.expense = {
				amount: value.amount ?? 0,
				description: value.description,
				currency: value.currency,
				paidBy: value.paidBy!,
				users: value.users,
			};
		}

		if (value.updateBudget) {
			formData.budget = {
				amount: value.amount ?? 0,
				description: value.description,
				budgetId: value.budgetId!,
				currency: value.currency,
				creditDebit: value.creditDebit!,
				groupId: data?.extra?.group?.groupid ?? "",
			};
		}

		dashboardSubmit.mutate(formData, {
			onSuccess: () => {
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
