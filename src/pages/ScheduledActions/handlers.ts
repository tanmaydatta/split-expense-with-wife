import type { ScheduledAction } from "split-expense-shared-types";

export function createDeleteHandler(
	deleteAction: any,
	setConfirmOpen: (open: boolean) => void,
	setPendingDeleteId: (id: string | null) => void,
) {
	return (pendingDeleteId: string | null) => {
		if (pendingDeleteId) {
			deleteAction.mutate({ id: pendingDeleteId });
		}
		setConfirmOpen(false);
		setPendingDeleteId(null);
	};
}

export function createToggleActiveHandler(
	updateAction: any,
	setBusyId: (id: string | null) => void,
) {
	return async (action: ScheduledAction) => {
		setBusyId(action.id);
		try {
			await updateAction.mutateAsync({
				id: action.id,
				updates: { enabled: !action.isActive },
			});
		} catch (error) {
			console.error("Error toggling action:", error);
		} finally {
			setBusyId(null);
		}
	};
}

export function formatActionDescription(action: ScheduledAction): string {
	if (action.actionType === "add_expense") {
		return `Add $${action.actionData.amount} expense: ${action.actionData.description}`;
	} else if (action.actionType === "add_budget") {
		return `Add $${action.actionData.amount} to budget: ${action.actionData.description}`;
	}
	return action.actionData.description || "Unknown action";
}

export function formatFrequency(frequency: string): string {
	return frequency.charAt(0).toUpperCase() + frequency.slice(1);
}
