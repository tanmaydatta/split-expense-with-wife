import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useSearchParams } from "react-router-dom";
import type { BillCreateInput, BillOccurrenceView, BillPlan, Currency, ReduxState } from "split-expense-shared-types";
import styled from "styled-components";
import ConfirmDialog from "@/components/ConfirmDialog";
import { Surface, UiButton, UiPage, UiPageDescription, UiPageHeader, UiPageTitle, UiSectionTitle } from "@/components/ui";
import { useBillMonth, useCreateBill, useSetBillPayment, useStopBill, useUpdateBill } from "@/hooks/useBills";
import { BillForm } from "./BillForm";
import { BillReminders } from "./BillReminders";
import { PaymentDialog } from "./PaymentDialog";
import { formatBillDate, formatMoney, monthLabel, shiftMonth } from "./bill-utils";

const Toolbar = styled.div`display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 20px;`;
const MonthName = styled.h2`margin: 0; min-width: 180px; font-size: 20px;`;
const SummaryGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; margin-bottom: 20px;`;
const Summary = styled(Surface)`display: grid; gap: 6px; strong { font-size: 18px; } span { color: var(--ui-text-muted); font-size: 13px; }`;
const Calendar = styled(Surface)`overflow-x: auto; margin-bottom: 24px;`;
const CalendarGrid = styled.div`display: grid; grid-template-columns: repeat(7, minmax(86px, 1fr)); gap: 1px; background: var(--ui-border); min-width: 630px; border: 1px solid var(--ui-border);`;
const Weekday = styled.div`background: var(--ui-surface-muted); padding: 8px; font-size: 12px; font-weight: 700;`;
const Day = styled.div<{ $current?: boolean }>`background: var(--ui-surface); min-height: 86px; padding: 6px; font-size: 13px; ${({ $current }) => $current && "box-shadow: inset 0 0 0 2px var(--ui-accent);"}`;
const CalendarLink = styled.a`display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--ui-accent); &:focus-visible { outline: 2px solid var(--ui-focus); }`;
const List = styled.div`display: grid; gap: 12px; margin-bottom: 28px;`;
const Row = styled(Surface)`display: grid; gap: 12px; scroll-margin-top: 24px;`;
const RowTop = styled.div`display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; h3 { margin: 0; font-size: 17px; } p { margin: 4px 0 0; color: var(--ui-text-muted); font-size: 13px; }`;
const Badge = styled.span<{ $paid?: boolean }>`border-radius: 99px; padding: 4px 9px; font-size: 12px; font-weight: 700; background: ${({ $paid }) => $paid ? "#e2f6e9" : "#fff2d7"}; color: ${({ $paid }) => $paid ? "#17663c" : "#815900"};`;
const RowActions = styled.div`display: flex; gap: 8px; flex-wrap: wrap;`;
const Muted = styled.p`margin: 0; color: var(--ui-text-muted); font-size: 14px;`;
const PlanList = styled.div`display: grid; gap: 10px;`;
const PlanRow = styled(Surface)`display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap;`;

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const today = () => new Date().toISOString().slice(0, 10);
const validMonth = (value: string | null) => value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : today().slice(0, 7);

function CalendarView({ month, occurrences }: { month: string; occurrences: BillOccurrenceView[] }) {
	const [year, monthNumber] = month.split("-").map(Number);
	const offset = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7;
	const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
	const byDay = new Map<number, BillOccurrenceView[]>();
	for (const item of occurrences) {
		const day = Number(item.dueDate.slice(8, 10));
		byDay.set(day, [...(byDay.get(day) ?? []), item]);
	}
	return <Calendar as="section" aria-label={`${monthLabel(month)} bill calendar`}>
		<CalendarGrid>
			{weekdays.map((name) => <Weekday key={name}>{name}</Weekday>)}
			{Array.from({ length: offset }, (_, index) => <Day key={`blank-${index}`} aria-hidden="true" />)}
			{Array.from({ length: count }, (_, index) => {
				const day = index + 1;
				const date = `${month}-${String(day).padStart(2, "0")}`;
				const entries = byDay.get(day) ?? [];
				return <Day key={date} $current={date === today()}><strong>{day}</strong>
					{entries.slice(0, 2).map((entry) => <CalendarLink key={entry.id} href={`#bill-${entry.id}`}>{entry.title}{entry.paidAt ? " ✓" : ""}</CalendarLink>)}
					{entries.length > 2 && <small>+{entries.length - 2} more below</small>}
				</Day>;
			})}
		</CalendarGrid>
	</Calendar>;
}

