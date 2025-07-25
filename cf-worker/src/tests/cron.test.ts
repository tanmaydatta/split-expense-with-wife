/// <reference types="vitest" />
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { handleCron } from '../handlers/cron';
import { setupAndCleanDatabase, createTestUserData } from './test-utils';
import { BudgetEntry } from '../../../shared-types';

describe('Cron handler', () => {
  beforeEach(async () => {
    await setupAndCleanDatabase(env);
    await createTestUserData(env);
    // Set up environment for cron tests
    env.GROUP_IDS = '1';
  });

  it('should create monthly budget entries for all groups', async () => {
    await handleCron(env, 'monthly');

    // Verify budget entries were created
    const budgetEntries = await env.DB.prepare('SELECT * FROM budget ORDER BY added_time DESC').all();
    expect(budgetEntries.results.length).toBeGreaterThan(0);

    // Check that entries have the right structure
    const entry = budgetEntries.results[0] as BudgetEntry;
    expect(entry.description).toContain(new Date().toLocaleString('default', { month: 'long' }));
    expect(entry.currency).toBe('GBP');
    expect(entry.amount).toBe(800); // house credit amount
  });
});
