import { scrollToTop } from "@/utils/scroll";
import type {
	CreateScheduledActionRequest,
	ReduxState,
} from "split-expense-shared-types";

export function createSubmitHandler(
	createAction: any,
	mode: "create" | "edit",
	setSuccess: (msg: string) => void,
	setError: (msg: string) => void,
	onSubmit?: (values: CreateScheduledActionRequest) => Promise<void>,
) {
	return async ({ value }: { value: any }) => {
		try {
			if (onSubmit) {
				await onSubmit(value as CreateScheduledActionRequest);
			} else {
				await createAction.mutateAsync(value as CreateScheduledActionRequest);
			}
			setSuccess(
				mode === "edit"
					? "Scheduled action updated successfully"
					: "Scheduled action created successfully",
			);
			setError("");
			scrollToTop();
		} catch (e: any) {
			setError(
				e?.errorMessage ||
					e?.message ||
					`Failed to ${mode === "edit" ? "update" : "create"} scheduled action`,
			);
			setSuccess("");
			scrollToTop();
		}
	};
}

export function createDefaultShareGetter(session: ReduxState["value"]) {
	return () => {
		return (session?.extra?.group?.metadata?.defaultShare || undefined) as
			| Record<string, number>
			| undefined;
	};
}

export function createDefaultSplitsApplier(
	form: any,
	getDefaultShare: () => Record<string, number> | undefined,
) {
	return () => {
		const defaultShare = getDefaultShare();
		const currentSplits = form.getFieldValue("actionData.splitPctShares") as
			| Record<string, number>
			| undefined;
		const hasSplits = currentSplits && Object.keys(currentSplits).length > 0;
		if (hasSplits || !defaultShare || Object.keys(defaultShare).length === 0) {
			return;
		}
		form.setFieldValue(
			"actionData.splitPctShares" as any,
			defaultShare as Record<string, number> as any,
		);
	};
}

export function createDefaultPaidByApplier(
	form: any,
	getDefaultShare: () => Record<string, number> | undefined,
	session: ReduxState["value"],
) {
	return () => {
		const currentPaidBy = form.getFieldValue("actionData.paidByUserId") as
			| string
			| undefined;
		if (currentPaidBy) return;

		let payer = session?.extra?.currentUser?.id || "";
		const defaultShare = getDefaultShare();
		if (defaultShare && Object.keys(defaultShare).length > 0) {
			const topShare = (
				Object.entries(defaultShare) as Array<[string, number]>
			).sort((a, b) => b[1] - a[1])[0];
			if (topShare?.[0]) payer = topShare[0];
		}
		form.setFieldValue(
			"actionData.paidByUserId" as any,
			payer as string as any,
		);
	};
}
