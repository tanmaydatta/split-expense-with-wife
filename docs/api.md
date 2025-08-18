# API Documentation

## Overview

The Split Expense API is built on Cloudflare Workers and provides RESTful endpoints for expense management, budget tracking, and user authentication.

## Base URLs

- **Development**: `https://splitexpense-dev.tanmaydatta.workers.dev`
- **Production**: `https://splitexpense.tanmaydatta.workers.dev`
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

#### POST `/.netlify/functions/split_new`
Create a new expense transaction.

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
Delete an expense transaction.

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

#### POST `/.netlify/functions/transactions_list`
Get paginated list of transactions.

**Request Body:**
```typescript
{
    offset: number;
}
```

**Response:**
```typescript
{
    transactions: Transaction[];
    transactionDetails: Record<string, TransactionUser[]>;
}
```

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
Create a budget entry.

**Request Body:**
```typescript
{
    amount: number;
    description: string;
    name: string;        // Budget category
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
Get paginated budget entries.

**Request Body:**
```typescript
{
    offset: number;
    name: string;        // Budget category
}
```

**Response:**
```typescript
BudgetEntry[]
```

#### POST `/.netlify/functions/budget_delete`
Delete a budget entry.

**Request Body:**
```typescript
{
    id: number; // Budget entry ID
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
    "/split_new": {
        request: SplitNewRequest;
        response: { message: string; transactionId: string; };
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
- `https://splitexpense.tanmaydatta.workers.dev` (production)
- `https://splitexpense-dev.tanmaydatta.workers.dev` (development)
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