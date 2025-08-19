# Testing Guide

## Overview

Split Expense With Wife employs a comprehensive testing strategy covering unit tests, integration tests, and end-to-end testing across both frontend and backend components.

## Testing Architecture

```
Testing Strategy
├── Frontend Testing
│   ├── Unit Tests (Jest + React Testing Library)
│   ├── Component Tests (React Testing Library)
│   └── E2E Tests (Playwright)
├── Backend Testing
│   ├── Unit Tests (Vitest)
│   ├── Integration Tests (Vitest + D1)
│   └── API Tests (Vitest + Cloudflare Workers)
└── Database Testing
    ├── Migration Tests
    └── Schema Validation
```

## Frontend Testing

### Unit and Component Tests

**Framework**: Jest + React Testing Library + CRACO

#### Running Tests
```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test --watch

# Run tests with coverage
yarn test --coverage

# Run specific test file
yarn test src/components/Button.test.tsx
```

#### Test Structure
```typescript
// Example component test
import { render, screen, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../redux/store';
import ExpenseForm from './ExpenseForm';

describe('ExpenseForm', () => {
    const renderWithProvider = (component: React.ReactElement) => {
        return render(
            <Provider store={store}>
                {component}
            </Provider>
        );
    };

    it('should submit expense form with valid data', () => {
        renderWithProvider(<ExpenseForm />);
        
        fireEvent.change(screen.getByLabelText(/amount/i), {
            target: { value: '25.50' }
        });
        
        fireEvent.change(screen.getByLabelText(/description/i), {
            target: { value: 'Coffee' }
        });
        
        fireEvent.click(screen.getByRole('button', { name: /submit/i }));
        
        expect(screen.getByText(/expense created/i)).toBeInTheDocument();
    });
});
```

#### Testing Utilities
```typescript
// Test utilities for common patterns
export const renderWithRedux = (
    component: React.ReactElement,
    initialState = {}
) => {
    const store = createStore(rootReducer, initialState);
    return {
        ...render(<Provider store={store}>{component}</Provider>),
        store,
    };
};

export const mockApiResponse = (data: any, status = 200) => {
    global.fetch = jest.fn(() =>
        Promise.resolve({
            ok: status < 400,
            status,
            json: () => Promise.resolve(data),
        })
    ) as jest.Mock;
};
```

### End-to-End Tests

**Framework**: Playwright

#### Running E2E Tests
```bash
# Run E2E tests
yarn test:e2e

# Run with browser UI
yarn test:e2e:headed

# Debug E2E tests
yarn test:e2e:debug

# Run specific test file
yarn test:e2e tests/expense-flow.spec.ts
```

#### E2E Test Configuration
```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',
    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
    ],
    webServer: {
        command: 'yarn start',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
    },
});
```

#### E2E Test Examples
```typescript
// Complete user workflow test
import { test, expect } from '@playwright/test';

test.describe('Expense Management Flow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.fill('[data-testid=email]', 'test@example.com');
        await page.fill('[data-testid=pin]', '1234');
        await page.click('[data-testid=login-button]');
        await expect(page).toHaveURL('/dashboard');
    });

    test('should create and view expense', async ({ page }) => {
        // Create expense
        await page.click('[data-testid=add-expense]');
        await page.fill('[data-testid=amount]', '25.50');
        await page.fill('[data-testid=description]', 'Coffee');
        await page.selectOption('[data-testid=currency]', 'USD');
        await page.click('[data-testid=submit-expense]');

        // Verify expense appears in list
        await expect(page.locator('[data-testid=expense-list]')).toContainText('Coffee');
        await expect(page.locator('[data-testid=expense-amount]')).toContainText('$25.50');
    });

    test('should split expense between users', async ({ page }) => {
        await page.click('[data-testid=add-expense]');
        await page.fill('[data-testid=amount]', '100.00');
        await page.fill('[data-testid=description]', 'Groceries');
        
        // Configure split
        await page.fill('[data-testid=user1-percentage]', '60');
        await page.fill('[data-testid=user2-percentage]', '40');
        
        await page.click('[data-testid=submit-expense]');
        
        // Verify split calculation
        await page.goto('/balances');
        await expect(page.locator('[data-testid=balance-user2]')).toContainText('$40.00');
    });
});
```

