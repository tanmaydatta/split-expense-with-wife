# API Documentation

## Overview

The Split Expense API is built on Cloudflare Workers and provides RESTful endpoints for expense management, budget tracking, and user authentication.

## Base URLs

- **Development**: `https://budget-dev.wastd.dev` (custom domain; the `https://splitexpense-dev.tanmaydatta.workers.dev` workers.dev URL still resolves to the same worker)
- **Production**: `https://budget.wastd.dev` (custom domain; the `https://splitexpense.tanmaydatta.workers.dev` workers.dev URL also resolves to the same worker)
- **Local**: `http://localhost:8787`

## Authentication

The API uses **better-auth** with session-based authentication:

- **Session Cookies**: Stateful authentication via secure cookies
- **PIN-based Login**: No traditional passwords, uses PIN authentication
- **Group Authorization**: Users can only access data within their group

### Authentication Flow

1. **Sign Up**: `POST /auth/sign-up/email`
2. **Sign In**: `POST /auth/sign-in/email`
3. **Session Management**: Automatic cookie handling
4. **Sign Out**: `POST /auth/sign-out`

## API Endpoints

All endpoints use the `/.netlify/functions/` prefix for compatibility.

### Authentication Endpoints

#### POST `/auth/sign-up/email`
Create a new user account.

**Request Body:**
```typescript
{
    email: string;
    password: string;  // PIN
    name: string;
    firstName: string;
    lastName: string;
    groupid?: string;
}
```

**Response:**
```typescript
{
    user: {
        id: string;
        email: string;
        firstName: string;
        // ... other user fields
    };
    session: {
        token: string;
        expiresAt: Date;
    };
}
```

#### POST `/auth/sign-in/email`
Authenticate existing user.

**Request Body:**
```typescript
{
    email: string;
    password: string;  // PIN
}
```

**Response:** Same as sign-up

#### POST `/auth/sign-out`
End user session.

**Response:**
```typescript
{
    message: "Signed out successfully"
}
```

### Expense Management

#### POST `/.netlify/functions/dashboard_submit`
Atomically create an expense and/or a budget entry, with an automatic link between them when both are present. This is the preferred way to create entries from the Dashboard — it replaces calling `/split_new` and `/budget` separately.

**Request Body (`DashboardSubmitRequest`):**
```typescript
{
    expense?: {
        amount: number;
        description: string;
        paidByShares: Record<string, number>;   // userId -> amount paid
        splitPctShares: Record<string, number>; // userId -> split percentage
        currency: string;
    };
    budget?: {
        amount: number;      // negative for Debit entries
        description: string;
        budgetId: string;
        currency: string;
    };
}
```

At least one of `expense` or `budget` must be present. When both are present, `expense.amount` and `budget.amount` must have equal absolute values and the same currency.

**Response (`DashboardSubmitResponse`):**
```typescript
{
    message: string;
    transactionId?: string;    // set when expense was created
    budgetEntryId?: string;    // set when budget entry was created
    linkId?: string;           // set when both were created (junction row ID)
}
```

**Atomicity:** All inserts (transaction rows, budget entry row, junction row, balance/total materialized-view updates) run in a single `db.batch()`. If any statement fails, none are committed.

#### POST `/.netlify/functions/split_new`
Create a new expense transaction (no budget link). Prefer `/dashboard_submit` when both expense and budget should be created together.

**Request Body:**
```typescript
{
    amount: number;
    description: string;
    paidByShares: Record<string, number>;  // userId -> amount paid
    splitPctShares: Record<string, number>; // userId -> percentage owed
    currency: string;
}
```

**Response:**
```typescript
{
    message: string;
    transactionId: string;
}
```

**Example:**
```json
{
    "amount": 100.00,
    "description": "Grocery shopping",
    "paidByShares": {
        "user1": 100.00
    },
    "splitPctShares": {
        "user1": 50,
        "user2": 50
    },
    "currency": "USD"
}
```

