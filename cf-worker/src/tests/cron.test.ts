/// <reference types="vitest" />
import { env} from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { handleCron } from '../handlers/cron';
import { setupAndCleanDatabase } from './test-utils';
import { TestBudgetListItem } from './types';

describe('Cron Handler', () => {
  beforeEach(async () => {
    await setupAndCleanDatabase(env);
    // Set up environment for cron tests
    env.GROUP_IDS = '1,2';
  });

  it('should add monthly credits to budgets for all groups', async () => {
    // Create test groups with budgets
    await env.DB.exec("INSERT INTO groups (groupid, group_name, budgets, userids, metadata) VALUES (1, 'Group 1', '[\"house\", \"aayushi\"]', '[1]', '{}')");
    await env.DB.exec("INSERT INTO groups (groupid, group_name, budgets, userids, metadata) VALUES (2, 'Group 2', '[\"tanmay\", \"invalid_budget\"]', '[2]', '{}')");

    // Run the cron handler
    await handleCron(env, 'monthly');

    // Verify budget entries were created
    const budgetEntries = await env.DB.prepare('SELECT * FROM budget WHERE groupid IN (1, 2) ORDER BY groupid, name')
      .all();

    expect(budgetEntries.results).toHaveLength(3); // house, aayushi, tanmay (invalid_budget should be skipped)

    // Check specific entries
    const results = budgetEntries.results as TestBudgetListItem[];
    const houseEntry = results.find((entry: TestBudgetListItem) => entry.name === 'house');
    expect(houseEntry).toBeTruthy();
    expect((houseEntry as TestBudgetListItem).amount).toBe(800);
    expect((houseEntry as TestBudgetListItem).groupid).toBe(1);

    const aayushiEntry = results.find((entry: TestBudgetListItem) => entry.name === 'aayushi');
    expect(aayushiEntry).toBeTruthy();
    expect((aayushiEntry as TestBudgetListItem).amount).toBe(133);
    expect((aayushiEntry as TestBudgetListItem).groupid).toBe(1);

    const tanmayEntry = results.find((entry: TestBudgetListItem) => entry.name === 'tanmay');
    expect(tanmayEntry).toBeTruthy();
    expect((tanmayEntry as TestBudgetListItem).amount).toBe(150);
    expect((tanmayEntry as TestBudgetListItem).groupid).toBe(2);
  });
});