## Backend Testing

### Unit and Integration Tests

**Framework**: Vitest + Cloudflare Workers Testing Pool

#### Running Backend Tests
```bash
cd cf-worker

# Run all tests
yarn test

# Run tests with coverage
yarn test:coverage

# Run tests in watch mode
yarn test:watch

# Run specific test file
yarn test src/tests/budget.test.ts
```

#### Test Configuration
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        pool: '@cloudflare/vitest-pool-workers',
        poolOptions: {
            workers: {
                wrangler: { configPath: './wrangler.toml' },
            },
        },
        coverage: {
            provider: 'istanbul',
            reporter: ['text', 'json', 'html'],
        },
    },
});
```

#### Database Test Setup
```typescript
// test-utils.ts
import { getDb } from '../db';
import { auth } from '../auth';

export async function setupAndCleanDatabase(env: Env): Promise<void> {
    await setupDatabase(env);
}

export async function completeCleanupDatabase(env: Env): Promise<void> {
    const db = getDb(env);
    // Delete data from all tables in reverse order
    await db.delete(scheduledActionHistory);
    await db.delete(scheduledActions);
    await db.delete(session);
    await db.delete(account);
    await db.delete(verification);
    await db.delete(user);
    await db.delete(budgetTotals);
    await db.delete(userBalances);
    await db.delete(transactionUsers);
    await db.delete(transactions);
    await db.delete(budgetEntries);
    await db.delete(groups);
}

export async function createTestUserData(env: Env) {
    const authInstance = auth(env);
    const testGroupId = ulid();
    
    const user1 = await authInstance.api.signUpEmail({
        body: {
            email: generateEmail(),
            password: 'testpass',
            firstName: 'Test1',
            lastName: 'User',
            groupid: testGroupId,
        } as any,
    });

    return { user1, testGroupId };
}
```

#### API Endpoint Tests
```typescript
// budget.test.ts
import { env as testEnv } from 'cloudflare:test';
import { handleBudget } from '../handlers/budget';
import { createTestRequest, setupAndCleanDatabase } from './test-utils';

