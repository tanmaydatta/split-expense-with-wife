import { useState } from "react";
import type { BillCreateInput, BillPlan, BillScheduledOption, Currency } from "split-expense-shared-types";
import { CURRENCIES } from "split-expense-shared-types";
import styled from "styled-components";
import { Input } from "@/components/Form/Input";
import { Select } from "@/components/Form/Select";
import { FieldLabel, Surface, UiButton, UiSectionTitle } from "@/components/ui";
import { useBillScheduledOptions } from "@/hooks/useBills";
import { amountToMinor, minorToInput } from "./bill-utils";

const Form = styled(Surface).attrs({ as: "form" })`
  display: grid;
  gap: 16px;
  margin-bottom: 22px;
`;
const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`;
const Actions = styled.div`display: flex; gap: 10px; flex-wrap: wrap;`;
const Hint = styled.p`margin: 0; color: var(--ui-text-muted); font-size: 13px;`;
const Picker = styled.fieldset`border: 1px solid var(--ui-border); border-radius: var(--ui-radius-md); padding: 12px; margin: 0; min-width: 0; legend { font-weight: 700; padding: 0 4px; }`;
const PickerList = styled.div`display: grid; gap: 6px; max-height: 220px; overflow-y: auto; margin-top: 8px;`;
const PickerChoice = styled.label`display: flex; gap: 10px; align-items: flex-start; border: 1px solid var(--ui-border); border-radius: 8px; padding: 10px; cursor: pointer; input { margin-top: 4px; } span { display: grid; gap: 3px; } small { color: var(--ui-text-muted); }`;

function ActionPicker({ label, selected, onSelect, options, differences }: { label: string; selected: string; onSelect: (id: string) => void; options: BillScheduledOption[]; differences: (option: BillScheduledOption) => string[] }) {
	const [search, setSearch] = useState("");
	const visible = options.filter((option) => `${option.description} ${option.currency} ${option.frequency} ${option.budgetType ?? ""}`.toLowerCase().includes(search.toLowerCase()));
	return <Picker><legend>{label}</legend>
		<Input aria-label={`Search ${label.toLowerCase()}`} type="search" placeholder="Search scheduled actions" value={search} onChange={(event) => setSearch(event.target.value)} />
		<PickerList>
			<PickerChoice><input type="radio" name={label} checked={!selected} onChange={() => onSelect("")} /><span>None</span></PickerChoice>
			{visible.map((option) => <PickerChoice key={option.id}><input type="radio" name={label} checked={selected === option.id} onChange={() => onSelect(option.id)} /><span><strong>{option.description}</strong><small>{option.budgetType ? `${option.budgetType} · ` : ""}{option.amount} {option.currency} · {option.frequency} from {option.startDate}{option.isActive ? "" : " · Paused"}</small>{differences(option).length > 0 && <small>Differs from bill: {differences(option).join(", ")}</small>}</span></PickerChoice>)}
			{visible.length === 0 && <Hint>No actions found.</Hint>}
			{selected && !options.some((option) => option.id === selected) && <Hint>Previously linked action is unavailable. Choose another or None.</Hint>}
		</PickerList>
	</Picker>;
}

type Member = { id: string; name: string };
function initialShares(members: Member[], defaults: Record<string, number>, initial?: BillPlan): Record<string, string> {
	if (initial) return Object.fromEntries(Object.entries(initial.splitBasisPoints).map(([id, points]) => [id, String(points / 100)]));
	const fromDefaults = Object.fromEntries(members.map((member) => [member.id, String(defaults[member.id] ?? 0)]));
	if (Object.values(fromDefaults).reduce((sum, share) => sum + Number(share), 0) === 100) return fromDefaults;
	const equal = Math.floor(10000 / members.length);
	return Object.fromEntries(members.map((member, index) => [member.id, String((index === members.length - 1 ? 10000 - equal * index : equal) / 100)]));
}

export function BillForm({ initial, members, defaultCurrency, defaultShares, onSubmit, onCancel, busy }: {
	initial?: BillPlan;
	members: Member[];
	defaultCurrency: Currency;
	defaultShares: Record<string, number>;
	onSubmit: (input: BillCreateInput) => Promise<void>;
	onCancel: () => void;
	busy: boolean;
}) {
	const [title, setTitle] = useState(initial?.title ?? "");
	const [currency, setCurrency] = useState<Currency>(initial?.currency ?? defaultCurrency);
	const [amount, setAmount] = useState(initial ? minorToInput(initial.amountMinor, initial.currency) : "");
	const [firstDueDate, setFirstDueDate] = useState(initial?.firstDueDate ?? new Date().toISOString().slice(0, 10));
	const [recurrence, setRecurrence] = useState<BillCreateInput["recurrence"]>(initial?.recurrence ?? "monthly");
	const [payerUserId, setPayerUserId] = useState(initial?.payerUserId ?? members[0]?.id ?? "");
	const [shares, setShares] = useState(() => initialShares(members, defaultShares, initial));
	const [error, setError] = useState("");
	const [scheduledActionId, setScheduledActionId] = useState(initial?.scheduledActionId ?? "");
	const [scheduledBudgetActionId, setScheduledBudgetActionId] = useState(initial?.scheduledBudgetActionId ?? "");
	const options = useBillScheduledOptions(true);
	const total = Object.values(shares).reduce((sum, share) => sum + (Number(share) || 0), 0);
	const expenseOptions = options.data?.filter((option) => option.actionType === "add_expense") ?? [];
	const budgetOptions = options.data?.filter((option) => option.actionType === "add_budget") ?? [];
	function differences(option: BillScheduledOption): string[] {
		const result: string[] = [];
		if (option.startDate !== firstDueDate) result.push("first date");
		if (option.frequency !== recurrence) result.push("repeat schedule");
		if (option.amount !== amountMinorForMatch(amount, currency)) result.push("amount");
		if (option.currency !== currency) result.push("currency");
		if (option.actionType === "add_expense") {
			if (option.payerUserId !== payerUserId) result.push("payer");
			if (members.some(({ id }) => Math.abs((option.splitPctShares?.[id] ?? 0) - Number(shares[id] || 0)) >= 0.01)) result.push("split");
		}
		if (!option.isActive) result.push("paused");
		return result;
	}

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		setError("");
		const amountMinor = amountToMinor(amount, currency);
		if (amountMinor === null) { setError("Enter a positive amount with the correct currency precision."); return; }
		const splitBasisPoints = Object.fromEntries(members.map(({ id }) => [id, Math.round(Number(shares[id] || 0) * 100)]));
		if (Object.values(splitBasisPoints).some((share) => share < 0 || share > 10000) || Object.values(splitBasisPoints).reduce((sum, share) => sum + share, 0) !== 10000) {
			setError("Split percentages must total 100%."); return;
		}
		try {
			await onSubmit({ title: title.trim(), amountMinor, currency, firstDueDate, recurrence, payerUserId, splitBasisPoints, scheduledActionId: scheduledActionId || null, scheduledBudgetActionId: scheduledBudgetActionId || null });
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save bill."); }
	}

	return (
		<Form onSubmit={submit} aria-label={initial ? `Edit ${initial.title}` : "Add bill"}>
			<UiSectionTitle>{initial ? "Edit bill" : "Add a bill"}</UiSectionTitle>
			<Hint>Due dates use UTC calendar days. Choose scheduled actions below to associate their entries with this bill. Payment is confirmed separately.</Hint>
			<Grid>
				<FieldLabel>Bill name<Input required minLength={2} maxLength={100} value={title} onChange={(event) => setTitle(event.target.value)} /></FieldLabel>
				<FieldLabel>Amount<Input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder={currency === "JPY" ? "1000" : "10.00"} /></FieldLabel>
				<FieldLabel>Currency<Select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>{CURRENCIES.map((value) => <option key={value} value={value}>{value}</option>)}</Select></FieldLabel>
				<FieldLabel>First due date<Input required type="date" value={firstDueDate} onChange={(event) => setFirstDueDate(event.target.value)} /></FieldLabel>
				<FieldLabel>Repeat<Select value={recurrence} onChange={(event) => setRecurrence(event.target.value as BillCreateInput["recurrence"])}><option value="once">One time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></Select></FieldLabel>
				<FieldLabel>Who pays?<Select value={payerUserId} onChange={(event) => setPayerUserId(event.target.value)}>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</Select></FieldLabel>
			</Grid>
			<ActionPicker label="Scheduled expense (optional)" selected={scheduledActionId} onSelect={setScheduledActionId} options={expenseOptions} differences={differences} />
			<ActionPicker label="Scheduled budget (optional)" selected={scheduledBudgetActionId} onSelect={setScheduledBudgetActionId} options={budgetOptions} differences={differences} />
			<Hint>Different bill details are shown above. When both actions are selected, their expense and budget entries are linked only on dates when both actions run, even if their first dates or repeat schedules differ. Credit actions add to a budget; Debit actions subtract from it. Scheduled actions never mark a bill paid.</Hint>
			<UiSectionTitle>Split between members</UiSectionTitle>
			<Grid>{members.map((member) => <FieldLabel key={member.id}>{member.name} %<Input type="number" min="0" max="100" step="0.01" value={shares[member.id] ?? "0"} onChange={(event) => setShares((current) => ({ ...current, [member.id]: event.target.value }))} /></FieldLabel>)}</Grid>
			<Hint role="status">Total split: {total.toFixed(2)}%</Hint>
			{error && <p role="alert">{error}</p>}
			<Actions><UiButton type="submit" $tone="primary" disabled={busy}>{busy ? "Saving…" : initial ? "Save bill" : "Add bill"}</UiButton><UiButton type="button" onClick={onCancel}>Cancel</UiButton></Actions>
		</Form>
	);
}

function amountMinorForMatch(amount: string, currency: Currency): number | null {
	const minor = amountToMinor(amount, currency);
	return minor === null ? null : minor / (currency === "JPY" ? 1 : 100);
}
