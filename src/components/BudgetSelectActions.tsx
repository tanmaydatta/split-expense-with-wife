import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import type { GroupBudgetData, ReduxState } from "split-expense-shared-types";
import { ToggleButton } from "./ToggleButtonGroup";
import { BudgetRename } from "./BudgetRename";

export function BudgetSelectActions({
	budgetId,
	handleChangeBudget,
	disabled,
}: {
	budgetId: string;
	handleChangeBudget: (id: string) => void;
	disabled: boolean;
}) {
	const [menu, setMenu] = useState<string | null>(null);
	const [editing, setEditing] = useState<GroupBudgetData | null>(null);
	const actionButtons = useRef<Record<string, HTMLButtonElement | null>>({});
	const budgets =
		useSelector((state: ReduxState) => state.value?.extra?.group?.budgets) ??
		[];
	useEffect(() => {
		if (!menu) return;
		const close = (event: PointerEvent) => {
			const active = actionButtons.current[menu]?.parentElement;
			if (!active?.contains(event.target as Node)) setMenu(null);
		};
		document.addEventListener("pointerdown", close);
		return () => document.removeEventListener("pointerdown", close);
	}, [menu]);
	const closeDialog = () => {
		const id = editing?.id;
		setEditing(null);
		requestAnimationFrame(() => {
			if (id) actionButtons.current[id]?.focus();
		});
	};
	return (
		<>
			<div
				className="toggle-button-group mb-2 BudgetSelectionGroup"
				role="radiogroup"
				aria-label="budget"
				data-test-id="budget-selection-group"
			>
				{budgets.map((b) => (
					<div
						className="budget-tab-actions"
						data-budget-actions={b.id}
						key={b.id}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								setMenu(null);
								actionButtons.current[b.id]?.focus();
							}
						}}
					>
						<ToggleButton
							value={b.id}
							isSelected={budgetId === b.id}
							onChange={handleChangeBudget}
							disabled={disabled}
							data-test-id={`budget-radio-${b.budgetName}`}
						>
							{b.budgetName}
						</ToggleButton>
						<button
							type="button"
							className="budget-tab-menu-toggle"
							ref={(element) => {
								actionButtons.current[b.id] = element;
							}}
							disabled={disabled}
							aria-label={`Actions for ${b.budgetName}`}
							aria-expanded={menu === b.id}
							aria-controls={`budget-menu-${b.id}`}
							onClick={() => setMenu(menu === b.id ? null : b.id)}
						>
							⋯
						</button>
						{menu === b.id && (
							<div className="budget-tab-menu" id={`budget-menu-${b.id}`}>
								<button
									type="button"
									onClick={() => {
										setMenu(null);
										setEditing(b);
									}}
								>
									Rename budget
								</button>
							</div>
						)}
					</div>
				))}
			</div>
			{editing && (
				<BudgetRename key={editing.id} budget={editing} onClose={closeDialog} />
			)}
		</>
	);
}
