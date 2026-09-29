import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import type { BillOccurrenceView } from "split-expense-shared-types";
import styled from "styled-components";
import { Select } from "@/components/Form/Select";
import { FieldLabel, UiButton } from "@/components/ui";
import { useRecentExpenses } from "@/hooks/useBills";
import { formatMoney } from "./bill-utils";

const Overlay = styled(Dialog.Overlay)`position: fixed; inset: 0; z-index: 2000; background: rgba(15, 26, 45, 0.56);`;
const Content = styled(Dialog.Content)`position: fixed; z-index: 2001; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(480px, calc(100vw - 32px)); padding: 24px; background: var(--ui-surface); color: var(--ui-text); border-radius: var(--ui-radius-lg); box-shadow: 0 24px 70px rgba(11, 26, 52, 0.25); display: grid; gap: 16px;`;
const Actions = styled.div`display: flex; justify-content: flex-end; gap: 8px;`;

export function PaymentDialog({ item, onClose, onRecord, busy }: {
	item: BillOccurrenceView | null;
	onClose: () => void;
	onRecord: (linkedTransactionId?: string) => Promise<void>;
	busy: boolean;
}) {
	const [selected, setSelected] = useState("");
	const { data, isLoading } = useRecentExpenses(!!item);
	const matching = data?.transactions.filter((transaction) =>
		!transaction.deleted && transaction.currency === item?.currency &&
		Math.round(transaction.amount * (item.currency === "JPY" ? 1 : 100)) === item.amountMinor,
	) ?? [];
	return <Dialog.Root open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
		<Dialog.Portal><Overlay /><Content aria-describedby={undefined}>
			<Dialog.Title>Record bill payment</Dialog.Title>
			{item && <p>Record {formatMoney(item.amountMinor, item.currency)} for {item.title} as paid. This does not create an expense or change balances.</p>}
			<FieldLabel>Link a recent matching expense (optional)
				<Select value={selected} onChange={(event) => setSelected(event.target.value)} disabled={isLoading}>
					<option value="">No expense linked</option>
					{matching.map((transaction) => <option key={transaction.transaction_id} value={transaction.transaction_id}>{transaction.description} · {formatMoney(Math.round(transaction.amount * (item?.currency === "JPY" ? 1 : 100)), item?.currency ?? "USD")}</option>)}
				</Select>
			</FieldLabel>
			<Actions><UiButton type="button" onClick={onClose}>Cancel</UiButton><UiButton type="button" $tone="primary" disabled={busy} onClick={() => void onRecord(selected || undefined)}>{busy ? "Saving…" : "Record payment"}</UiButton></Actions>
		</Content></Dialog.Portal>
	</Dialog.Root>;
}