function OccurrenceCard({ item, members, onPayment, busy }: { item: BillOccurrenceView; members: Record<string, string>; onPayment: (item: BillOccurrenceView) => void; busy: boolean }) {
	const status = item.paidAt ? "Paid" : item.dueDate < today() ? "Overdue" : "Pending";
	return <Row id={`bill-${item.id}`}>
		<RowTop><div><h3>{item.title}</h3><p>{formatBillDate(item.dueDate)} · {members[item.payerUserId] ?? "Member"} pays</p></div><Badge $paid={!!item.paidAt}>{status}</Badge></RowTop>
		<strong>{formatMoney(item.amountMinor, item.currency)}</strong>
		<Muted>Split: {Object.entries(item.splitBasisPoints).filter(([, share]) => share > 0).map(([id, share]) => `${members[id] ?? "Member"} ${(share / 100).toFixed(2)}%`).join(" · ")}</Muted>
		{item.linkedTransactionId && <Muted>Linked expense: {item.linkedTransactionId}</Muted>}
		<RowActions><UiButton type="button" disabled={busy} onClick={() => onPayment(item)}>{busy ? "Saving…" : item.paidAt ? "Mark pending" : "Mark paid"}</UiButton></RowActions>
	</Row>;
}

export default function BillsPage() {
	const session = useSelector((state: ReduxState) => state.value);
	const group = session?.extra?.group;
	const [params, setParams] = useSearchParams();
	const month = validMonth(params.get("month"));
	const { data, isLoading, isError, refetch } = useBillMonth(month);
	const create = useCreateBill();
	const update = useUpdateBill();
	const stop = useStopBill();
	const payment = useSetBillPayment();
	const [form, setForm] = useState<string | null>(null);
	const [stopId, setStopId] = useState<string | null>(null);
	const [paying, setPaying] = useState<BillOccurrenceView | null>(null);
	const [error, setError] = useState("");
	const members = useMemo(() => (group?.userids ?? []).map((id) => ({ id, name: session?.extra?.usersById[id]?.firstName ?? "Member" })), [group?.userids, session?.extra?.usersById]);
	const memberNames = Object.fromEntries(members.map(({ id, name }) => [id, name]));
	const editing = data?.bills.find((plan) => plan.id === form);
	const defaultCurrency = (group?.metadata?.defaultCurrency ?? "USD") as Currency;

	function changeMonth(next: string) {
		const copy = new URLSearchParams(params);
		copy.set("month", next);
		setParams(copy);
	}
	async function saveBill(input: BillCreateInput) {
		if (editing) await update.mutateAsync({ id: editing.id, ...input });
		else await create.mutateAsync(input);
		setForm(null);
	}
	async function togglePayment(item: BillOccurrenceView) {
		if (!item.paidAt) { setPaying(item); return; }
		setError("");
		try { await payment.mutateAsync({ occurrenceId: item.id, paid: false }); }
		catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to update payment."); }
	}
	async function recordPayment(linkedTransactionId?: string) {
		if (!paying) return;
		setError("");
		try { await payment.mutateAsync({ occurrenceId: paying.id, paid: true, ...(linkedTransactionId ? { linkedTransactionId } : {}) }); setPaying(null); }
		catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to record payment."); }
	}
	async function stopBill(id: string) {
		setStopId(null);
		setError("");
		try { await stop.mutateAsync({ id }); }
		catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to stop bill."); }
	}
	async function resumeBill(id: string) {
		setError("");
		try { await update.mutateAsync({ id, isActive: true }); }
		catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to resume bill."); }
	}

	return <UiPage data-test-id="bills-page">
		<UiPageHeader><div><UiPageTitle>Shared bills</UiPageTitle><UiPageDescription>Plan due dates, see each person's share, and record payments.</UiPageDescription></div><UiButton type="button" $tone="primary" onClick={() => setForm("new")}>Add bill</UiButton></UiPageHeader>
		{form && <BillForm key={form} initial={editing} members={members} defaultCurrency={defaultCurrency} defaultShares={group?.metadata?.defaultShare ?? {}} onSubmit={saveBill} onCancel={() => setForm(null)} busy={create.isPending || update.isPending} />}
		<BillReminders />
		<Toolbar><UiButton type="button" onClick={() => changeMonth(shiftMonth(month, -1))} aria-label="Previous month">←</UiButton><MonthName>{monthLabel(month)}</MonthName><UiButton type="button" onClick={() => changeMonth(shiftMonth(month, 1))} aria-label="Next month">→</UiButton><UiButton type="button" $tone="quiet" onClick={() => changeMonth(today().slice(0, 7))}>This month</UiButton></Toolbar>
		{error && <p role="alert">{error}</p>}
		{isLoading && <Surface>Loading bills…</Surface>}
		{isError && <Surface><p>Unable to load bills.</p><UiButton type="button" onClick={() => refetch()}>Retry</UiButton></Surface>}
		{data && <>
			{data.summary.length > 0 && <SummaryGrid>{data.summary.map((summary) => <Summary key={summary.currency} as="section" aria-label={`${summary.currency} summary`}><strong>{formatMoney(summary.dueMinor, summary.currency)} due</strong><span>{formatMoney(summary.plannedMinor, summary.currency)} planned · {formatMoney(summary.paidMinor, summary.currency)} paid</span><span>Planned owed to payers: {Object.entries(summary.plannedOwedByUserMinor).length ? Object.entries(summary.plannedOwedByUserMinor).map(([id, amount]) => `${memberNames[id] ?? "Member"} ${formatMoney(amount, summary.currency)}`).join(" · ") : "None"}</span></Summary>)}</SummaryGrid>}
			<CalendarView month={month} occurrences={data.occurrences} />
			<UiSectionTitle>Due this month</UiSectionTitle>
			{data.occurrences.length === 0 ? <Surface><Muted>No bills are due in this month. Add one or choose another month.</Muted></Surface> : <List>{data.occurrences.map((item) => <OccurrenceCard key={item.id} item={item} members={memberNames} onPayment={togglePayment} busy={payment.isPending} />)}</List>}
			<UiSectionTitle>Bill plans</UiSectionTitle>
			<PlanList>{data.bills.length === 0 ? <Surface><Muted>No bill plans yet.</Muted></Surface> : data.bills.map((plan: BillPlan) => <PlanRow key={plan.id}><div><strong>{plan.title}</strong><Muted>{formatMoney(plan.amountMinor, plan.currency)} · {plan.recurrence} · {plan.isActive ? "Active" : "Stopped"}</Muted></div><RowActions><UiButton type="button" onClick={() => setForm(plan.id)}>Edit</UiButton>{plan.isActive ? <UiButton type="button" $tone="danger" onClick={() => setStopId(plan.id)}>Stop</UiButton> : <UiButton type="button" onClick={() => void resumeBill(plan.id)}>Resume</UiButton>}</RowActions></PlanRow>)}</PlanList>
		</>}
		<ConfirmDialog open={!!stopId} title="Stop this bill?" message="Future unpaid dates for this bill will be removed. Recorded payments remain visible." confirmText="Stop bill" onCancel={() => setStopId(null)} onConfirm={() => { if (stopId) void stopBill(stopId); }} />
		<PaymentDialog key={paying?.id ?? "closed"} item={paying} onClose={() => setPaying(null)} onRecord={recordPayment} busy={payment.isPending} />
	</UiPage>;
}