describe('Budget Handlers', () => {
    beforeEach(async () => {
        await setupAndCleanDatabase(testEnv);
    });

    describe('handleBudget', () => {
        it('should create budget entry successfully', async () => {
            const { user1, testGroupId } = await createTestUserData(testEnv);
            const cookies = await signInAndGetCookies(testEnv, user1.email, 'testpass');

            const request = createTestRequest('budget', 'POST', {
                amount: 25.50,
                description: 'Coffee',
                name: 'food',
                currency: 'USD',
                groupid: testGroupId
            }, cookies);

            const response = await handleBudget(request, testEnv);
            
            expect(response.status).toBe(200);
            
            const data = await response.json();
            expect(data.message).toBe('Budget entry created successfully');
        });

        it('should return 401 if not authorized for budget', async () => {
            const request = createTestRequest('budget', 'POST', {
                amount: 25.50,
                description: 'Coffee',
                name: 'unauthorized_budget',
                currency: 'USD',
                groupid: 'test-group'
            });

            const response = await handleBudget(request, testEnv);
            expect(response.status).toBe(401);
        });
    });
});
```

#### Database Operation Tests
```typescript
// database.test.ts
describe('Database Operations', () => {
    it('should handle complex balance calculations', async () => {
        const { user1, user2, testGroupId } = await createTestUserData(testEnv);
        const db = getDb(testEnv);

        // Create multiple transactions
        await createTransaction(db, {
            amount: 100,
            paidBy: user1.id,
            splitBetween: [user1.id, user2.id],
            percentages: { [user1.id]: 60, [user2.id]: 40 }
        });

        await createTransaction(db, {
            amount: 50,
            paidBy: user2.id,
            splitBetween: [user1.id, user2.id],
            percentages: { [user1.id]: 50, [user2.id]: 50 }
        });

        // Verify balance calculation
        const balances = await calculateUserBalances(db, testGroupId);
        expect(balances[user2.id]).toBe(-15); // user2 owes user1 $15
    });
});
```

### Workflow Testing

#### Scheduled Actions Testing
```typescript
// scheduled-actions-workflow.test.ts
describe('Scheduled Actions Workflows', () => {
    it('should execute scheduled expense creation', async () => {
        const mockWorkflowInstance = {
            id: 'mock-workflow-id',
            status: vi.fn().mockResolvedValue({ status: 'complete' }),
            result: vi.fn().mockResolvedValue({
                success: true,
                resultData: { type: 'expense_created', transactionId: 'test-tx' },
            }),
        };

        testEnv.ORCHESTRATOR_WORKFLOW = {
            create: vi.fn().mockResolvedValue(mockWorkflowInstance),
            get: vi.fn().mockResolvedValue(mockWorkflowInstance),
        };

        const expenseData: AddExpenseActionData = {
            amount: 50,
            description: 'Weekly groceries',
            currency: 'USD',
            paidByUserId: testUserId,
            splitPctShares: { [testUserId]: 60, [otherUserId]: 40 },
        };

        const result = await createSplitTransactionStatements(
            expenseData,
            testGroupId,
            db,
            testEnv,
            'tx_test_123'
        );

        expect(result.statements).toHaveLength(3); // Transaction + splits + balance updates
        expect(result.resultData.transactionId).toBe('tx_test_123');
    });
});
```

## Test Data Management

### Mock Data Generation
```typescript
// Generate realistic test data
export const generateTestTransaction = (overrides: Partial<Transaction> = {}) => ({
    transaction_id: `tx_${ulid()}`,
    description: 'Test transaction',
    amount: 25.50,
    currency: 'USD',
    group_id: 'test-group',
    created_at: new Date().toISOString(),
    ...overrides,
});

export const generateTestUser = (overrides: Partial<User> = {}) => ({
    id: ulid(),
    firstName: 'Test',
    lastName: 'User',
    email: `test${Math.random()}@example.com`,
    groupid: 'test-group',
    ...overrides,
});
```

### Database Fixtures
```typescript
// Create consistent test scenarios
export const createExpenseScenario = async (db: DbInstance) => {
    const users = await createTestUsers(2);
    const group = await createTestGroup(users);
    
    const transactions = [
        await createTransaction({ amount: 100, paidBy: users[0].id }),
        await createTransaction({ amount: 50, paidBy: users[1].id }),
    ];

    return { users, group, transactions };
};
```

## Testing Best Practices

### Frontend Testing

#### Component Testing
- **Isolated Testing**: Test components in isolation with mocked dependencies
- **User Interaction**: Focus on user interactions rather than implementation details
- **Accessibility**: Include accessibility testing with screen readers
- **Error States**: Test error boundaries and error handling

#### State Management Testing
```typescript
// Redux testing
import { configureStore } from '@reduxjs/toolkit';
import rootReducer from '../redux/rootReducer';

const createMockStore = (initialState = {}) => {
    return configureStore({
        reducer: rootReducer,
        preloadedState: initialState,
    });
};

