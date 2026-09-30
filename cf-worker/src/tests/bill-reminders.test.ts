import { createExecutionContext, env as testEnv } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { bills, billOccurrences, billReminders } from "../db/schema/schema";
import { generateBillReminders } from "../utils/bill-reminders";
import worker from "../index";
import { completeCleanupDatabase, createTestUserData, setupAndCleanDatabase, signInAndGetCookies } from "./test-utils";

const env = testEnv as unknown as Env;

describe("in-app bill reminders", () => {
	let users: Awaited<ReturnType<typeof createTestUserData>>;
	beforeAll(async () => { await setupAndCleanDatabase(env); });
	beforeEach(async () => { await completeCleanupDatabase(env); users = await createTestUserData(env); });

	it("creates one upcoming and one overdue reminder per member, safely retryable", async () => {
		const db = getDb(env);
		await db.insert(bills).values({ id: "rent", groupId: users.testGroupId, title: "Rent", amountMinor: 120000,
			currency: "GBP", firstDueDate: "2026-10-02", recurrence: "monthly", payerUserId: users.user1.id,
			splitBasisPoints: { [users.user1.id]: 5000, [users.user2.id]: 5000 }, isActive: true,
			createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" });
		expect(await generateBillReminders(env, "2026-09-29")).toBe(4);
		expect(await generateBillReminders(env, "2026-09-29")).toBe(0);
		let rows = await db.select().from(billReminders);
		expect(rows).toHaveLength(4);
		expect(rows.every((row) => row.kind === "upcoming")).toBe(true);
		const cookies = await signInAndGetCookies(env, users.user1.email, users.user1.password);
		const remindersRequest = () => new Request("https://localhost:8787/.netlify/functions/bills/reminders", { headers: { Cookie: cookies } });
		const initialResponse = await worker.fetch(remindersRequest(), env, createExecutionContext());
		const initial = await initialResponse.json() as Array<{ id: string; readAt: string | null }>;
		expect(initial).toHaveLength(1);
		const read = await worker.fetch(new Request("https://localhost:8787/.netlify/functions/bills/reminders/read", {
			method: "POST", headers: { Cookie: cookies, "Content-Type": "application/json" }, body: JSON.stringify({ id: initial[0].id }),
		}), env, createExecutionContext());
		expect(read.status).toBe(200);
		const afterRead = await (await worker.fetch(remindersRequest(), env, createExecutionContext())).json() as typeof initial;
		expect(afterRead[0].readAt).not.toBeNull();
		expect(await generateBillReminders(env, "2026-10-03")).toBe(4);
		rows = await db.select().from(billReminders);
		expect(rows).toHaveLength(8);
		const occurrence = (await db.select().from(billOccurrences).where(and(eq(billOccurrences.billId, "rent"), eq(billOccurrences.dueDate, "2026-10-02"))))[0];
		await db.update(billOccurrences).set({ paidAt: "2026-10-03T12:00:00Z" }).where(eq(billOccurrences.id, occurrence.id));
		expect(await generateBillReminders(env, "2026-10-04")).toBe(0);
		const afterPaid = await (await worker.fetch(remindersRequest(), env, createExecutionContext())).json() as typeof initial;
		expect(afterPaid).toHaveLength(0);
	});

	it("uses the cadence-specific reminder lead time", async () => {
		const db = getDb(env);
		await db.insert(bills).values({ id: "weekly", groupId: users.testGroupId, title: "Weekly bill", amountMinor: 100,
			currency: "USD", firstDueDate: "2026-10-02", recurrence: "weekly", payerUserId: users.user1.id,
			splitBasisPoints: { [users.user1.id]: 10000 }, isActive: true,
			createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" });
		expect(await generateBillReminders(env, "2026-09-29")).toBe(0);
		expect(await generateBillReminders(env, "2026-10-01")).toBe(4);
	});
});
