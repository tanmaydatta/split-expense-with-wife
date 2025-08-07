/// <reference types="vitest" />
import { env } from "cloudflare:test";
// Vitest globals are available through the test environment
import { desc } from "drizzle-orm";
import { getDb } from "../db";
import { budget } from "../db/schema/schema";
import { handleCron } from "../handlers/cron";
import {
	completeCleanupDatabase,
	createTestUserData,
	setupAndCleanDatabase,
} from "./test-utils";
// Types are imported but not used in this test file

describe.skip("Cron handler", () => {
	beforeAll(async () => {
		await setupAndCleanDatabase(env);
	});

	beforeEach(async () => {
		// Clean the database completely before each test
		await completeCleanupDatabase(env);
		await createTestUserData(env);
		// Set up environment for cron tests
		env.GROUP_IDS = "1";
	});

	it("should create monthly budget entries for all groups", async () => {
		await handleCron(env, "monthly");

		// Verify budget entries were created
		const db = getDb(env);
		const budgetEntries = await db
			.select()
			.from(budget)
			.orderBy(desc(budget.addedTime));

		// Check that entries have the right structure
		const entry = budgetEntries[0];
		expect(entry.description).toContain(
			new Date().toLocaleString("default", { month: "long" }),
		);
		expect(entry.currency).toBe("GBP");
		expect(entry.amount).toBe(800); // house credit amount
	});
});
