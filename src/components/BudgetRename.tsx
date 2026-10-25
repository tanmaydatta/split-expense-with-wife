import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	GroupBudgetData,
	GroupDetailsResponse,
	RenameBudgetRequestSchema,
	ReduxState,
} from "split-expense-shared-types";
import { setData } from "@/redux/data";
import { store } from "@/redux/store";
import { typedApi } from "@/utils/api";
import { UiButton } from "@/components/ui";
import { Input } from "@/components/Form/Input";
import "./BudgetRename.css";

export function BudgetRename({
	budget,
	onClose,
}: {
	budget: GroupBudgetData;
	onClose: () => void;
}) {
	const [name, setName] = useState(budget.budgetName);
	const [validation, setValidation] = useState("");
	const dispatch = useDispatch();
	const data = useSelector((state: ReduxState) => state.value);
	const queryClient = useQueryClient();
	const mutation = useMutation({
		mutationFn: (budgetName: string) =>
			typedApi.post("/budget/rename", { budgetId: budget.id, budgetName }),
		onSuccess: (updated) => {
			// Read the latest state after the request, rather than replacing a newer session snapshot.
			const current = store.getState().value;
			if (
				current?.user?.id !== data?.user?.id ||
				current?.extra?.group?.groupid !== data?.extra?.group?.groupid
			)
				return;
			dispatch(
				setData({
					...current,
					extra: {
						...current.extra,
						group: {
							...current.extra.group,
							budgets: current.extra.group.budgets.map((b: GroupBudgetData) =>
								b.id === updated.id ? updated : b,
							),
						},
					},
				}),
			);
			queryClient.setQueriesData<GroupDetailsResponse>(
				{ queryKey: ["group", "details"] },
				(old) =>
					old && String(old.groupid) === String(current.extra.group.groupid)
						? {
								...old,
								budgets: old.budgets.map((b) =>
									b.id === updated.id ? updated : b,
								),
							}
						: old,
			);
			queryClient.invalidateQueries({ queryKey: ["budgetEntry"] });
			queryClient.invalidateQueries({ queryKey: ["group"] });
			onClose();
		},
	});
	function save(event: React.FormEvent) {
		event.preventDefault();
		const parsed = RenameBudgetRequestSchema.safeParse({
			budgetId: budget.id,
			budgetName: name,
		});
		if (!parsed.success) {
			setValidation(parsed.error.issues[0].message);
			return;
		}
		if (
			data?.extra?.group?.budgets.some(
				(b) =>
					b.id !== budget.id &&
					b.budgetName.toLowerCase() === parsed.data.budgetName.toLowerCase(),
			)
		) {
			setValidation("A budget with this name already exists");
			return;
		}
		setValidation("");
		mutation.mutate(parsed.data.budgetName);
	}
	return (
		<Dialog.Root
			open
			onOpenChange={(open) => {
				if (!open && !mutation.isPending) onClose();
			}}
		>
			<Dialog.Portal>
				<Dialog.Overlay className="budget-rename-overlay" />
				<Dialog.Content
					className="budget-rename-dialog"
					onEscapeKeyDown={(event) => {
						if (mutation.isPending) event.preventDefault();
					}}
					onPointerDownOutside={(event) => {
						if (mutation.isPending) event.preventDefault();
					}}
				>
					<Dialog.Title>Rename budget</Dialog.Title>
					<Dialog.Description>
						Choose a name that is easy to recognise. Entries and balances stay
						with this budget.
					</Dialog.Description>
					<form onSubmit={save}>
						<label htmlFor="rename-budget-name">Budget name</label>
						<Input
							id="rename-budget-name"
							value={name}
							disabled={mutation.isPending}
							aria-invalid={!!(validation || mutation.error)}
							aria-describedby="rename-budget-help"
							onChange={(event) => {
								setName(event.target.value);
								setValidation("");
								mutation.reset();
							}}
						/>
						<p id="rename-budget-help">
							Up to 60 characters. Letters, numbers, spaces, hyphens and
							underscores.
						</p>
						{(validation || mutation.error) && (
							<p role="alert">{validation || mutation.error?.message}</p>
						)}
						<div className="budget-rename-footer">
							<UiButton
								type="button"
								disabled={mutation.isPending}
								onClick={onClose}
							>
								Cancel
							</UiButton>
							<UiButton
								type="submit"
								$tone="primary"
								disabled={mutation.isPending}
							>
								{mutation.isPending ? "Saving…" : "Save"}
							</UiButton>
						</div>
					</form>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
