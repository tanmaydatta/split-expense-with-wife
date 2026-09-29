import { and, asc, eq, gte, lt, isNull, ne, sql } from "drizzle-orm";
import { ulid } from "ulid";
import {
	BillCreateSchema, BillIdSchema, BillMonthQuerySchema, BillPaymentSchema,
	BillUpdateSchema, type BillMonthResponse, type Currency,
} from "../../../shared-types";
import type { getDb } from "../db";
import { user } from "../db/schema/auth-schema";
import { bills, billOccurrences, billReminders, budgetEntries, expenseBudgetLinks, groupBudgets, scheduledActions, transactions, transactionUsers } from "../db/schema/schema";
import type { CurrentSession } from "../types";
import { createErrorResponse, createJsonResponse, formatZodError, generateRandomId, withAuth } from "../utils";
import { allocatedShares, dueDatesInMonth } from "../utils/bill-dates";
import { createBudgetEntryStatements, createSplitTransactionFromRequest, generateDeterministicBudgetId, generateDeterministicTransactionId } from "../utils/scheduled-action-execution";

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

async function scheduledOutputId(db: Db, actionId: string | null | undefined, dueDate: string, group: string, kind: "expense" | "budget"): Promise<string | null> {
	if (!actionId) return null;
	const row = (await db.select({ action: scheduledActions, owner: user }).from(scheduledActions)
		.innerJoin(user, eq(scheduledActions.userId, user.id)).where(eq(scheduledActions.id, actionId)).limit(1))[0];
	if (!row || row.owner.groupid !== group || row.action.actionType !== (kind === "expense" ? "add_expense" : "add_budget") ||
		!dueDatesInMonth(row.action.startDate, row.action.frequency, dueDate.slice(0, 7)).includes(dueDate)) return null;
	return kind === "expense" ? generateDeterministicTransactionId(actionId, dueDate) : generateDeterministicBudgetId(actionId, dueDate);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: validates two linked action types and their shared run schedule
async function validateScheduledLink(db: Db, group: string, plan: Pick<Bill, "scheduledActionId" | "scheduledBudgetActionId">): Promise<string | null> {
	const choices = [[plan.scheduledActionId, "add_expense"], [plan.scheduledBudgetActionId, "add_budget"]] as const;
	const selected = [];
	for (const [id, type] of choices) {
		if (!id) continue;
		const row = (await db.select({ action: scheduledActions, owner: user }).from(scheduledActions)
			.innerJoin(user, eq(scheduledActions.userId, user.id)).where(eq(scheduledActions.id, id)).limit(1))[0];
		if (!row || row.owner.groupid !== group || row.action.actionType !== type) return `Choose a scheduled ${type === "add_expense" ? "expense" : "budget"} from this group`;
		selected.push(row.action);
	}
	if (selected.length === 2 && (selected[0].frequency !== selected[1].frequency || selected[0].startDate !== selected[1].startDate)) {
		return "Selected expense and budget actions must have the same first date and repeat schedule";
	}
	return null;
}

async function scheduledLinkInUse(db: Db, actionId: string | null | undefined, exceptBillId?: string, kind: "expense" | "budget" = "expense"): Promise<boolean> {
	if (!actionId) return false;
	const column = kind === "budget" ? bills.scheduledBudgetActionId : bills.scheduledActionId;
	const condition = exceptBillId ? and(eq(column, actionId), ne(bills.id, exceptBillId)) : eq(column, actionId);
	return (await db.select({ id: bills.id }).from(bills).where(condition).limit(1)).length > 0;
}

async function pairExistingScheduledOutputs(db: Db, bill: Pick<Bill, "id" | "groupId" | "scheduledActionId" | "scheduledBudgetActionId">): Promise<void> {
	if (!bill.scheduledActionId || !bill.scheduledBudgetActionId) return;
	const expensePrefix = `tx_${bill.scheduledActionId}_`;
	const budgetPrefix = `bge_${bill.scheduledBudgetActionId}_`;
	await db.run(sql`INSERT INTO expense_budget_links (id, transaction_id, budget_entry_id, group_id, created_at)
		SELECT ${`ebl_bill_${bill.id}_`} || SUBSTR(t.transaction_id, LENGTH(${expensePrefix}) + 1), t.transaction_id, be.budget_entry_id, ${bill.groupId}, ${new Date().toISOString()}
		FROM transactions t
		INNER JOIN budget_entries be ON be.budget_entry_id = ${budgetPrefix} || SUBSTR(t.transaction_id, LENGTH(${expensePrefix}) + 1)
		INNER JOIN group_budgets gb ON gb.id = be.budget_id
		WHERE SUBSTR(t.transaction_id, 1, LENGTH(${expensePrefix})) = ${expensePrefix} AND LENGTH(t.transaction_id) = LENGTH(${expensePrefix}) + 10
			AND t.group_id = ${bill.groupId} AND gb.group_id = ${bill.groupId} AND t.deleted IS NULL AND be.deleted IS NULL
		ON CONFLICT DO NOTHING`);
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
		const linkError = await validateScheduledLink(db, group, { ...parsed.data, scheduledActionId: parsed.data.scheduledActionId ?? null, scheduledBudgetActionId: parsed.data.scheduledBudgetActionId ?? null });
		if (linkError) return createErrorResponse(linkError, 400, request, env);
		if (await scheduledLinkInUse(db, parsed.data.scheduledActionId)) {
			return createErrorResponse("Scheduled expense is already linked to a bill", 409, request, env);
		}
		if (await scheduledLinkInUse(db, parsed.data.scheduledBudgetActionId, undefined, "budget")) return createErrorResponse("Scheduled budget action is already linked to a bill", 409, request, env);
		const now = new Date().toISOString();
		const bill: typeof bills.$inferInsert = {
			id: generateRandomId(), groupId: group, ...parsed.data, isActive: true, createdAt: now, updatedAt: now,
		};
		await db.insert(bills).values(bill);
		await materializeBillMonth(db, bill as Bill, bill.firstDueDate.slice(0, 7));
		await pairExistingScheduledOutputs(db, bill as Bill);
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
			const plan = plansById.get(occurrence.billId);
			const candidateId = await scheduledOutputId(db, plan?.scheduledActionId, occurrence.dueDate, group, "expense");
			const scheduledTransactionId = candidateId && (await db.select({ id: transactions.transactionId }).from(transactions).where(and(eq(transactions.transactionId, candidateId), eq(transactions.groupId, group), isNull(transactions.deleted))).limit(1)).length ? candidateId : null;
			const budgetCandidateId = await scheduledOutputId(db, plan?.scheduledBudgetActionId, occurrence.dueDate, group, "budget");
			const scheduledBudgetEntryId = budgetCandidateId && (await db.select({ id: budgetEntries.budgetEntryId }).from(budgetEntries)
				.innerJoin(groupBudgets, eq(budgetEntries.budgetId, groupBudgets.id))
				.where(and(eq(budgetEntries.budgetEntryId, budgetCandidateId), eq(groupBudgets.groupId, group), isNull(budgetEntries.deleted))).limit(1)).length ? budgetCandidateId : null;
			return { id: occurrence.id, billId: occurrence.billId, title: occurrence.title, dueDate: occurrence.dueDate,
				amountMinor: occurrence.amountMinor, currency, payerUserId: occurrence.payerUserId,
				splitBasisPoints: occurrence.splitBasisPoints, paidAt: occurrence.paidAt,
				linkedTransactionId: occurrence.linkedTransactionId, scheduledTransactionId, scheduledBudgetEntryId };
		}));
		const response: BillMonthResponse = {
			month,
			bills: plans.map((plan) => ({ id: plan.id, title: plan.title, amountMinor: plan.amountMinor,
				currency: plan.currency as Currency, firstDueDate: plan.firstDueDate, recurrence: plan.recurrence,
				payerUserId: plan.payerUserId, splitBasisPoints: plan.splitBasisPoints, isActive: plan.isActive,
				scheduledActionId: plan.scheduledActionId, scheduledBudgetActionId: plan.scheduledBudgetActionId })),
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
			.where(eq(user.groupid, group))
			.orderBy(asc(scheduledActions.createdAt));
		return createJsonResponse(rows.map(({ action }) => {
			const data = action.actionData;
			return { id: action.id, actionType: action.actionType, description: data.description, amount: data.amount, currency: data.currency,
				frequency: action.frequency, startDate: action.startDate,
				...("paidByUserId" in data ? { payerUserId: data.paidByUserId, splitPctShares: data.splitPctShares } : { budgetId: data.budgetId, budgetType: data.type }),
				isActive: action.isActive };
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
		if (await scheduledLinkInUse(db, next.scheduledBudgetActionId, existing.id, "budget")) return createErrorResponse("Scheduled budget action is already linked to a bill", 409, request, env);
		const { id: _id, ...fields } = parsed.data;
		// Paid occurrences retain their historical snapshot. Refresh unpaid dates
		// so editing a plan never silently alters a recorded payment.
		await db.batch([
			db.update(bills).set({ ...fields, updatedAt: new Date().toISOString() }).where(and(eq(bills.id, existing.id), eq(bills.groupId, group))),
			db.delete(billOccurrences).where(and(eq(billOccurrences.billId, existing.id), eq(billOccurrences.groupId, group), isNull(billOccurrences.paidAt), isNull(billOccurrences.linkedTransactionId))),
		]);
		await pairExistingScheduledOutputs(db, next);
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
		const scheduledId = await scheduledOutputId(db, plan?.scheduledActionId, occurrence.dueDate, group, "expense");
		const existingScheduled = scheduledId && (await db.select({ id: transactions.transactionId }).from(transactions).where(and(eq(transactions.transactionId, scheduledId), eq(transactions.groupId, group), isNull(transactions.deleted))).limit(1)).length ? scheduledId : null;
		const currentLink = occurrence.linkedTransactionId ?? existingScheduled;
		if (input.createExpense && scheduledId) return createErrorResponse("A scheduled expense is linked to this date. Unlink it from the bill before creating a separate expense", 409, request, env);
		if (input.budgetId && await scheduledOutputId(db, plan?.scheduledBudgetActionId, occurrence.dueDate, group, "budget")) return createErrorResponse("A scheduled budget action is linked to this date. Do not create another budget entry", 409, request, env);
		if (input.createExpense && currentLink) return createErrorResponse("This bill already has an expense. Link it instead of creating another", 409, request, env);
		if (input.linkedTransactionId && currentLink && input.linkedTransactionId !== currentLink) return createErrorResponse("This bill already has a different expense", 409, request, env);
		const transactionId = input.createExpense ? `tx_bill_${occurrence.id}` : input.linkedTransactionId ?? occurrence.linkedTransactionId;
		if (transactionId && !input.createExpense && transactionId !== existingScheduled && transactionId !== occurrence.linkedTransactionId && !await matchesExpense(db, transactionId, group, occurrence)) {
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
