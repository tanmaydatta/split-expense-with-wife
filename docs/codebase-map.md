# Codebase Map

Complete reference for navigating the Split Expense codebase. Intended for AI assistants and new developers.

## Directory Structure

```
split-expense-with-wife/
├── src/                          # React frontend
│   ├── AppWrapper.tsx            # Root component: routing, auth, sidebar, layout
│   ├── index.tsx                 # Entry point: React root, Bootstrap import, theme
│   ├── components/               # Reusable UI components
│   │   ├── theme/                # styled-components theme definition
│   │   │   ├── index.ts          # Theme object (colors, fonts, spacing, shadows)
│   │   │   └── GlobalStyles.ts   # Global CSS reset
│   │   ├── Button.tsx            # Primary button with hover/disabled states
│   │   ├── Input.tsx             # Text input with focus styles, mobile zoom prevention
│   │   ├── Select.tsx            # Dropdown select with consistent styling
│   │   ├── Card.tsx              # Shadow container with padding
│   │   ├── Layout.tsx            # Page layout wrapper
│   │   ├── Sidebar.tsx           # Navigation sidebar (fixed desktop, slide-in mobile)
│   │   ├── Loader.tsx            # Spinning animation component
│   │   ├── Table.tsx             # Responsive data table, color-coded amounts
│   │   ├── TransactionCard.tsx   # Mobile card view for transactions
│   │   ├── BudgetCard.tsx        # Budget display component
│   │   ├── MessageContainer.tsx  # Success/error toast notifications
│   │   ├── ConfirmDialog.tsx     # Modal confirmation dialog
│   │   ├── AmountGrid.tsx        # Grid layout for amount display
│   │   ├── ToggleButtonGroup.tsx # Radio button groups
│   │   ├── Icons.tsx             # SVG icon library
│   │   ├── ScheduledActionsManager.tsx  # Complex CRUD form for scheduled actions
│   │   └── ScheduledActionsHistory.tsx  # History list view
│   ├── pages/                    # Route-level page components
│   │   ├── Dashboard.tsx         # Expense creation form + budget update
│   │   ├── Transactions.tsx      # Expense list with infinite scroll
│   │   ├── Balances.tsx          # User balance tracking (multi-currency)
│   │   ├── Budget.tsx            # Budget management + history
│   │   ├── MonthlyBudgetPage.tsx # Recharts-based budget analytics
│   │   ├── ScheduledActions.tsx  # Scheduled actions list
│   │   ├── NewAction.tsx         # Create scheduled action
│   │   ├── ActionHistory.tsx     # Single action execution history
│   │   ├── EditAction.tsx        # Edit scheduled action
│   │   ├── HistoryRunDetails.tsx # Single history run details
│   │   ├── Settings.tsx          # Group settings, user shares, currencies
│   │   ├── Landing.tsx           # Marketing page (unauthenticated)
│   │   ├── Login.tsx             # Login form
│   │   ├── SignUp.tsx            # Sign up form
│   │   └── NotFound.tsx          # 404 page
│   ├── hooks/                    # Custom React hooks (React Query wrappers)
│   │   ├── queryClient.ts        # QueryClient config (retry:2, stale:5m, no refetch on focus)
│   │   ├── useTransactions.ts    # Transaction list, infinite scroll, delete
│   │   ├── useBudget.ts          # Budget total, history, delete, load more
│   │   ├── useDashboard.ts       # Create expense, update budget, combined submit
│   │   ├── useBalances.ts        # Current balances per user/currency
│   │   ├── useMonthlyBudget.ts   # Monthly breakdown with currency filtering
│   │   ├── useGroupDetails.ts    # Group metadata fetch/update/refresh
│   │   └── useScheduledActions.ts # Full CRUD + run now + history
│   ├── redux/                    # Redux Toolkit state management
│   │   ├── store.tsx             # configureStore + redux-persist setup
│   │   └── data.tsx              # Single slice: setData (session), unsetData (logout)
│   ├── utils/                    # Utility functions
│   │   ├── api.ts                # Axios instance, ApiError, TypeSafeApiClient
│   │   ├── authClient.ts         # better-auth client initialization
│   │   ├── auth.ts               # logout(), isAuthenticated()
│   │   ├── currency.ts           # getCurrencySymbol() with overrides
│   │   ├── date.ts               # dateToShortStr(), dateToFullStr()
│   │   └── scroll.ts             # scrollToTop()
│   ├── e2e/                      # Playwright E2E tests
│   │   ├── fixtures/setup.ts     # Test fixtures: authedPage, authedPageWithGroupOf, seed (+ legacy authenticatedPage, mockHelper)
│   │   ├── fixtures/seed-client.ts # Typed wrapper around POST /test/seed
│   │   ├── fixtures/factories.ts # Payload builders with defaults (user/group/transaction/budgetEntry)
│   │   ├── test-utils.ts         # TestHelper, ExpenseTestHelper, etc.
│   │   ├── test-data.ts          # Test users, mock responses, factories (legacy)
│   │   ├── auth.spec.ts          # Login/signup flows
│   │   ├── expense-management.spec.ts
│   │   ├── budget-management.spec.ts
│   │   ├── transactions-balances.spec.ts
│   │   ├── settings-management.spec.ts
│   │   ├── monthly-budget-management.spec.ts
│   │   └── scheduled-actions.spec.ts
│   └── setupTests.ts             # Jest setup (imports jest-dom)
├── cf-worker/                    # Cloudflare Worker backend
│   ├── src/
│   │   ├── index.ts              # Entry point: routing, CORS, auth, static assets
│   │   ├── auth.ts               # better-auth config: PBKDF2, session enrichment
│   │   ├── utils.ts              # Core utilities (see detail below)
│   │   ├── types.ts              # Backend-specific types
│   │   ├── handlers/             # Request handlers
│   │   │   ├── split.ts          # split_new, split_delete, transactions_list
│   │   │   ├── budget.ts         # budget CRUD, totals, monthly, balances
│   │   │   ├── group.ts          # group details, metadata update, budget mgmt
│   │   │   ├── scheduled-actions.ts # Scheduled actions CRUD + run now + history
│   │   │   ├── migration.ts      # relink-data, migrate-passwords (admin only)
│   │   │   ├── hello.ts          # Health check
│   │   │   ├── health.ts         # GET /health (Playwright readiness probe)
│   │   │   └── test-seed.ts      # POST /test/seed (gated, local-only)
│   │   ├── utils/
│   │   │   └── scheduled-action-execution.ts  # Deterministic IDs, transaction/budget creation
│   │   ├── workflows/
│   │   │   ├── scheduled-actions-orchestrator.ts  # Daily cron → batch discovery
│   │   │   └── scheduled-actions-processor.ts     # Batch execution of actions
│   │   ├── db/
│   │   │   ├── index.ts          # getDb(env) → Drizzle instance
│   │   │   ├── schema/
│   │   │   │   ├── schema.ts     # App tables: groups, transactions, budgets, etc.
│   │   │   │   └── auth-schema.ts # better-auth tables: user, session, account
│   │   │   └── migrations/       # 16 SQL migration files (0000-0016)
│   │   └── tests/
│   │       ├── test-utils.ts     # Test setup: createMockRequest, setupDatabase
│   │       ├── hello.test.ts
│   │       ├── auth.test.ts
│   │       ├── split.test.ts
│   │       ├── budget.test.ts
│   │       ├── group.test.ts
│   │       ├── scheduled-actions.test.ts
│   │       ├── scheduled-actions-workflow.test.ts
│   │       ├── force-refresh.test.ts
│   │       └── utils.test.ts
│   ├── wrangler.toml             # Worker config: D1, workflows, assets, envs
│   ├── vitest.config.ts          # Vitest with @cloudflare/vitest-pool-workers
│   ├── biome.json                # Biome linter config
│   └── package.json              # Backend dependencies and scripts
├── shared-types/                 # Shared TypeScript types
│   └── index.ts                  # All types, interfaces, Zod schemas, enums
├── docs/                         # Project documentation
├── CLAUDE.md                     # AI assistant instructions
├── netlify.toml                  # Netlify dev/build config
├── craco.config.js               # CRA webpack overrides (path aliases)
├── playwright.config.ts          # Playwright E2E config
├── .eslintrc.js                  # Frontend ESLint rules
└── package.json                  # Root: workspaces, frontend deps, scripts
```

