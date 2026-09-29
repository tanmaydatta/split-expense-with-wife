import { and, asc, eq, gte, lt, isNull, ne } from "drizzle-orm";
import { ulid } from "ulid";
import {
	BillCreateSchema, BillIdSchema, BillMonthQuerySchema, BillPaymentSchema,
	BillUpdateSchema, type BillMonthResponse, type Currency,
} from "../../../shared-types";
import type { getDb } from "../db";
import { user } from "../db/schema/auth-schema";
import { bills, billOccurrences, billReminders, expenseBudgetLinks, groupBudgets, scheduledActions, transactions, transactionUsers } from "../db/schema/schema";
import type { CurrentSession } from "../types";
import { createErrorResponse, createJsonResponse, formatZodError, generateRandomId, withAuth } from "../utils";
import { allocatedShares, dueDatesInMonth } from "../utils/bill-dates";
import { createBudgetEntryStatements, createSplitTransactionFromRequest, generateDeterministicTransactionId } from "../utils/scheduled-action-execution";

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

function majorAmount(amountMinor: number, currency: string): number {
	return amountMinor / (currency === "JPY" ? 1 : 100);
}

async function validateScheduledLink(db: Db, group: string, plan: Pick<Bill, "scheduledActionId" | "recurrence" | "firstDueDate" | "amountMinor" | "currency" | "payerUserId" | "splitBasisPoints">): Promise<string | null> {
	if (!plan.scheduledActionId) return null;
	if (plan.recurrence === "once") return "One-time bills cannot link to a recurring scheduled action";
	const row = (await db.select({ action: scheduledActions, owner: user }).from(scheduledActions)
		.innerJoin(user, eq(scheduledActions.userId, user.id))
		.where(eq(scheduledActions.id, plan.scheduledActionId)).limit(1))[0];
	if (!row || row.owner.groupid !== group || row.action.actionType !== "add_expense") return "Choose a scheduled expense from this group";
	const action = row.action;
	const data = action.actionData;
	if (action.frequency !== plan.recurrence || action.startDate !== plan.firstDueDate ||
		data.amount !== majorAmount(plan.amountMinor, plan.currency) || data.currency !== plan.currency ||
		!("paidByUserId" in data) || data.paidByUserId !== plan.payerUserId ||
		Object.keys(plan.splitBasisPoints).some((id) => Math.abs((data.splitPctShares[id] ?? 0) * 100 - plan.splitBasisPoints[id]) > 0.01) ||
		Object.keys(data.splitPctShares).some((id) => !(id in plan.splitBasisPoints))) {
		return "Scheduled expense must have the same first date, cadence, amount, currency, payer and split as the bill";
	}
	return null;
}

async function scheduledLinkInUse(db: Db, actionId: string | null | undefined, exceptBillId?: string): Promise<boolean> {
	if (!actionId) return false;
	const condition = exceptBillId ? and(eq(bills.scheduledActionId, actionId), ne(bills.id, exceptBillId)) : eq(bills.scheduledActionId, actionId);
	return (await db.select({ id: bills.id }).from(bills).where(condition).limit(1)).length > 0;
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
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates plan membership and optional scheduled link together
	return withAuth(request, env, async (session, db) => {
		const group = groupId(session);
		if (!group) return createErrorResponse("User not in a group", 400, request, env);
		const parsed = BillCreateSchema.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse(formatZodError(parsed.error), 400, request, env);
		if (!validMembers(session, parsed.data.payerUserId, parsed.data.splitBasisPoints)) {
			return createErrorResponse("Payer and split users must belong to your group", 400, request, env);
		}
		const linkError = await validateScheduledLink(db, group, { ...parsed.data, scheduledActionId: parsed.data.scheduledActionId ?? null });
		if (linkError) return createErrorResponse(linkError, 400, request, env);
		if (await scheduledLinkInUse(db, parsed.data.scheduledActionId)) {
			return createErrorResponse("Scheduled expense is already linked to a bill", 409, request, env);
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
		const plansById = new Map(plans.map((plan) => [plan.id, plan]));
		const occurrences = await Promise.all(rows.map(async (occurrence) => {
			const currency = occurrence.currency as Currency;
			addToSummary(summaries, occurrence);
			const actionId = plansById.get(occurrence.billId)?.scheduledActionId;
			const candidateId = actionId ? generateDeterministicTransactionId(actionId, occurrence.dueDate) : null;
			const scheduledTransactionId = candidateId && await matchesExpense(db, candidateId, group, occurrence) ? candidateId : null;
			return { id: occurrence.id, billId: occurrence.billId, title: occurrence.title, dueDate: occurrence.dueDate,
				amountMinor: occurrence.amountMinor, currency, payerUserId: occurrence.payerUserId,
				splitBasisPoints: occurrence.splitBasisPoints, paidAt: occurrence.paidAt,
				linkedTransactionId: occurrence.linkedTransactionId, scheduledTransactionId };
		}));
		const response: BillMonthResponse = {
			month,
			bills: plans.map((plan) => ({ id: plan.id, title: plan.title, amountMinor: plan.amountMinor,
				currency: plan.currency as Currency, firstDueDate: plan.firstDueDate, recurrence: plan.recurrence,
				payerUserId: plan.payerUserId, splitBasisPoints: plan.splitBasisPoints, isActive: plan.isActive,
				scheduledActionId: plan.scheduledActionId })),
			occurrences,
			summary: [...summaries.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
		};
		return createJsonResponse(response, 200, {}, request, env);
	});
}

export async function handleBillScheduledOptions(request: Request, env: Env): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = groupId(session);
		if (!group) return createErrorResponse("User not in a group", 400, request, env);
		const rows = await db.select({ action: scheduledActions }).from(scheduledActions)
			.innerJoin(user, eq(scheduledActions.userId, user.id))
			.where(and(eq(user.groupid, group), eq(scheduledActions.actionType, "add_expense")))
			.orderBy(asc(scheduledActions.createdAt));
		return createJsonResponse(rows.map(({ action }) => {
			const data = action.actionData;
			if (!("paidByUserId" in data)) return null;
			return { id: action.id, description: data.description, amount: data.amount, currency: data.currency,
				frequency: action.frequency, startDate: action.startDate, payerUserId: data.paidByUserId,
				splitPctShares: data.splitPctShares, isActive: action.isActive };
		}).filter((option) => option !== null), 200, {}, request, env);
	});
}

