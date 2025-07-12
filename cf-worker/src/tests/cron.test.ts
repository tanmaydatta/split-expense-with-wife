/// <reference types="vitest" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleCron } from '../handlers/cron';
import { Env, D1Database, D1PreparedStatement, Group } from '../types';
import { createMockDb, createMockEnv } from './mocks';

describe('Cron Handler', () => {
  let env: Env;
  let mockDB: D1Database;
  let mockStmt: D1PreparedStatement;

  beforeEach(() => {
    mockDB = createMockDb();
    env = createMockEnv(mockDB);
    mockStmt = mockDB.prepare('' as any);

    env.GROUP_IDS = '1,2';
    vi.clearAllMocks();
  });

  it('should add monthly credits to budgets for all groups', async () => {
    const mockGroup1: Group = { groupid: 1, budgets: '["house", "aayushi"]', userids: '[]', metadata: '{}' };
    const mockGroup2: Group = { groupid: 2, budgets: '["tanmay", "invalid_budget"]', userids: '[]', metadata: '{}' };
    
    (mockStmt.first as any).mockResolvedValueOnce(mockGroup1);
    (mockStmt.first as any).mockResolvedValueOnce(mockGroup2);

    await handleCron(env, 'monthly');

    expect(mockDB.prepare).toHaveBeenCalledTimes(5); // 2 for groups, 3 for budget inserts
    expect(mockStmt.bind).toHaveBeenCalledTimes(5); // 2 for group, 3 for budget inserts
    expect(mockStmt.run).toHaveBeenCalledTimes(3);
  });
}); 