## Routing Map

### Authenticated Routes
| Path | Component | Purpose |
|------|-----------|---------|
| `/` | Dashboard | Add expense / update budget form |
| `/expenses` | Transactions | Paginated expense list with infinite scroll |
| `/balances` | Balances | Who owes whom, multi-currency |
| `/budget` | Budget | Budget entry management + history |
| `/monthly-budget` | MonthlyBudgetPage | Recharts analytics |
| `/monthly-budget/:budgetName` | MonthlyBudgetPage | Filtered by budget |
| `/settings` | Settings | Group name, user shares, currencies, budgets |
| `/scheduled-actions` | ScheduledActions | List recurring actions |
| `/scheduled-actions/new` | NewAction | Create form |
| `/scheduled-actions/:id` | ActionHistory | Execution history |
| `/scheduled-actions/:id/edit` | EditAction | Edit form |
| `/scheduled-actions/history/run/:historyId` | HistoryRunDetails | Single run details |
| `/logout` | (redirect) | Clear session, redirect to login |

### Unauthenticated Routes
| Path | Component | Purpose |
|------|-----------|---------|
| `/` | Landing | Marketing page |
| `/login` | LoginPage | Username/password login |
| `/signup` | SignUpPage | Registration (disabled in prod) |

## API Endpoint Map

