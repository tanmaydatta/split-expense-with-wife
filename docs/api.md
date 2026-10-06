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

#### GET `/.netlify/functions/scheduled-actions/list`
Get a filtered, sorted, paginated list of scheduled actions for the authenticated group.

**Query parameters:**
```typescript
{
    offset?: number; // default 0
    limit?: number; // default 10, maximum 50
    status?: "all" | "active" | "paused"; // default "all"
    actionType?: "all" | "add_expense" | "add_budget"; // default "all"
    frequency?: "all" | "daily" | "weekly" | "monthly"; // default "all"
    sort?: "recent" | "next_run" | "name"; // default "recent"
}
```

`totalCount` counts matching actions before pagination. `next_run` uses the effective next date shown on each card, including custom future dates and recalculated stale dates. Invalid filter or sort values return 400.

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

## Shared bills API

All routes below require a session and scope data to the current group. Bill
amounts are integer minor units (100 units per major currency unit, except
JPY which has 1). A bill is a plan; the payment endpoint can also create or
link an expense and optionally debit a budget. Due dates are `YYYY-MM-DD` UTC
calendar dates. Bills can be one-time, daily, weekly, or monthly.

| Method | Path | Request | Result |
| --- | --- | --- | --- |
| POST | `/.netlify/functions/bills` | `title`, `amountMinor`, `currency`, `firstDueDate`, `recurrence`, `payerUserId`, `splitBasisPoints`, `scheduledActionId?`, `scheduledBudgetActionId?` | `{ id }` |
| GET | `/.netlify/functions/bills/month?month=YYYY-MM` | Month query | Plans, dated occurrences, and per-currency monthly totals |
| GET | `/.netlify/functions/bills/scheduled-options` | None | Current group's expense and budget actions, including active status, schedule, amount, currency, and Credit/Debit type |
| POST | `/.netlify/functions/bills/update` | `id` and optional plan fields | Updates the plan; paid occurrences keep their historical title and financial snapshot |
| DELETE | `/.netlify/functions/bills/delete` | `{ id }` | Stops future recurrence |
| POST | `/.netlify/functions/bills/payment` | `{ occurrenceId, paid, linkedTransactionId?, createExpense?, budgetId? }` | Records or reverses payment; optional expense and budget changes are atomic |
| GET | `/.netlify/functions/bills/reminders` | None | Current user's in-app reminders |
| POST | `/.netlify/functions/bills/reminders/read` | `{ id }` | Marks own reminder read |

`splitBasisPoints` maps group user IDs to integer shares that sum to 10,000.
For example, `{ "alice": 5000, "bob": 5000 }` is a 50/50 split. The payer and
all split members must belong to the current group. `month` is a valid
`YYYY-MM`. Weekly bills repeat every seven UTC calendar days from the first due
date. Monthly bills due on days 29–31 use the last day in shorter months.
`scheduledActionId` and `scheduledBudgetActionId` must name an expense and
budget action in the group, respectively. Their details can differ from the
bill; the picker shows those differences. When both are selected, the two
actions may have different first dates and frequencies. Each action can link to
one bill. Their generated expense and budget entry are linked only on dates
when both actions run, regardless of which runs first. Existing matching
outputs are paired when the bill is linked. A scheduled budget Credit adds funds;
a Debit subtracts them. Existing outputs appear as `scheduledTransactionId`
and `scheduledBudgetEntryId` on the occurrence when they ran on its due date.
Scheduled actions do not mark the bill paid.
When `createExpense` is true, the expense uses the bill snapshot and `budgetId`
may name an active budget in the same group. A debit requires expense creation.
The API rejects a new expense when a linked scheduled expense runs on that
due date, and rejects a manual budget debit when a linked scheduled budget
action runs on that date. Explicitly linking the scheduled expense is allowed
even if its details differ from the bill; the payment dialog warns about this.
An expense can be linked to only one bill. Marking pending leaves the linked
expense and any budget debit intact; a later payment cannot create them again.
The month response includes `plannedMinor` (all occurrences), `dueMinor`
(unpaid occurrences), `paidMinor`, `sharesByUserMinor` (all planned portions),
and `plannedOwedByUserMinor` (unpaid portions owed to someone other than the
payer), separately for each currency. These are plans, not settled balances.
Rounding remainder goes to the last user ID in sorted order. An optional linked transaction must already
exist in the group and match amount and currency.

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

### Budget and expense list filters

Both `budget_list` and `transactions_list` accept optional `q`, `dateFrom`,
`dateTo` (inclusive UTC `YYYY-MM-DD` dates), `minAmount`, `maxAmount`, `currency`
(three uppercase letters), and `sort` (`newest`, `oldest`, `amount-asc`, or
`amount-desc`; default `newest`). Amount bounds are finite, nonnegative,
inclusive magnitudes of the total entry amount in its original currency. Budget
amounts use their absolute value. Select currency when comparing like amounts;
there is no currency conversion. Search retains description/stringified amount
substring matching. Invalid dates, inverted ranges, enums and offsets return 400.

Budget `direction` is `all`, `credit` (positive stored amount), or `debit`
(negative stored amount). Expenses accept `all`, `owed`, `owe`, or `zero`, using
the authenticated user's net transaction contribution: incoming shares minus
outgoing shares, rounded to the existing two-decimal money display. `zero` means **No net balance** for that expense, not payment or
settlement status. The API ignores client user IDs and always uses its session.
All filters run before pagination; sorting has a stable transaction/entry ID tie
breaker. Budget lifetime totals are independent of list filters.

Budget history includes entries saved in the current UTC second and excludes future entries.

### Bank provider metadata

`GET /bank-import/capabilities` returns authenticated enabled providers (an empty
list when disabled) for navigation; it never returns credentials.
`GET /bank-import/connections` returns only the owner's connections plus enabled
providers and their capabilities. Each connection includes `provider`,
`lastSyncedAt`, and a redacted `lastError` category. `GET /bank-import/accounts`
returns account provenance, provider IDs and availability for that owned
connection. The API never returns stored credentials. Existing Plaid Link and
review routes are preserved; shared routes use the banking registry flag while
Plaid Link itself remains Sandbox-only.

### Lunch Flow Personal API destination

`POST /bank-import/lunch-flow/setup` takes `{apiKey, connectionId?}` for the
authenticated owner. The optional connection ID replaces that owner's key while
retaining account choices. There is one personal destination per owner. Setup
validates the upstream account list before encrypted persistence and imports
no transactions. `GET /bank-import/lunch-flow/preview?connectionId=...&accountId=...`
returns up to ten private posted samples with raw minor-unit amounts.

`POST /bank-import/accounts/select` accepts `amountMultiplier: 1 | -1` for LF.
Selecting requires a verified mapping; values normalize a purchase to positive
minor units. `POST /bank-import/sync` returns actual added/modified/removed row
counts, not counts of repeatedly fetched unchanged data. Reviewed inbox includes
removed source rows and `sourceChanged` warnings. Reviews send numeric `sourceVersion`, the inbox row's monotonic `rowVersion`,
to reject confirmation of an import that changed after it was displayed. Source
updates increment the version; shared expense creation and its import claim use
one atomic batch. Key replacement marks accounts absent from the complete
validated account snapshot unavailable without deleting reviewed history.