describe('Expense Redux', () => {
    it('should add expense to state', () => {
        const store = createMockStore();
        
        store.dispatch(addExpense({
            id: '1',
            amount: 25.50,
            description: 'Coffee'
        }));

        const state = store.getState();
        expect(state.expenses.items).toHaveLength(1);
        expect(state.expenses.items[0].amount).toBe(25.50);
    });
});
```

### Backend Testing

#### API Testing
- **Complete Request Cycle**: Test full request/response cycle
- **Authentication**: Test both authenticated and unauthenticated scenarios
- **Authorization**: Verify proper access control
- **Input Validation**: Test edge cases and invalid inputs
- **Error Handling**: Test error responses and status codes

#### Database Testing
- **Isolation**: Each test should have a clean database state
- **Transactions**: Test database transactions and rollbacks
- **Constraints**: Test foreign key constraints and data integrity
- **Performance**: Test query performance with realistic data volumes

### Integration Testing

#### API Integration
```typescript
// Test complete API workflows
describe('Expense Creation Workflow', () => {
    it('should create expense and update balances', async () => {
        // 1. Create expense
        const expenseResponse = await createExpense({
            amount: 100,
            description: 'Groceries',
            splitPctShares: { user1: 60, user2: 40 }
        });

        // 2. Verify expense created
        expect(expenseResponse.status).toBe(200);

        // 3. Check balance updates
        const balancesResponse = await getBalances();
        const balances = await balancesResponse.json();
        expect(balances.user2).toBe(40);

        // 4. Verify transaction history
        const transactionsResponse = await getTransactions();
        const transactions = await transactionsResponse.json();
        expect(transactions.transactions).toHaveLength(1);
    });
});
```

## Continuous Integration

### Test Pipeline

```yaml
# GitHub Actions example
name: Test Suite

on: [push, pull_request]

jobs:
  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'yarn'
      
      - name: Install dependencies
        run: yarn install --immutable
      
      - name: Run frontend tests
        run: yarn test --coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'yarn'
      
      - name: Install dependencies
        run: |
          yarn install --immutable
          cd cf-worker && yarn install --immutable
      
      - name: Run backend tests
        run: cd cf-worker && yarn test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'yarn'
      
      - name: Install dependencies
        run: yarn install --immutable
      
      - name: Install Playwright
        run: npx playwright install
      
      - name: Run E2E tests
        run: yarn test:e2e
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## Coverage Goals

### Target Coverage Metrics
- **Frontend**: 85% line coverage, 80% branch coverage
- **Backend**: 90% line coverage, 85% branch coverage
- **E2E**: Cover all critical user workflows

### Coverage Reports
```bash
# Frontend coverage
yarn test --coverage

# Backend coverage  
cd cf-worker && yarn test:coverage

# View HTML coverage reports
open coverage/lcov-report/index.html
```

## Debugging Tests

### Frontend Test Debugging
```typescript
// Debug React Testing Library queries
import { screen, logRoles } from '@testing-library/react';

test('debug test', () => {
    render(<MyComponent />);
    
    // Log all roles to console
    logRoles(screen.getByTestId('container'));
    
    // Debug current DOM state
    screen.debug();
});
```

### Backend Test Debugging
```typescript
// Debug database state
describe('Debug test', () => {
    it('should debug database state', async () => {
        const db = getDb(testEnv);
        
        // Log current table contents
        const users = await db.select().from(user);
        console.log('Current users:', users);
        
        // Enable verbose logging
        process.env.DEBUG = 'drizzle:*';
    });
});
```

### E2E Test Debugging
```typescript
// Playwright debugging
test('debug e2e test', async ({ page }) => {
    // Pause test execution
    await page.pause();
    
    // Take screenshot
    await page.screenshot({ path: 'debug.png' });
    
    // Enable tracing
    await page.context().tracing.start({ screenshots: true, snapshots: true });
    
    // Your test steps...
    
    await page.context().tracing.stop({ path: 'trace.zip' });
});
```

## Performance Testing

### Load Testing
```typescript
// Example load test for API endpoints
describe('Load Testing', () => {
    it('should handle concurrent requests', async () => {
        const requests = Array.from({ length: 100 }, () =>
            fetch('/api/balances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            })
        );

        const responses = await Promise.all(requests);
        
        expect(responses.every(r => r.ok)).toBe(true);
        expect(responses.every(r => r.status === 200)).toBe(true);
    });
});
```

### Database Performance Testing
```typescript
// Test query performance with large datasets
describe('Performance Tests', () => {
    it('should handle large transaction datasets', async () => {
        // Create 10,000 test transactions
        await createLargeDataset(testEnv, { transactions: 10000 });
        
        const startTime = Date.now();
        const balances = await getBalances(testGroupId);
        const endTime = Date.now();
        
        expect(endTime - startTime).toBeLessThan(1000); // < 1 second
        expect(balances).toBeDefined();
    });
});
```