import { and, asc, eq, gte, lt, isNull } from "drizzle-orm";
import {
	BillCreateSchema, BillIdSchema, BillMonthQuerySchema, BillPaymentSchema,
	BillUpdateSchema, type BillMonthResponse, type Currency,
} from "../../../shared-types";
import type { getDb } from "../db";
import { bills, billOccurrences, billReminders, transactions } from "../db/schema/schema";
import type { CurrentSession } from "../types";
import { createErrorResponse, createJsonResponse, formatZodError, generateRandomId, withAuth } from "../utils";
import { allocatedShares, dueDatesInMonth } from "../utils/bill-dates";

type Db = ReturnType<typeof getDb>;
type Bill = typeof bills.$inferSelect;

function addToSummary(summaries: Map<Currency, BillMonthResponse["summary"][number]>, occurrence: typeof billOccurrences.$inferSelect): void {
	const currency = occurrence.currency as Currency;
	let summary = summaries.get(currency);
	if (!summary) {
		summary = { currency, plannedMinor: 0, dueMinor: 0, paidMinor: 0, sharesByUserMinor: {}, plannedOwedByUserMinor: {} };
		summaries.set(currency, summary);
	}
	summary.plannedMinor += occurrence.amountMinor;
	if (occurrence.paidAt) summary.paidMinor += occurrence.amountMinor;
	else summary.dueMinor += occurrence.amountMinor;
	for (const [userId, amount] of Object.entries(allocatedShares(occurrence.amountMinor, occurrence.splitBasisPoints))) {
		summary.sharesByUserMinor[userId] = (summary.sharesByUserMinor[userId] ?? 0) + amount;
		if (!occurrence.paidAt && userId !== occurrence.payerUserId) {
			summary.plannedOwedByUserMinor[userId] = (summary.plannedOwedByUserMinor[userId] ?? 0) + amount;
		}
	}
}

function groupId(session: CurrentSession): string | null {
	return session.group?.groupid ?? null;
}

function validMembers(session: CurrentSession, payerUserId: string, shares: Record<string, number>): boolean {
	const members = new Set(session.group?.userids ?? []);
	return members.has(payerUserId) && Object.keys(shares).length > 0 && Object.keys(shares).every((id) => members.has(id));
}

async function findBill(db: Db, id: string, group: string): Promise<Bill | undefined> {
	return (await db.select().from(bills).where(and(eq(bills.id, id), eq(bills.groupId, group))).limit(1))[0];
}

export async function materializeBillMonth(db: Db, bill: Bill, month: string): Promise<void> {
	if (!bill.isActive) return;
	for (const dueDate of dueDatesInMonth(bill.firstDueDate, bill.recurrence, month)) {
		await db.insert(billOccurrences).values({
		id: generateRandomId(),
		billId: bill.id,
		groupId: bill.groupId,
		title: bill.title,
		dueDate,
		amountMinor: bill.amountMinor,
		currency: bill.currency,
		payerUserId: bill.payerUserId,
		splitBasisPoints: bill.splitBasisPoints,
		createdAt: new Date().toISOString(),
		}).onConflictDoNothing({ target: [billOccurrences.billId, billOccurrences.dueDate] });
	}
}

export async function handleBillCreate(request: Request, env: Env): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = groupId(session);
		if (!group) return createErrorResponse("User not in a group", 400, request, env);
		const parsed = BillCreateSchema.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse(formatZodError(parsed.error), 400, request, env);
		if (!validMembers(session, parsed.data.payerUserId, parsed.data.splitBasisPoints)) {
			return createErrorResponse("Payer and split users must belong to your group", 400, request, env);
		}
		const now = new Date().toISOString();
		const bill: typeof bills.$inferInsert = {
			id: generateRandomId(), groupId: group, ...parsed.data, isActive: true, createdAt: now, updatedAt: now,
		};
		await db.insert(bills).values(bill);
		await materializeBillMonth(db, bill as Bill, bill.firstDueDate.slice(0, 7));
		return createJsonResponse({ id: bill.id }, 201, {}, request, env);
	});
}