### Backend Route Resolution (`cf-worker/src/index.ts`)
1. `OPTIONS *` → CORS preflight (204)
2. `/auth/sign-up*` → Blocked (404, signup disabled)
3. `/auth/*` → better-auth handler
4. `/.netlify/functions/scheduled-actions/*` → Scheduled action handlers
5. `/.netlify/functions/{endpoint}` → Basic API handlers
6. `GET /hello` → Health check
7. `*` → Static assets (SPA fallback)

### Endpoint Details

| Method | Path | Handler | Auth | Description |
|--------|------|---------|------|-------------|
| POST | `/split_new` | `handleSplitNew` | Full | Create expense with split |
| POST | `/split_delete` | `handleSplitDelete` | Full | Soft-delete transaction |
| POST | `/transactions_list` | `handleTransactionsList` | Full | Paginated list |
| POST | `/budget` | `handleBudget` | Full | Create budget entry |
| DELETE | `/budget_delete` | `handleBudgetDelete` | Full | Soft-delete budget entry |
| GET | `/budget_list` | `handleBudgetList` | Full | Paginated budget history |
| GET | `/budget_monthly` | `handleBudgetMonthly` | Full | Monthly aggregation + averages |
| GET | `/budget_total` | `handleBudgetTotal` | Full | Current totals by currency |
| GET | `/balances` | `handleBalances` | Full | User balance pivot |
| GET | `/group/details` | `handleGroupDetails` | Lite | Group info, budgets, members |
| POST | `/group/metadata` | `handleUpdateGroupMetadata` | Full | Update group settings/budgets |
| POST | `/scheduled-actions` | `handleScheduledActionCreate` | Lite | Create action |
| GET | `/scheduled-actions/list` | `handleScheduledActionList` | Lite | Paginated list |
| PUT/POST | `/scheduled-actions/update` | `handleScheduledActionUpdate` | Lite | Update action |
| DELETE | `/scheduled-actions/delete` | `handleScheduledActionDelete` | Lite | Delete action |
| GET | `/scheduled-actions/history` | `handleScheduledActionHistory` | Lite | Execution log |
| GET | `/scheduled-actions/history/details` | `handleScheduledActionHistoryDetails` | Lite | Single run details |
| POST | `/scheduled-actions/run` | `handleScheduledActionRunNow` | Lite | Trigger immediate |
| GET | `/scheduled-actions/details` | `handleScheduledActionDetails` | Lite | Single action |

**Auth levels:** Full = `withAuth` (loads group+budgets), Lite = `withAuthLite` (current user only)

## State Management Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend State                     │
├─────────────────────┬───────────────────────────────┤
│   Redux Store       │   React Query Cache            │
│   (redux-persist)   │   (TanStack Query)             │
├─────────────────────┼───────────────────────────────┤
│ • Auth session      │ • Transactions (2m stale)      │
│ • User profile      │ • Budget entries (1m stale)    │
│ • Group metadata    │ • Budget totals                │
│ • Available budgets │ • Balances                     │
│ • User shares       │ • Monthly budget data          │
│ • Currencies        │ • Group details                │
│                     │ • Scheduled actions             │
│                     │ • Scheduled action history      │
│ Persisted to        │                                │
│ localStorage        │ In-memory, auto-refetch        │
└─────────────────────┴───────────────────────────────┘
```

## Authentication Flow

```
1. User enters username + password
2. Frontend: authClient.signIn.username()
3. Backend: better-auth validates credentials (PBKDF2-SHA256, 10k iterations)
4. Backend: Creates session, sets HTTP-only cookie
5. Backend: enrichSession() loads group, budgets, users
6. Frontend: Stores session in Redux (persisted to localStorage)
7. Frontend: Axios interceptor attaches cookie via withCredentials:true
8. Subsequent requests: Cookie validated, session enriched per-request
9. 401 response: Global interceptor triggers logout + redirect
```

## Data Flow: Creating an Expense

```
Frontend (Dashboard.tsx)
  ↓ form.handleSubmit() via TanStack Form + Zod validation
  ↓ useDashboardSubmit → useCreateExpense mutation
  ↓ typedApi.post("/split_new", { amount, description, paidByShares, splitPctShares, currency })

