/// <reference types="vitest" />
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { handleCron } from "../handlers/cron";
import { setupAndCleanDatabase } from "./test-utils";

describe("Cron Handler", () => {
  beforeEach(async () => {
    await setupAndCleanDatabase(env);
    // Set up environment for cron tests
    env.GROUP_IDS = "1,2";
  });

  it("should add monthly credits to budgets for all groups", async () => {
    // Create test groups with budgets
    await env.DB.exec("INSERT INTO groups (groupid, group_name, budgets, userids, metadata) VALUES (1, 'Group 1', '[\"house\", \"aayushi\"]', '[1]', '{}')");
    await env.DB.exec("INSERT INTO groups (groupid, group_name, budgets, userids, metadata) VALUES (2, 'Group 2', '[\"tanmay\", \"invalid_budget\"]', '[2]', '{}')");

    // Run the cron handler
    await handleCron(env, "monthly");

    // Verify budget entries were created
    const budgetEntries = await env.DB.prepare("SELECT * FROM budget WHERE groupid IN (1, 2) ORDER BY groupid, name")
      .all();

    expect(budgetEntries.results).toHaveLength(3); // house, aayushi, tanmay (invalid_budget should be skipped)
    
    // Check specific entries
    const houseEntry = budgetEntries.results.find((entry: any) => entry.name === "house");
    expect(houseEntry).toBeDefined();
    expect(houseEntry.amount).toBe(800);
    expect(houseEntry.groupid).toBe(1);

    const aayushiEntry = budgetEntries.results.find((entry: any) => entry.name === "aayushi");
    expect(aayushiEntry).toBeDefined();
    expect(aayushiEntry.amount).toBe(133);
    expect(aayushiEntry.groupid).toBe(1);

    const tanmayEntry = budgetEntries.results.find((entry: any) => entry.name === "tanmay");
    expect(tanmayEntry).toBeDefined();
    expect(tanmayEntry.amount).toBe(150);
    expect(tanmayEntry.groupid).toBe(2);
  });
}); 