#### POST `/.netlify/functions/split_delete`
Soft-delete an expense transaction. If the transaction has a linked budget entry (via `expense_budget_links`), that budget entry is also soft-deleted in the same atomic batch. The junction row in `expense_budget_links` is preserved (not deleted) — filtering uses the underlying entity's `deleted IS NULL`.

**Request Body:**
```typescript
{
    id: string; // transaction ID
}
```

**Response:**
```typescript
{
    message: string;
}
```

#### POST `/.netlify/functions/transaction_get`
Fetch a single transaction by ID, including its per-user split details and any linked budget entry.

**Request Body:**
```typescript
{
    id: string; // transaction ID
}
```

**Response:**
```typescript
{
    transaction: Transaction;
    transactionUsers: TransactionUser[];
    linkedBudgetEntry?: BudgetEntry;  // present only when a live linked BE exists
}
```

Returns 404 when the transaction does not exist in the caller's group (avoids leaking existence to other groups).

#### POST `/.netlify/functions/transactions_list`
Get paginated list of transactions.

**Request Body:**
```typescript
{
    offset: number;
    q?: string;   // optional substring filter
}
```

**Optional `q` parameter:** Filters results to entries whose `description` contains `q` (case-insensitive) or whose stringified `amount` contains `q`. Trimmed on the server; whitespace-only values are ignored. Max 100 characters — requests exceeding this length return 400. The characters `%`, `_`, and `\` are matched literally (not as SQL wildcards).

**Response:**
```typescript
{
    transactions: Transaction[];             // each entry includes linkedBudgetEntryIds
    transactionDetails: Record<string, TransactionUser[]>;
}
```

Each `Transaction` in the list includes a `linkedBudgetEntryIds: string[]` field listing the IDs of non-deleted linked budget entries. An empty array means no link.

#### POST `/.netlify/functions/balances`
Get current user balances.

**Request Body:** `{}`

**Response:**
```typescript
Record<string, Record<string, number>>
// userName -> { currency -> amount }
```

### Budget Management

#### POST `/.netlify/functions/budget`
Create a budget entry (no expense link). Prefer `/dashboard_submit` when both budget entry and expense should be created together.

**Request Body:**
```typescript
{
    amount: number;      // negative for Debit entries
    description: string;
    budgetId: string;    // budget category ID
    currency: string;
    groupid: string;
}
```

**Response:**
```typescript
{
    message: string;
}
```

#### POST `/.netlify/functions/budget_list`
Get paginated budget entries. Each entry includes a `linkedTransactionIds` field listing the IDs of non-deleted linked transactions.

**Request Body:**
```typescript
{
    budgetId: string;    // budget category ID
    offset: number;
    q?: string;          // optional substring filter
}
```

**Optional `q` parameter:** Filters results to entries whose `description` contains `q` (case-insensitive) or whose stringified `amount` contains `q`. Trimmed on the server; whitespace-only values are ignored. Max 100 characters — requests exceeding this length return 400. The characters `%`, `_`, and `\` are matched literally (not as SQL wildcards).

> **Note:** The `/budget_total` endpoint is not affected by `q` — it always returns totals over all entries.

**Response:**
```typescript
BudgetEntry[]   // each entry includes linkedTransactionIds: string[]
```

#### POST `/.netlify/functions/budget_entry_get`
Fetch a single budget entry by ID, including any linked transaction (with its per-user split details).

**Request Body:**
```typescript
{
    id: string; // budget entry ID
}
```

**Response:**
```typescript
{
    budgetEntry: BudgetEntry;
    linkedTransaction?: Transaction;               // present only when a live linked tx exists
    linkedTransactionUsers?: TransactionUser[];    // present alongside linkedTransaction
}
```

Returns 404 when the budget entry does not exist in the caller's group.

#### POST `/.netlify/functions/budget_delete`
Soft-delete a budget entry. If the entry has a linked transaction (via `expense_budget_links`), that transaction and its `transaction_users` rows are also soft-deleted in the same atomic batch, and the `user_balances` materialized view is updated accordingly. The junction row in `expense_budget_links` is preserved (not deleted).

**Request Body:**
```typescript
{
    id: string; // budget entry ID (string since migration 0015)
}
```

**Response:**
```typescript
{
    message: string;
}
```

#### POST `/.netlify/functions/budget_total`
Get budget totals by category.

**Request Body:**
```typescript
{
    name: string; // Budget category
}
```

**Response:**
```typescript
{
    currency: string;
    amount: number;
}[]
```

#### POST `/.netlify/functions/budget_monthly`
Get monthly budget analysis.

**Request Body:**
```typescript
{
    name: string;
    timeRange?: "6M" | "1Y" | "2Y" | "All";
    currency?: string;
}
```

**Response:**
```typescript
{
    monthlyBudgets: MonthlyBudget[];
    averageMonthlySpend: AverageSpendPeriod[];
    periodAnalyzed: {
        startDate: string;
        endDate: string;
    };
}
```

### Group Management

#### GET `/.netlify/functions/group/details`
Get current user's group information.

**Response:**
```typescript
{
    groupid: string;
    groupName: string;
    budgets: string[];
    metadata: GroupMetadata;
    users: User[];
}
```

#### POST `/.netlify/functions/group/metadata`
Update group settings.

**Request Body:**
```typescript
{
    groupid: string;
    defaultShare?: Record<string, number>;  // userId -> percentage
    defaultCurrency?: string;
    groupName?: string;
    budgets?: string[];
}
```

**Response:**
```typescript
{
    message: string;
    metadata: GroupMetadata;
}
```

### Scheduled Actions

#### POST `/.netlify/functions/scheduled-actions`
Create a scheduled recurring action.

**Request Body:**
```typescript
{
    actionType: "add_expense" | "add_budget";
    frequency: "daily" | "weekly" | "monthly";
    startDate: string; // ISO date
    actionData: AddExpenseActionData | AddBudgetActionData;
}
```

**Action Data Types:**
```typescript
// For recurring expenses
interface AddExpenseActionData {
    amount: number;
    description: string;
    currency: string;
    paidByUserId: string;
    splitPctShares: Record<string, number>;
}

