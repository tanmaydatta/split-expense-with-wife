import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import type { BillOccurrenceView, BillPaymentInput, BillPlan, GroupBudgetData } from "split-expense-shared-types";
import styled from "styled-components";
import { Select } from "@/components/Form/Select";
import { FieldLabel, UiButton } from "@/components/ui";
import { useBillScheduledOptions, useRecentExpenses } from "@/hooks/useBills";
import { formatMoney, scheduledRunsOnDate } from "./bill-utils";

const Overlay = styled(Dialog.Overlay)`position: fixed; inset: 0; z-index: 2000; background: rgba(15, 26, 45, 0.56);`;
const Content = styled(Dialog.Content)`position: fixed; z-index: 2001; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(520px, calc(100vw - 32px)); max-height: calc(100vh - 32px); overflow-y: auto; padding: 24px; background: var(--ui-surface); color: var(--ui-text); border-radius: var(--ui-radius-lg); box-shadow: 0 24px 70px rgba(11, 26, 52, 0.25); display: grid; gap: 16px;`;
const Actions = styled.div`display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap;`;
const Choices = styled.fieldset`border: 0; padding: 0; margin: 0; display: grid; gap: 10px; legend { font-weight: 700; margin-bottom: 10px; } label { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; } input { margin-top: 4px; flex: none; } label span { display: grid; gap: 2px; } label strong { font-weight: 600; }`;
const Hint = styled.p`margin: 0; color: var(--ui-text-muted); font-size: 13px;`;

type Mode = "status" | "link" | "create";

export function PaymentDialog({ item, plan, budgets, onClose, onRecord, busy }: {
	item: BillOccurrenceView | null;
	plan?: BillPlan;
	budgets: GroupBudgetData[];
	onClose: () => void;
	onRecord: (options: Pick<BillPaymentInput, "linkedTransactionId" | "createExpense" | "budgetId">) => Promise<void>;
	busy: boolean;
}) {
	const existingId = item?.linkedTransactionId ?? item?.scheduledTransactionId ?? "";
	const [mode, setMode] = useState<Mode>(existingId ? "link" : "status");
	const [selected, setSelected] = useState(existingId);
	const [budgetId, setBudgetId] = useState("");
	const { data, isLoading } = useRecentExpenses(!!item);
	const { data: scheduledOptions } = useBillScheduledOptions(!!item);
	const expenseAction = scheduledOptions?.find((action) => action.id === plan?.scheduledActionId);
	const budgetAction = scheduledOptions?.find((action) => action.id === plan?.scheduledBudgetActionId);
	const expenseRuns = !!item && scheduledRunsOnDate(expenseAction, item.dueDate);
	const budgetRuns = !!item && scheduledRunsOnDate(budgetAction, item.dueDate);
	const matching = data?.transactions.filter((transaction) =>
		!transaction.deleted && transaction.currency === item?.currency &&
		Math.round(transaction.amount * (item.currency === "JPY" ? 1 : 100)) === item.amountMinor,
	) ?? [];
	const locked = !!existingId || expenseRuns;
	const expenseDiffers = !!item && !!expenseAction && (Math.round(expenseAction.amount * (item.currency === "JPY" ? 1 : 100)) !== item.amountMinor || expenseAction.currency !== item.currency || expenseAction.payerUserId !== item.payerUserId);

	return <Dialog.Root open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
		<Dialog.Portal><Overlay /><Content aria-describedby={undefined}>
			<Dialog.Title>Record bill payment</Dialog.Title>
			{item && <p>How should {formatMoney(item.amountMinor, item.currency)} for {item.title} be recorded?</p>}
			{expenseRuns && <Hint>A scheduled expense runs on this date. Record payment only, or link its expense after it runs. To create a separate expense, unlink the scheduled action from the bill first.</Hint>}
			{expenseDiffers && expenseRuns && <Hint>The scheduled expense differs from this bill. Linking it records the actual scheduled amount and payer; it does not change the bill's planned amount.</Hint>}
			{budgetRuns && <Hint>A scheduled {budgetAction?.budgetType ?? "budget"} action {item?.scheduledBudgetEntryId ? "has run" : "will run"} on this date. Payment will not create another budget entry.</Hint>}
			{!expenseRuns && locked && <Hint>An expense is already associated with this due date. Linking it avoids a duplicate balance change.</Hint>}
			<Choices><legend>Payment record</legend>
				<label><input type="radio" name="payment-mode" checked={mode === "status"} onChange={() => setMode("status")} /><span><strong>Mark paid only</strong><Hint>No expense or budget change.</Hint></span></label>
				<label><input type="radio" name="payment-mode" checked={mode === "link"} onChange={() => setMode("link")} /><span><strong>Link an existing expense</strong><Hint>Balances were already changed when that expense was created.</Hint></span></label>
				<label><input type="radio" name="payment-mode" checked={mode === "create"} disabled={locked} onChange={() => setMode("create")} /><span><strong>Create an expense</strong><Hint>Adds this bill to group balances.</Hint></span></label>
			</Choices>
			{mode === "link" && <FieldLabel>Expense
				<Select value={selected} onChange={(event) => setSelected(event.target.value)} disabled={isLoading || locked}>
					<option value="">Choose an expense</option>
					{existingId && !matching.some((transaction) => transaction.transaction_id === existingId) && <option value={existingId}>Expense for this due date</option>}
					{matching.map((transaction) => <option key={transaction.transaction_id} value={transaction.transaction_id}>{transaction.description} · {formatMoney(Math.round(transaction.amount * (item?.currency === "JPY" ? 1 : 100)), item?.currency ?? "USD")}</option>)}
				</Select>
			</FieldLabel>}
			{mode === "create" && <>
				<Hint>The expense uses the bill's payer, amount, currency, and split.</Hint>
				{!budgetRuns && <FieldLabel>Budget debit (optional)
					<Select value={budgetId} onChange={(event) => setBudgetId(event.target.value)}>
						<option value="">Do not change a budget</option>
						{budgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.budgetName}</option>)}
					</Select>
				</FieldLabel>}
			</>}
			<Actions><UiButton type="button" onClick={onClose}>Cancel</UiButton><UiButton type="button" $tone="primary" disabled={busy || (mode === "link" && !selected)} onClick={() => void onRecord(mode === "create" ? { createExpense: true, ...(budgetId ? { budgetId } : {}) } : mode === "link" ? { linkedTransactionId: selected } : {})}>{busy ? "Saving…" : mode === "create" ? "Record payment and expense" : "Record payment"}</UiButton></Actions>
		</Content></Dialog.Portal>
	</Dialog.Root>;
}