export async function handleBillMonth(request: Request, env: Env): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = groupId(session);
		if (!group) return createErrorResponse("User not in a group", 400, request, env);
		const parsed = BillMonthQuerySchema.safeParse({ month: new URL(request.url).searchParams.get("month") });
		if (!parsed.success) return createErrorResponse(formatZodError(parsed.error), 400, request, env);
		const { month } = parsed.data;
		const plans = await db.select().from(bills).where(eq(bills.groupId, group)).orderBy(asc(bills.title));
		for (const plan of plans) await materializeBillMonth(db, plan, month);
		const rows = await db.select().from(billOccurrences)
			.where(and(eq(billOccurrences.groupId, group), gte(billOccurrences.dueDate, `${month}-01`), lt(billOccurrences.dueDate, `${month}-32`)))
			.orderBy(asc(billOccurrences.dueDate), asc(billOccurrences.title));
		const summaries = new Map<Currency, BillMonthResponse["summary"][number]>();
		const occurrences = rows.map((occurrence) => {
			const currency = occurrence.currency as Currency;
			addToSummary(summaries, occurrence);
			return { id: occurrence.id, billId: occurrence.billId, title: occurrence.title, dueDate: occurrence.dueDate,
				amountMinor: occurrence.amountMinor, currency, payerUserId: occurrence.payerUserId,
				splitBasisPoints: occurrence.splitBasisPoints, paidAt: occurrence.paidAt,
				linkedTransactionId: occurrence.linkedTransactionId };
		});
		const response: BillMonthResponse = {
			month,
			bills: plans.map((plan) => ({ id: plan.id, title: plan.title, amountMinor: plan.amountMinor,
				currency: plan.currency as Currency, firstDueDate: plan.firstDueDate, recurrence: plan.recurrence,
				payerUserId: plan.payerUserId, splitBasisPoints: plan.splitBasisPoints, isActive: plan.isActive })),
			occurrences,
			summary: [...summaries.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
		};
		return createJsonResponse(response, 200, {}, request, env);
	});
}

export async function handleBillUpdate(request: Request, env: Env): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = groupId(session);
		if (!group) return createErrorResponse("User not in a group", 400, request, env);
		const parsed = BillUpdateSchema.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse(formatZodError(parsed.error), 400, request, env);
		const existing = await findBill(db, parsed.data.id, group);
		if (!existing) return createErrorResponse("Bill not found", 404, request, env);
		const next = { ...existing, ...parsed.data };
		if (!validMembers(session, next.payerUserId, next.splitBasisPoints)) {
			return createErrorResponse("Payer and split users must belong to your group", 400, request, env);
		}
		const { id: _id, ...fields } = parsed.data;
		// Paid occurrences retain their historical snapshot. Refresh unpaid dates
		// so editing a plan never silently alters a recorded payment.
		await db.batch([
			db.update(bills).set({ ...fields, updatedAt: new Date().toISOString() }).where(and(eq(bills.id, existing.id), eq(bills.groupId, group))),
			db.delete(billOccurrences).where(and(eq(billOccurrences.billId, existing.id), eq(billOccurrences.groupId, group), isNull(billOccurrences.paidAt))),
		]);
		// The next month request will materialize the updated plan.
		return createJsonResponse({ message: "Bill updated" }, 200, {}, request, env);
	});
}

export async function handleBillDelete(request: Request, env: Env): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = groupId(session);
		if (!group) return createErrorResponse("User not in a group", 400, request, env);
		const parsed = BillIdSchema.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse(formatZodError(parsed.error), 400, request, env);
		const existing = await findBill(db, parsed.data.id, group);
		if (!existing) return createErrorResponse("Bill not found", 404, request, env);
		await db.batch([
			db.update(bills).set({ isActive: false, updatedAt: new Date().toISOString() }).where(eq(bills.id, existing.id)),
			db.delete(billOccurrences).where(and(eq(billOccurrences.billId, existing.id), eq(billOccurrences.groupId, group), isNull(billOccurrences.paidAt), gte(billOccurrences.dueDate, new Date().toISOString().slice(0, 10)))),
		]);
		return createJsonResponse({ message: "Bill stopped" }, 200, {}, request, env);
	});
}