// For recurring budget entries
interface AddBudgetActionData {
    amount: number;
    description: string;
    budgetName: string;
    currency: string;
    type: "Credit" | "Debit";
}
```

**Response:**
```typescript
{
    message: string;
    id: string;
}
```

#### POST `/.netlify/functions/scheduled-actions/list`
Get paginated list of scheduled actions.

**Request Body:**
```typescript
{
    offset?: number;
    limit?: number;
}
```

**Response:**
```typescript
{
    scheduledActions: ScheduledAction[];
    totalCount: number;
    hasMore: boolean;
}
```

#### POST `/.netlify/functions/scheduled-actions/update`
Update a scheduled action.

**Request Body:**
```typescript
{
    id: string;
    isActive?: boolean;
    frequency?: "daily" | "weekly" | "monthly";
    actionData?: AddExpenseActionData | AddBudgetActionData;
    nextExecutionDate?: string;  // ISO date
    skipNext?: boolean;
}
```

**Response:**
```typescript
{
    message: string;
}
```

#### POST `/.netlify/functions/scheduled-actions/delete`
Delete a scheduled action.

**Request Body:**
```typescript
{
    id: string;
}
```

**Response:**
```typescript
{
    message: string;
}
```

#### POST `/.netlify/functions/scheduled-actions/run`
Manually trigger a scheduled action.

**Request Body:**
```typescript
{
    id: string;
}
```

**Response:**
```typescript
{
    message: string;
    workflowInstanceId: string;
}
```

#### POST `/.netlify/functions/scheduled-actions/history`
Get execution history for scheduled actions.

**Request Body:**
```typescript
{
    offset?: number;
    limit?: number;
    scheduledActionId?: string;
    actionType?: "add_expense" | "add_budget";
    executionStatus?: "success" | "failed" | "started";
}
```

**Response:**
```typescript
{
    history: ScheduledActionHistory[];
    totalCount: number;
    hasMore: boolean;
}
```

## TypeScript Types

The API uses shared TypeScript types defined in `shared-types/index.ts`:

### Core Data Types

```typescript
// User and authentication
interface User {
    Id: string;
    FirstName: string;
    LastName?: string;
    groupid: string;
    // ... other fields
}

