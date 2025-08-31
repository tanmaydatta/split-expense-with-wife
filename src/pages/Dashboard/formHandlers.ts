import { scrollToTop } from "@/utils/scroll";
import type { DashboardFormData } from "@/hooks/useDashboard";
import type {
	DashboardFormInput,
	ReduxState,
} from "split-expense-shared-types";

export function createFormSubmitHandler(
	dashboardSubmit: any,
	data: ReduxState["value"],
) {
	return async ({ value }: { value: DashboardFormInput }, form: any) => {
		const formData: DashboardFormData = {
			addExpense: value.addExpense,
			updateBudget: value.updateBudget,
		};

		if (value.addExpense && value.users) {
			formData.expense = {
				amount: value.amount,
				description: value.description,
				currency: value.currency,
				paidBy: value.paidBy!,
				users: value.users,
			};
		}

		if (value.updateBudget) {
			formData.budget = {
				amount: value.amount,
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

export function getSuccessMessage(dashboardSubmit: any): string {
	if (!dashboardSubmit.isSuccess) return "";

	const expenseMessage = dashboardSubmit.data?.expense?.message;
	const budgetMessage = dashboardSubmit.data?.budget?.message;

	if (expenseMessage && budgetMessage) {
		return `${expenseMessage} and ${budgetMessage}`;
	}

	return expenseMessage || budgetMessage || "Success!";
}