export async function handleBillUpdate(request: Request, env: Env): Promise<Response> {
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates plan membership and optional scheduled link together
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
		const linkError = await validateScheduledLink(db, group, next);
		if (linkError) return createErrorResponse(linkError, 400, request, env);
		if (await scheduledLinkInUse(db, next.scheduledActionId, existing.id)) {
			return createErrorResponse("Scheduled expense is already linked to a bill", 409, request, env);
		}
		const { id: _id, ...fields } = parsed.data;
		// Paid occurrences retain their historical snapshot. Refresh unpaid dates
		// so editing a plan never silently alters a recorded payment.
		await db.batch([
			db.update(bills).set({ ...fields, updatedAt: new Date().toISOString() }).where(and(eq(bills.id, existing.id), eq(bills.groupId, group))),
			db.delete(billOccurrences).where(and(eq(billOccurrences.billId, existing.id), eq(billOccurrences.groupId, group), isNull(billOccurrences.paidAt), isNull(billOccurrences.linkedTransactionId))),
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
			db.delete(billOccurrences).where(and(eq(billOccurrences.billId, existing.id), eq(billOccurrences.groupId, group), isNull(billOccurrences.paidAt), isNull(billOccurrences.linkedTransactionId), gte(billOccurrences.dueDate, new Date().toISOString().slice(0, 10)))),
		]);
		return createJsonResponse({ message: "Bill stopped" }, 200, {}, request, env);
	});
}