interface GroupMetadata {
    defaultShare: Record<string, number>;
    defaultCurrency: string;
}

// Transactions
interface Transaction {
    description: string;
    amount: number;
    created_at: string;
    currency: string;
    transaction_id: string;
    group_id: string;
    deleted?: string;
}

interface TransactionUser {
    transaction_id: string;
    user_id: string;
    amount: number;
    owed_to_user_id: string;
    group_id: string;
    currency: string;
    deleted?: string;
}

// Budget
interface BudgetEntry {
    id: number;
    description: string;
    addedTime: string;
    price: string;
    amount: number;
    name: string;
    deleted?: string;
    groupid: string;
    currency: string;
}

// Scheduled Actions
interface ScheduledAction {
    id: string;
    userId: string;
    actionType: "add_expense" | "add_budget";
    frequency: "daily" | "weekly" | "monthly";
    startDate: string;
    isActive: boolean;
    actionData: AddExpenseActionData | AddBudgetActionData;
    lastExecutedAt?: string;
    nextExecutionDate: string;
    createdAt: string;
    updatedAt: string;
}
```

### API Endpoint Types

The `ApiEndpoints` interface provides complete type safety:

```typescript
interface ApiEndpoints {
    "/dashboard_submit": {
        request: DashboardSubmitRequest;
        response: DashboardSubmitResponse;
    };
    "/split_new": {
        request: SplitNewRequest;
        response: { message: string; transactionId: string; };
    };
    "/transaction_get": {
        request: TransactionGetRequest;
        response: TransactionGetResponse;
    };
    "/budget_entry_get": {
        request: BudgetEntryGetRequest;
        response: BudgetEntryGetResponse;
    };
    "/budget": {
        request: BudgetRequest;
        response: { message: string; };
    };
    "/balances": {
        request: {};
        response: Record<string, Record<string, number>>;
    };
    // ... all other endpoints
}
```

## Validation

### Request Validation

All endpoints use **Zod schemas** for runtime validation:

```typescript
// Example validation schema
const CreateScheduledActionSchema = z.object({
    actionType: z.union([z.literal("add_expense"), z.literal("add_budget")]),
    frequency: z.union([z.literal("daily"), z.literal("weekly"), z.literal("monthly")]),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    actionData: z.union([AddExpenseActionSchema, AddBudgetActionSchema]),
});
```

### Currency Support

Supported currencies:
```typescript
const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY", "CHF", "CNY", "SGD"];
```

## Error Handling

### Standard Error Responses

```typescript
interface ErrorResponse {
    error: string;
    statusCode: number;
}
```

### Common HTTP Status Codes

- **200**: Success
- **400**: Bad Request (validation errors)
- **401**: Unauthorized (authentication required)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **405**: Method Not Allowed
- **500**: Internal Server Error

### Error Examples

```json
// Validation Error
{
    "error": "Split percentages must add up to 100%",
    "statusCode": 400
}

// Authentication Error
{
    "error": "Unauthorized",
    "statusCode": 401
}

// Not Found Error
{
    "error": "Budget entry not found",
    "statusCode": 404
}
```

## CORS Configuration

The API supports CORS for the following origins:
- `https://budget.wastd.dev` and `https://splitexpense.tanmaydatta.workers.dev` (production — same worker, two URLs)
- `https://budget-dev.wastd.dev` and `https://splitexpense-dev.tanmaydatta.workers.dev` (development — same worker, two URLs)
- `http://localhost:3000` (local development)
- `http://localhost:3001` (local testing)

