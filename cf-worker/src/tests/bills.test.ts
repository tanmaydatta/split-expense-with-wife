import { createExecutionContext, env as testEnv } from "cloudflare:test";
import worker from "../index";
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
		const month = await monthResponse.json() as { occurrences: Array<{ id: string }>; summary: Array<{ paidMinor: number; dueMinor: number; plannedMinor: number; plannedOwedByUserMinor: Record<string, number> }> };
		const occurrenceId = month.occurrences[0].id;
		const invalidLink = await fetchBill(request("bills/payment", "POST", cookies, { occurrenceId, paid: true, linkedTransactionId: "other" }), env);
		expect(invalidLink.status).toBe(400);
		expect((await fetchBill(request("bills/payment", "POST", cookies, { occurrenceId, paid: true }), env)).status).toBe(200);
		const paid = await (await fetchBill(request("bills/month?month=2026-09", "GET", cookies), env)).json() as typeof month;
		expect(paid.summary[0].paidMinor).toBe(4000);
		expect(paid.summary[0].dueMinor).toBe(0);
		expect(paid.summary[0].plannedMinor).toBe(4000);
		expect(paid.summary[0].plannedOwedByUserMinor).toEqual({});
		await fetchBill(request("bills/payment", "POST", cookies, { occurrenceId, paid: false }), env);
		const pending = await (await fetchBill(request("bills/month?month=2026-09", "GET", cookies), env)).json() as typeof month;
		expect(pending.summary[0].dueMinor).toBe(4000);
	});
});