export async function handleBillPayment(request: Request, env: Env): Promise<Response> {
	// Validation and the state transition stay together so a linked expense can
	// never be accepted independently of the payment it documents.
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cohesive payment transition
	return withAuth(request, env, async (session, db) => {
		const group = groupId(session);
		if (!group) return createErrorResponse("User not in a group", 400, request, env);
		const parsed = BillPaymentSchema.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse(formatZodError(parsed.error), 400, request, env);
		const input = parsed.data;
		const occurrence = (await db.select().from(billOccurrences).where(and(eq(billOccurrences.id, input.occurrenceId), eq(billOccurrences.groupId, group))).limit(1))[0];
		if (!occurrence) return createErrorResponse("Bill occurrence not found", 404, request, env);
		if (input.linkedTransactionId && !input.paid) return createErrorResponse("A transaction can only be linked when marking paid", 400, request, env);
		if (input.linkedTransactionId && !await matchesExpense(db, input.linkedTransactionId, group, occurrence)) {
			return createErrorResponse("Linked expense must belong to this group and match the bill amount and currency", 400, request, env);
		}
		await db.update(billOccurrences).set({ paidAt: input.paid ? new Date().toISOString() : null,
			linkedTransactionId: input.paid ? input.linkedTransactionId ?? occurrence.linkedTransactionId : null })
			.where(and(eq(billOccurrences.id, occurrence.id), eq(billOccurrences.groupId, group)));
		return createJsonResponse({ message: input.paid ? "Bill marked paid" : "Bill marked pending" }, 200, {}, request, env);
	});
}

async function matchesExpense(db: Db, transactionId: string, group: string, occurrence: typeof billOccurrences.$inferSelect): Promise<boolean> {
	const transaction = (await db.select().from(transactions).where(and(eq(transactions.transactionId, transactionId), eq(transactions.groupId, group))).limit(1))[0];
	if (!transaction || transaction.deleted || transaction.currency !== occurrence.currency) return false;
	const units = occurrence.currency === "JPY" ? 1 : 100;
	return Math.round(transaction.amount * units) === occurrence.amountMinor;
}

export async function handleBillReminders(request: Request, env: Env): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = groupId(session);
		if (!group) return createErrorResponse("User not in a group", 400, request, env);
		const rows = await db.select({ reminder: billReminders, occurrence: billOccurrences })
			.from(billReminders).innerJoin(billOccurrences, eq(billReminders.occurrenceId, billOccurrences.id))
			.where(and(eq(billReminders.userId, session.currentUser.id), eq(billOccurrences.groupId, group), isNull(billOccurrences.paidAt)))
			.orderBy(asc(billReminders.readAt), asc(billOccurrences.dueDate)).limit(100);
		return createJsonResponse(rows.map(({ reminder, occurrence }) => ({
			id: reminder.id, occurrenceId: occurrence.id, userId: reminder.userId, kind: reminder.kind,
			createdAt: reminder.createdAt, readAt: reminder.readAt, title: occurrence.title, dueDate: occurrence.dueDate,
		})), 200, {}, request, env);
	});
}

export async function handleBillReminderRead(request: Request, env: Env): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const parsed = BillIdSchema.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse(formatZodError(parsed.error), 400, request, env);
		const result = await db.update(billReminders).set({ readAt: new Date().toISOString() })
			.where(and(eq(billReminders.id, parsed.data.id), eq(billReminders.userId, session.currentUser.id))).returning({ id: billReminders.id });
		if (!result.length) return createErrorResponse("Reminder not found", 404, request, env);
		return createJsonResponse({ message: "Reminder read" }, 200, {}, request, env);
	});
}
