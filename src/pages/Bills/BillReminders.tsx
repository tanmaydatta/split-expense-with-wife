import { useState } from "react";
import styled from "styled-components";
import { Surface, UiButton, UiSectionTitle } from "@/components/ui";
import { useBillReminders, useReadBillReminder } from "@/hooks/useBills";
import { formatBillDate } from "./bill-utils";

const Panel = styled(Surface)`margin-bottom: 20px;`;
const List = styled.ul`list-style: none; margin: 0; padding: 0; display: grid; gap: 10px;`;
const Item = styled.li`display: flex; align-items: center; justify-content: space-between; gap: 12px; border-top: 1px solid var(--ui-border); padding-top: 10px; flex-wrap: wrap;`;

export function BillReminders() {
	const { data, isError, refetch } = useBillReminders();
	const markRead = useReadBillReminder();
	const [error, setError] = useState("");
	const unread = data?.filter((reminder) => !reminder.readAt) ?? [];
	if (!unread.length && !isError) return null;
	async function read(id: string) {
		setError("");
		try { await markRead.mutateAsync({ id }); }
		catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to dismiss reminder."); }
	}
	return <Panel as="section" aria-label="Bill reminders">
		<UiSectionTitle>Reminders {unread.length > 0 && `(${unread.length})`}</UiSectionTitle>
		{isError && <p>Reminders are unavailable. <UiButton type="button" onClick={() => refetch()}>Retry</UiButton></p>}
		{error && <p role="alert">{error}</p>}
		<List>{unread.map((reminder) => <Item key={reminder.id}>
			<span><strong>{reminder.title}</strong> {reminder.kind === "overdue" ? "was due" : "is due"} {formatBillDate(reminder.dueDate)}.</span>
			<UiButton type="button" $tone="quiet" onClick={() => void read(reminder.id)} disabled={markRead.isPending}>Dismiss</UiButton>
		</Item>)}</List>
	</Panel>;
}
