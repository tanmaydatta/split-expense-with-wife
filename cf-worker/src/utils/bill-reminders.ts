import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { getDb } from "../db";
import type { Bill, BillOccurrence } from "../db/schema/schema";
import { bills, billOccurrences, billReminders, groups } from "../db/schema/schema";
import { generateRandomId } from "../utils";
import { addUtcDays } from "./bill-dates";
import { materializeBillMonth } from "../handlers/bills";

type Db = ReturnType<typeof getDb>;
type Candidate = { occurrence: BillOccurrence; bill: Bill };

function groupMembers(raw: string | null): string[] {
	try {
		const value: unknown = JSON.parse(raw ?? "[]");
		return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
	} catch { return []; }
}

async function materializeWindow(db: Db, today: string) {
	const plans = await db.select().from(bills).where(eq(bills.isActive, true));
	const months = new Set([addUtcDays(today, -7).slice(0, 7), today.slice(0, 7), addUtcDays(today, 3).slice(0, 7)]);
	for (const plan of plans) for (const month of months) await materializeBillMonth(db, plan, month);
}

async function loadCandidates(db: Db, today: string) {
	const [rows, groupRows] = await Promise.all([
		db.select({ occurrence: billOccurrences, bill: bills }).from(billOccurrences)
			.innerJoin(bills, eq(billOccurrences.billId, bills.id))
			.where(and(isNull(billOccurrences.paidAt), eq(bills.isActive, true), gte(billOccurrences.dueDate, addUtcDays(today, -7)), lte(billOccurrences.dueDate, addUtcDays(today, 3)))),
		db.select({ id: groups.groupid, userids: groups.userids }).from(groups),
	]);
	return { rows, membersByGroup: new Map(groupRows.map((group) => [group.id, groupMembers(group.userids)])) };
}

function reminderKind(candidate: Candidate, today: string): "upcoming" | "overdue" | null {
	const { occurrence, bill } = candidate;
	if (occurrence.dueDate < today) return "overdue";
	const lead = bill.recurrence === "daily" ? 0 : bill.recurrence === "weekly" ? 1 : 3;
	return occurrence.dueDate === addUtcDays(today, lead) ? "upcoming" : null;
}

async function insertForCandidate(db: Db, candidate: Candidate, members: string[], today: string): Promise<number> {
	const kind = reminderKind(candidate, today);
	if (!kind) return 0;
	let created = 0;
	for (const userId of members) {
		const inserted = await db.insert(billReminders).values({
			id: generateRandomId(), occurrenceId: candidate.occurrence.id, userId, kind, createdAt: new Date().toISOString(),
		}).onConflictDoNothing({ target: [billReminders.occurrenceId, billReminders.userId, billReminders.kind] }).returning({ id: billReminders.id });
		created += inserted.length;
	}
	return created;
}

/** Run once from the existing midnight-UTC cron. Unique rows make retries safe. */
export async function generateBillReminders(env: Env, today = new Date().toISOString().slice(0, 10)): Promise<number> {
	const db = getDb(env);
	await materializeWindow(db, today);
	const { rows, membersByGroup } = await loadCandidates(db, today);
	let created = 0;
	for (const candidate of rows) created += await insertForCandidate(db, candidate, membersByGroup.get(candidate.occurrence.groupId) ?? [], today);
	return created;
}
