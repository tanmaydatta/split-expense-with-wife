import { createExecutionContext, env as testEnv } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { billOccurrences, budgetEntries, scheduledActions, transactions } from "../db/schema/schema";
import worker from "../index";
import { processExpenseAction } from "../workflows/scheduled-actions-processor";
import { completeCleanupDatabase, createTestUserData, setupAndCleanDatabase, signInAndGetCookies } from "./test-utils";

const env = testEnv as unknown as Env;
const url = "https://localhost:8787/.netlify/functions";
const fetchBill = (request: Request, env: Env) => worker.fetch(request, env, createExecutionContext());

function request(path: string, method: string, cookies?: string, body?: unknown): Request {
	return new Request(`${url}/${path}`, {
		method,
		headers: { "Content-Type": "application/json", ...(cookies ? { Cookie: cookies } : {}) },
		...(body ? { body: JSON.stringify(body) } : {}),
	});
}

describe("shared bills", () => {
	let users: Awaited<ReturnType<typeof createTestUserData>>;
	let cookies: string;
	beforeAll(async () => { await setupAndCleanDatabase(env); });
	beforeEach(async () => {
		await completeCleanupDatabase(env);
		users = await createTestUserData(env);
		cookies = await signInAndGetCookies(env, users.user1.email, users.user1.password);
	});

	it("requires auth, validates membership, and materializes monthly dates once", async () => {
		const body = { title: "Rent", amountMinor: 120001, currency: "GBP", firstDueDate: "2026-01-31", recurrence: "monthly",
			payerUserId: users.user1.id, splitBasisPoints: { [users.user1.id]: 5000, [users.user2.id]: 5000 } };
		expect((await fetchBill(request("bills", "POST", undefined, body), env)).status).toBe(401);
		expect((await fetchBill(request("bills", "POST", cookies, { ...body, payerUserId: "outsider" }), env)).status).toBe(400);
		const created = await fetchBill(request("bills", "POST", cookies, body), env);
		expect(created.status).toBe(201);
		const month = () => fetchBill(request("bills/month?month=2026-02", "GET", cookies), env);
		const first = await (await month()).json() as { occurrences: Array<{ dueDate: string; amountMinor: number }>; summary: Array<{ dueMinor: number; sharesByUserMinor: Record<string, number>; plannedOwedByUserMinor: Record<string, number> }> };
		const second = await (await month()).json() as typeof first;
		expect(first.occurrences).toHaveLength(1);
		expect(first.occurrences[0].dueDate).toBe("2026-02-28");
		expect(second.occurrences).toHaveLength(1);
		expect(first.summary[0].dueMinor).toBe(120001);
		expect(Object.values(first.summary[0].sharesByUserMinor).reduce((sum, share) => sum + share, 0)).toBe(120001);
		expect(first.summary[0].plannedOwedByUserMinor[users.user1.id]).toBeUndefined();
		expect(first.summary[0].plannedOwedByUserMinor[users.user2.id]).toBe(first.summary[0].sharesByUserMinor[users.user2.id]);
	});

	it("marks one occurrence paid without creating an expense and can undo it", async () => {
		const body = { title: "Internet", amountMinor: 4000, currency: "USD", firstDueDate: "2026-09-15", recurrence: "once",
			payerUserId: users.user1.id, splitBasisPoints: { [users.user1.id]: 10000 } };
		await fetchBill(request("bills", "POST", cookies, body), env);
		const monthResponse = await fetchBill(request("bills/month?month=2026-09", "GET", cookies), env);
		const month = await monthResponse.json() as { occurrences: Array<{ id: string; title: string; amountMinor: number }>; summary: Array<{ paidMinor: number; dueMinor: number; plannedMinor: number; plannedOwedByUserMinor: Record<string, number> }> };
		const occurrenceId = month.occurrences[0].id;
		const invalidLink = await fetchBill(request("bills/payment", "POST", cookies, { occurrenceId, paid: true, linkedTransactionId: "other" }), env);
		expect(invalidLink.status).toBe(400);
		expect((await fetchBill(request("bills/payment", "POST", cookies, { occurrenceId, paid: true }), env)).status).toBe(200);
		const plans = await (await fetchBill(request("bills/month?month=2026-09", "GET", cookies), env)).json() as { bills: Array<{ id: string }> };
		expect((await fetchBill(request("bills/update", "POST", cookies, { id: plans.bills[0].id, title: "Renamed internet", amountMinor: 5000 }), env)).status).toBe(200);
		const paid = await (await fetchBill(request("bills/month?month=2026-09", "GET", cookies), env)).json() as typeof month;
		expect(paid.occurrences[0]).toMatchObject({ title: "Internet", amountMinor: 4000 });
		expect(paid.summary[0].paidMinor).toBe(4000);
		expect(paid.summary[0].dueMinor).toBe(0);
		expect(paid.summary[0].plannedMinor).toBe(4000);
		expect(paid.summary[0].plannedOwedByUserMinor).toEqual({});
		await fetchBill(request("bills/payment", "POST", cookies, { occurrenceId, paid: false }), env);
		const pending = await (await fetchBill(request("bills/month?month=2026-09", "GET", cookies), env)).json() as typeof month;
		expect(pending.summary[0].dueMinor).toBe(4000);
	});

	it("creates an expense and budget debit atomically, then rejects a duplicate retry", async () => {
		const db = getDb(env);
		const date = "2026-10-02";
		const actionId = "monthly-internet";
		const actionData = { amount: 40, description: "Internet", currency: "USD", paidByUserId: users.user1.id,
			splitPctShares: { [users.user1.id]: 50, [users.user2.id]: 50 } };
		const now = new Date().toISOString();
		await db.insert(scheduledActions).values({ id: actionId, userId: users.user1.id, actionType: "add_expense", frequency: "monthly",
			startDate: date, nextExecutionDate: date, actionData, createdAt: now, updatedAt: now });
		const body = { title: "Internet", amountMinor: 4000, currency: "USD", firstDueDate: date, recurrence: "monthly",
			payerUserId: users.user1.id, splitBasisPoints: { [users.user1.id]: 5000, [users.user2.id]: 5000 }, scheduledActionId: actionId };
		expect((await fetchBill(request("bills", "POST", cookies, body), env)).status).toBe(201);
		const month = await (await fetchBill(request("bills/month?month=2026-10", "GET", cookies), env)).json() as { occurrences: Array<{ id: string; scheduledTransactionId: string | null }> };
		const occurrenceId = month.occurrences[0].id;
		const payment = await fetchBill(request("bills/payment", "POST", cookies, { occurrenceId, paid: true, createExpense: true, budgetId: users.budgetIds.house }), env);
		expect(payment.status).toBe(200);
		const result = await payment.json() as { transactionId: string; budgetEntryId: string };
		expect(result.transactionId).toBe(`tx_${actionId}_${date}`);
		expect((await db.select().from(transactions).where(eq(transactions.transactionId, result.transactionId))).length).toBe(1);
		expect((await db.select().from(budgetEntries).where(eq(budgetEntries.budgetEntryId, result.budgetEntryId)))[0].amount).toBe(-40);
		const action = (await db.select().from(scheduledActions).where(eq(scheduledActions.id, actionId)))[0];
		const scheduledRun = await processExpenseAction(env, action, { groupid: users.testGroupId } as Parameters<typeof processExpenseAction>[2], date);
		expect(scheduledRun.statements).toHaveLength(0);
		expect((await fetchBill(request("bills/payment", "POST", cookies, { occurrenceId, paid: true, createExpense: true, budgetId: users.budgetIds.house }), env)).status).toBe(409);
		await fetchBill(request("bills/payment", "POST", cookies, { occurrenceId, paid: false }), env);
		expect((await fetchBill(request("bills/payment", "POST", cookies, { occurrenceId, paid: true, createExpense: true, budgetId: users.budgetIds.house }), env)).status).toBe(409);
		expect((await db.select().from(budgetEntries).where(eq(budgetEntries.budgetEntryId, result.budgetEntryId))).length).toBe(1);
		expect((await db.select().from(billOccurrences).where(eq(billOccurrences.id, occurrenceId)))[0].linkedTransactionId).toBe(result.transactionId);
	});

	it("finds a prior scheduled expense and links it without creating another", async () => {
		const db = getDb(env);
		const date = "2026-11-03";
		const actionId = "water-schedule";
		const now = new Date().toISOString();
		await db.insert(scheduledActions).values({ id: actionId, userId: users.user1.id, actionType: "add_expense", frequency: "weekly",
			startDate: date, nextExecutionDate: date, actionData: { amount: 25, description: "Water", currency: "USD",
				paidByUserId: users.user1.id, splitPctShares: { [users.user1.id]: 100 } }, createdAt: now, updatedAt: now });
		const action = (await db.select().from(scheduledActions).where(eq(scheduledActions.id, actionId)))[0];
		const run = await processExpenseAction(env, action, { groupid: users.testGroupId } as Parameters<typeof processExpenseAction>[2], date);
		await db.batch([run.statements[0].query, ...run.statements.slice(1).map((statement) => statement.query)]);
		const body = { title: "Water", amountMinor: 2500, currency: "USD", firstDueDate: date, recurrence: "weekly",
			payerUserId: users.user1.id, splitBasisPoints: { [users.user1.id]: 10000 }, scheduledActionId: actionId };
		expect((await fetchBill(request("bills", "POST", cookies, { ...body, amountMinor: 2501 }), env)).status).toBe(400);
		expect((await fetchBill(request("bills", "POST", cookies, body), env)).status).toBe(201);
		const month = await (await fetchBill(request("bills/month?month=2026-11", "GET", cookies), env)).json() as { occurrences: Array<{ id: string; scheduledTransactionId: string | null }> };
		const due = month.occurrences.find((item) => item.scheduledTransactionId);
		expect(due?.scheduledTransactionId).toBe(`tx_${actionId}_${date}`);
		expect((await fetchBill(request("bills/payment", "POST", cookies, { occurrenceId: due?.id, paid: true, createExpense: true }), env)).status).toBe(409);
		expect((await fetchBill(request("bills/payment", "POST", cookies, { occurrenceId: due?.id, paid: true, linkedTransactionId: due?.scheduledTransactionId }), env)).status).toBe(200);
		expect((await db.select().from(transactions).where(eq(transactions.transactionId, `tx_${actionId}_${date}`))).length).toBe(1);
	});
});
