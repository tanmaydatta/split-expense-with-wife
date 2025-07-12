/// <reference types="vitest" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  handleBalances, 
  handleBudget, 
  handleBudgetDelete, 
  handleBudgetList,
  handleBudgetMonthly,
  handleBudgetTotal
} from '../handlers/budget';
import { CFRequest, Env, D1Database, D1PreparedStatement, User, Group, CurrentSession } from '../types';
import * as utils from '../utils';
import { createMockDb, createMockEnv, createMockRequest } from './mocks';

vi.mock('../utils', async () => {
    const originalUtils = await vi.importActual('../utils');
    return {
      ...originalUtils,
      authenticate: vi.fn(),
      isValidPin: vi.fn(() => true),
    };
  });

describe('Budget Handlers', () => {
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
        group: { groupid: 1, budgets: '["house", "food"]', userids: '[1, 2]', metadata: '{}' },
        usersById: {
          1: { Id: 1, username: 'testuser', FirstName: 'Test', groupid: 1 },
          2: { Id: 2, username: 'anotheruser', FirstName: 'Another', groupid: 1 }
        }
      };
    (utils.authenticate as any).mockResolvedValue(mockSession);
    vi.clearAllMocks();
  });

  describe('handleBalances', () => {
    it('should return calculated balances for the user', async () => {
      request = createMockRequest('POST');
      const mockBalances = [
        { user_id: 1, owed_to_user_id: 2, currency: 'USD', amount: 50 },
        { user_id: 2, owed_to_user_id: 1, currency: 'USD', amount: 20 }
      ];
      (mockStmt.all as any).mockResolvedValue({ results: mockBalances });

      const response = await handleBalances(request, env);
      expect(response.status).toBe(200);
      const json = await response.json() as { [key: string]: { [key: string]: number } };
      expect(json.Another.USD).toBe(-30);
    });
  });

  describe('handleBudget', () => {
    it('should create a budget entry successfully', async () => {
        request = createMockRequest('POST', '/', {
            amount: 100,
            description: 'Groceries',
            pin: '1234',
            name: 'house',
            groupid: 1,
            currency: 'USD'
        });
        (mockStmt.run as any).mockResolvedValue({ meta: { changes: 1 } });
        (utils.isAuthorizedForBudget as any) = vi.fn(() => true);
        (utils.isValidCurrency as any) = vi.fn(() => true);


        const response = await handleBudget(request, env);
        expect(response.status).toBe(200);
        const json = await response.json() as { message: string };
        expect(json.message).toBe('Budget entry created successfully');
    });

    it('should return 401 if not authorized for budget', async () => {
        request = createMockRequest('POST', '/', { name: 'unauthorized_budget' });
        (utils.isAuthorizedForBudget as any) = vi.fn(() => false);

        const response = await handleBudget(request, env);
        expect(response.status).toBe(401);
    });
  });

  describe('handleBudgetDelete', () => {
    it('should delete a budget entry successfully', async () => {
      request = createMockRequest('POST', '/', { id: 1, pin: '1234' });
      (mockStmt.run as any).mockResolvedValue({ meta: { changes: 1 } });

      const response = await handleBudgetDelete(request, env);
      expect(response.status).toBe(200);
      const json = await response.json() as { message: string };
      expect(json.message).toBe('Budget entry deleted successfully');
    });
  });

  describe('handleBudgetList', () => {
    it('should return a list of budget entries', async () => {
      request = createMockRequest('POST', '/', { name: 'house', offset: 0 });
      const mockEntries = [{ id: 1, description: 'Groceries' }];
      (mockStmt.all as any).mockResolvedValue({ results: mockEntries });
      (utils.isAuthorizedForBudget as any) = vi.fn(() => true);

      const response = await handleBudgetList(request, env);
      expect(response.status).toBe(200);
      const json = await response.json() as any[];
      expect(json[0].description).toBe('Groceries');
    });
  });

  describe('handleBudgetMonthly', () => {
    it('should return monthly budget totals', async () => {
        request = createMockRequest('POST', '/', { name: 'house' });
        const mockMonthly = [{ month: 7, year: 2024, currency: 'USD', amount: 500 }];
        (mockStmt.all as any).mockResolvedValue({ results: mockMonthly });
        (utils.isAuthorizedForBudget as any) = vi.fn(() => true);

        const response = await handleBudgetMonthly(request, env);
        expect(response.status).toBe(200);
        const json = await response.json() as any[];
        expect(json[0].amounts[0].amount).toBe(500);
    });
  });

  describe('handleBudgetTotal', () => {
    it('should return budget totals', async () => {
        request = createMockRequest('POST', '/', { name: 'house' });
        const mockTotal = [{ currency: 'USD', amount: 1500 }];
        (mockStmt.all as any).mockResolvedValue({ results: mockTotal });
        (utils.isAuthorizedForBudget as any) = vi.fn(() => true);

        const response = await handleBudgetTotal(request, env);
        expect(response.status).toBe(200);
        const json = await response.json() as any[];
        expect(json[0].amount).toBe(1500);
    });
  });
}); 