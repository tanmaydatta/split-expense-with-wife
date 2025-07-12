/// <reference types="vitest" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  handleSplit,
  handleSplitNew,
  handleSplitDelete,
  handleTransactionsList
} from '../handlers/split';
import { CFRequest, Env, D1Database, D1PreparedStatement, CurrentSession } from '../types';
import * as utils from '../utils';
import { createMockDb, createMockEnv, createMockRequest } from './mocks';

vi.mock('../utils', async () => {
    const originalUtils = await vi.importActual('../utils');
    return {
      ...originalUtils,
      authenticate: vi.fn(),
      isValidPin: vi.fn(() => true),
      validateSplitPercentages: vi.fn(() => true),
      validatePaidAmounts: vi.fn(() => true),
      isValidCurrency: vi.fn(() => true),
      calculateSplitAmounts: vi.fn(() => []),
      executeBatch: vi.fn()
    };
  });

describe('Split Handlers', () => {
  let request: CFRequest;
  let env: Env;
  let mockDB: D1Database;
  let mockStmt: D1PreparedStatement;
  let mockSession: CurrentSession;

  beforeEach(() => {
    mockDB = createMockDb();
    env = createMockEnv(mockDB);
    mockStmt = mockDB.prepare('' as any);

    mockSession = {
        session: { sessionid: 'session-id', username: 'testuser', expiry_time: '' },
        user: { Id: 1, username: 'testuser', FirstName: 'Test', groupid: 1 },
        group: { groupid: 1, budgets: '[]', userids: '[]', metadata: '{}' },
        usersById: {}
      };
    (utils.authenticate as any).mockResolvedValue(mockSession);
    vi.clearAllMocks();
  });

  describe('handleSplit', () => {
    it('should create a split successfully with Splitwise', async () => {
        const mockFetch = vi.fn(() => Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ id: 12345 })
        }));
        vi.stubGlobal('fetch', mockFetch);
        
        request = createMockRequest('POST', '/', {
            amount: 100,
            currency: 'USD',
            description: 'Dinner',
            splitPctShares: {},
            paidByShares: {}
        });

        const response = await handleSplit(request, env);
        expect(response.status).toBe(200);
        const json = await response.json() as any;
        expect(json.message).toBe('Split created successfully');
        expect(json.transactionId).toBe(12345);
    });
  });

  describe('handleSplitDelete', () => {
    it('should delete a split successfully', async () => {
        request = createMockRequest('POST', '/', { id: '123' });
        const response = await handleSplitDelete(request, env);
        expect(response.status).toBe(200);
        const json = await response.json() as any;
        expect(json.message).toBe('Transaction deleted successfully');
        expect(utils.executeBatch).toHaveBeenCalled();
    });
  });

  describe('handleSplitNew', () => {
    it('should create a new split in the database', async () => {
        request = createMockRequest('POST', '/', {
            amount: 100,
            currency: 'USD',
            description: 'Dinner',
            splitPctShares: {},
            paidByShares: {}
        });

        const response = await handleSplitNew(request, env);
        expect(response.status).toBe(200);
        const json = await response.json() as any;
        expect(json.message).toBe('Transaction created successfully');
        expect(utils.executeBatch).toHaveBeenCalled();
    });
  });

  describe('handleTransactionsList', () => {
    it('should return a list of transactions', async () => {
        request = createMockRequest('POST', '/', { offset: 0 });
        const mockTransactions = [{ id: 1, description: 'Transaction 1' }];
        (mockStmt.all as any).mockResolvedValue({ results: mockTransactions });

        const response = await handleTransactionsList(request, env);
        expect(response.status).toBe(200);
        const json = await response.json() as any;
        expect(json.transactions[0].description).toBe('Transaction 1');
    });
  });
}); 