export async function handleBillPayment(request: Request, env: Env): Promise<Response> {
	// Build balance changes and the paid state in one D1 batch. The bill-derived
	// transaction ID also makes retries and scheduled runs idempotent.
	// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: cohesive payment transition
	return withAuth(request, env, async (session, db) => {
		const group = groupId(session);
		if (!group) return createErrorResponse("User not in a group", 400, request, env);
		const parsed = BillPaymentSchema.safeParse(await request.json());
		if (!parsed.success) return createErrorResponse(formatZodError(parsed.error), 400, request, env);
		const input = parsed.data;
		const occurrence = (await db.select().from(billOccurrences).where(and(eq(billOccurrences.id, input.occurrenceId), eq(billOccurrences.groupId, group))).limit(1))[0];
		if (!occurrence) return createErrorResponse("Bill occurrence not found", 404, request, env);
		if (!input.paid) {
			// Keep the expense link: reversing payment never reverses balances, and
			// retaining the link prevents a second expense on a later retry.
			await db.update(billOccurrences).set({ paidAt: null }).where(eq(billOccurrences.id, occurrence.id));
			return createJsonResponse({ message: "Bill marked pending" }, 200, {}, request, env);
		}
		if (occurrence.paidAt) return createErrorResponse("Bill is already marked paid", 409, request, env);
		const plan = await findBill(db, occurrence.billId, group);
		const scheduledId = plan?.scheduledActionId ? generateDeterministicTransactionId(plan.scheduledActionId, occurrence.dueDate) : null;
		const existingScheduled = scheduledId && await matchesExpense(db, scheduledId, group, occurrence) ? scheduledId : null;
		const currentLink = occurrence.linkedTransactionId ?? existingScheduled;
		if (input.createExpense && currentLink) return createErrorResponse("This bill already has an expense. Link it instead of creating another", 409, request, env);
		if (input.linkedTransactionId && currentLink && input.linkedTransactionId !== currentLink) return createErrorResponse("This bill already has a different expense", 409, request, env);
		const transactionId = input.createExpense ? scheduledId ?? `tx_bill_${occurrence.id}` : input.linkedTransactionId ?? currentLink;
		if (transactionId && !input.createExpense && !await matchesExpense(db, transactionId, group, occurrence)) {
			return createErrorResponse("Linked expense must match this group's amount, currency and payer", 400, request, env);
		}
		if (transactionId && (await db.select({ id: billOccurrences.id }).from(billOccurrences)
			.where(and(eq(billOccurrences.linkedTransactionId, transactionId), ne(billOccurrences.id, occurrence.id))).limit(1)).length) {
			return createErrorResponse("Expense is already linked to another bill", 409, request, env);
		}
		const queries = [];
		let budgetEntryId: string | undefined;
		if (input.createExpense && transactionId) {
			const amount = majorAmount(occurrence.amountMinor, occurrence.currency);
			const result = await createSplitTransactionFromRequest({
				amount, description: occurrence.title, currency: occurrence.currency,
				paidByShares: { [occurrence.payerUserId]: amount },
				splitPctShares: Object.fromEntries(Object.entries(occurrence.splitBasisPoints).map(([id, basisPoints]) => [id, basisPoints / 100])),
			}, group, db, env, transactionId);
			if (!result.statements.length) return createErrorResponse("This expense already exists. Link it instead", 409, request, env);
			queries.push(...result.statements.map((statement) => statement.query));
			if (input.budgetId) {
				const budget = (await db.select().from(groupBudgets).where(and(eq(groupBudgets.id, input.budgetId), eq(groupBudgets.groupId, group), isNull(groupBudgets.deleted))).limit(1))[0];
				if (!budget) return createErrorResponse("Budget category not found in this group", 400, request, env);
				budgetEntryId = `bge_bill_${occurrence.id}`;
				const debit = await createBudgetEntryStatements({ amount: -amount, description: occurrence.title, budgetId: budget.id, currency: occurrence.currency, groupid: group }, db, budgetEntryId);
				if (!debit.statements.length) return createErrorResponse("Budget debit already exists", 409, request, env);
				queries.push(...debit.statements.map((statement) => statement.query));
				queries.push(db.insert(expenseBudgetLinks).values({ id: ulid(), transactionId, budgetEntryId, groupId: group, createdAt: new Date().toISOString() }));
			}
		}
		queries.push(db.update(billOccurrences).set({ paidAt: new Date().toISOString(), linkedTransactionId: transactionId ?? null })
			.where(and(eq(billOccurrences.id, occurrence.id), eq(billOccurrences.groupId, group), isNull(billOccurrences.paidAt))));
		await db.batch([queries[0], ...queries.slice(1)]);
		return createJsonResponse({ message: "Bill marked paid", ...(transactionId ? { transactionId } : {}), ...(budgetEntryId ? { budgetEntryId } : {}) }, 200, {}, request, env);
	});
}

async function matchesExpense(db: Db, transactionId: string, group: string, occurrence: typeof billOccurrences.$inferSelect): Promise<boolean> {
	const transaction = (await db.select().from(transactions).where(and(eq(transactions.transactionId, transactionId), eq(transactions.groupId, group))).limit(1))[0];
	if (!transaction || transaction.deleted || transaction.currency !== occurrence.currency) return false;
	const units = occurrence.currency === "JPY" ? 1 : 100;
	if (Math.round(transaction.amount * units) !== occurrence.amountMinor) return false;
	const splits = await db.select({ owedToUserId: transactionUsers.owedToUserId }).from(transactionUsers)
		.where(and(eq(transactionUsers.transactionId, transactionId), eq(transactionUsers.groupId, group), isNull(transactionUsers.deleted)));
	if (splits.some((split) => split.owedToUserId !== occurrence.payerUserId)) return false;
	const payer = (await db.select({ firstName: user.firstName }).from(user).where(eq(user.id, occurrence.payerUserId)).limit(1))[0];
	const paidBy = transaction.metadata?.paidByShares;
	return !!payer && !!paidBy && Object.keys(paidBy).length === 1 && Math.round((paidBy[payer.firstName] ?? 0) * units) === occurrence.amountMinor;
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