## Rate Limiting

Cloudflare Workers provides built-in rate limiting:
- **Authentication endpoints**: 5 requests per minute per IP
- **API endpoints**: 100 requests per minute per authenticated user
- **Public endpoints**: 10 requests per minute per IP

## SDK Usage

### Frontend Integration

```typescript
// Type-safe API client
interface TypedApiClient {
    post<K extends keyof ApiEndpoints>(
        endpoint: K,
        data: ApiEndpoints[K]["request"]
    ): Promise<ApiEndpoints[K]["response"]>;
}

// Usage example
const response = await apiClient.post("/.netlify/functions/split_new", {
    amount: 50.00,
    description: "Lunch",
    paidByShares: { "user1": 50.00 },
    splitPctShares: { "user1": 50, "user2": 50 },
    currency: "USD"
});
```

### Error Handling

```typescript
try {
    const result = await apiClient.post("/.netlify/functions/budget", budgetData);
    console.log(result.message);
} catch (error) {
    if (error.statusCode === 401) {
        // Redirect to login
    } else {
        // Show error message
        console.error(error.error);
    }
}
```

## Testing

### API Testing

The API includes comprehensive test coverage:

```typescript
// Example test
import { createTestRequest, setupAndCleanDatabase } from './test-utils';

describe('Budget API', () => {
    beforeEach(async () => {
        await setupAndCleanDatabase(env);
    });

    it('should create budget entry', async () => {
        const request = createTestRequest('budget', 'POST', {
            amount: 25.50,
            description: 'Coffee',
            name: 'food',
            currency: 'USD',
            groupid: testGroupId
        }, cookies);

        const response = await handleBudget(request, env);
        expect(response.status).toBe(200);
    });
});
```

### Mock Data

Test utilities provide mock data generation:

```typescript
// Create test users and groups
const { user1, user2, testGroupId } = await createTestUserData(env);

// Sign in and get session cookies
const cookies = await signInAndGetCookies(env, user1.email, user1.password);
```

## Test endpoints

These endpoints exist for e2e test infrastructure only.

### `GET /health`

Returns `{ "status": "ok" }`. No auth, no DB. Used by Playwright's `webServer` readiness probe to know when the local cf-worker is up. Always available in every environment.

### `POST /test/seed`

Available **only** when the cf-worker is running with `env.E2E_SEED_SECRET` set. In all deployed environments (dev, prod) this env var is not set, so the route is not registered and any request returns 404 (the same response the cf-worker returns for any unknown path).

Defense-in-depth: even when registered, every request must include the header `X-E2E-Seed-Secret: <value>` matching `env.E2E_SEED_SECRET`. Mismatch returns 404.

Request body: `SeedRequest` (see `shared-types/index.ts`) — declarative description of users, groups, transactions, budget entries to create, plus an optional `authenticate[]` list of user aliases for which to issue session cookies.

Response: `SeedResponse` with `ids` (alias→id maps for each entity type) and `sessions` (alias→cookies for authenticated users).

The handler is atomic: if any phase fails, all earlier inserts are rolled back so the database is left in its pre-request state.

## Performance Considerations

### Caching

- **Session data**: Cached in memory during request
- **Group metadata**: Cached for duration of request
- **Database connections**: Pooled by D1

### Optimization

- **Batch operations**: Use database transactions for related operations
- **Materialized views**: Pre-calculated balances and totals
- **Pagination**: All list endpoints support pagination
- **Selective queries**: Only fetch required fields

### Monitoring

- **Request metrics**: Tracked via Cloudflare Analytics
- **Error rates**: Monitored through Cloudflare Logs
- **Performance**: Database query timing and optimization