Backend (cf-worker/src/index.ts → handlers/split.ts)
  ↓ withAuth(request, env, handler) → validates session, loads group
  ↓ handleSplitNew:
  │  1. Validate split percentages sum to 100% (±0.01)
  │  2. Validate paid amounts sum to total (±0.01)
  │  3. calculateSplitAmounts() → net settlement between users
  │  4. Generate transaction ID (ULID)
  │  5. db.batch([
  │       insert into transactions,
  │       insert into transaction_users (per debt pair),
  │       upsert user_balances (materialized)
  │     ])
  ↓ Return { message, transactionId }

Frontend
  ↓ onSuccess: invalidate ["transactions"], ["balances"] query keys
  ↓ React Query refetches stale data automatically
```

## Scheduled Actions System

```
Daily Cron (midnight UTC)
  ↓ index.ts scheduled() → handleCron()
  ↓ Creates ORCHESTRATOR_WORKFLOW

Orchestrator (workflows/scheduled-actions-orchestrator.ts)
  Step 1: getPendingScheduledActions(where nextExecutionDate <= today, isActive=true)
  Step 2: filterActionsWithoutHistory(deduplicate against today's history)
  Step 3: Batch into groups of 10
  Step 4: For each batch → create PROCESSOR_WORKFLOW

Processor (workflows/scheduled-actions-processor.ts)
  For each action in batch:
    1. Fetch action details from DB
    2. Create history entry (status: "started")
    3. processActionByType:
       - add_expense → createSplitTransactionStatements (deterministic ID: tx_{actionId}_{date})
       - add_budget → createBudgetEntryStatements (deterministic ID: bge_{actionId}_{date})
    4. Execute via db.batch()
    5. Update history (status: "success" or "failed")
    6. Update nextExecutionDate and lastExecutedAt
```

## Database Relationships

```
user ──┬──< session (userId FK, CASCADE delete)
       ├──< account (userId FK, CASCADE delete)
       └──< scheduled_actions (userId FK)
              └──< scheduled_action_history (scheduledActionId FK, CASCADE delete)

groups ──< group_budgets (groupId FK)
   │
   └── userids (JSON array of user.id values)

transactions ──< transaction_users (transactionId, composite PK)

Materialized:
  user_balances (groupId + userId + owedToUserId + currency) → balance
  budget_totals (budgetId + currency) → totalAmount
```

## Key Patterns

### Soft Deletes
All deletable entities use a `deleted` TEXT column (NULL = active, timestamp = deleted). Every query filters `WHERE deleted IS NULL`.

### Deterministic IDs for Scheduled Actions
To prevent duplicate execution: `tx_{actionId}_{YYYY-MM-DD}` for expenses, `bge_{actionId}_{YYYY-MM-DD}` for budgets. If a re-run creates the same ID, it's a no-op.

### Materialized Balance/Total Updates
On every transaction create/delete, `user_balances` is upserted atomically in the same `db.batch()`. Same for `budget_totals` on budget entry create/delete.

### Typed API Client
Frontend uses `TypeSafeApiClient` that maps endpoint strings to request/response types from `shared-types/ApiEndpoints`. Compile-time type checking for all API calls.

### Session Enrichment
Every authenticated request enriches the session with group data, budgets, and user mappings via `enrichSession()`. Two levels: `withAuth` (full) and `withAuthLite` (minimal).

## Environment Configuration

| Setting | Local | Dev | Production |
|---------|-------|-----|------------|
| D1 Database | `splitexpense-dev` (local) | `splitexpense-dev` | `splitexpense` |
| Base URL | `http://localhost:8787` | `splitexpense-dev.tanmaydatta.workers.dev` | `budget.wastd.dev` |
| Frontend | `http://localhost:3000` | Netlify deploy preview | `splitexpense.netlify.app` |
| Workflows | Local names | `*-dev` suffix | `*-prod` suffix |

## CI/CD Pipeline

### GitHub Actions
1. **ci.yml** (push to main, PRs):
   - Lint React: `yarn lint` (tsc + eslint, --max-warnings 0)
   - Lint Worker: `biome lint src/` in cf-worker
   - Test Worker: `vitest run` with TZ=UTC

2. **e2e-tests.yml** (push to main, PRs):
   - Build React app
   - Run Playwright tests sequentially (chromium only)
   - Upload report artifacts on failure (7-day retention)

### Deployment
- **Frontend**: Netlify auto-deploy on main branch push
- **Backend**: Manual `yarn deploy:dev` or `yarn deploy:prod` (runs build + tests first)
- **Database**: Manual `yarn db:migrate:dev|prod` before code deploy
