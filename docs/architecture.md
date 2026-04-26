# Architecture Overview

## System Architecture

Split Expense With Wife follows a modern full-stack architecture with clear separation between frontend, backend, and data layers.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                           │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐  │
│  │   React App     │    │ Worker API       │    │Cloudflare D1│  │
│  │   (Frontend)    │◄──►│ (Backend)        │◄──►│ (SQLite)    │  │
│  │   Static Assets │    │                  │    │             │  │
│  └─────────────────┘    └──────────────────┘    └─────────────┘  │
│         │                        │                        │      │
│         │                        │                        │      │
│     ┌───▼────┐              ┌────▼────┐              ┌────▼────┐ │
│     │Netlify │              │Better   │              │Drizzle  │ │
│     │(Local  │              │Auth     │              │ORM      │ │
│     │Testing)│              └─────────┘              └─────────┘ │
│     └────────┘                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Key Architectural Patterns

### 1. Monorepo Structure

The project uses Yarn workspaces with three main packages:

```
split-expense-with-wife/
├── src/                    # React frontend
├── cf-worker/             # Cloudflare Worker backend  
├── shared-types/          # Shared TypeScript types
└── docs/                  # Documentation
```

### 2. Type Safety

- **Shared Types**: `shared-types/index.ts` ensures consistency between frontend and backend
- **Zod Schemas**: Runtime validation with compile-time type safety
- **Drizzle ORM**: Type-safe database operations with auto-generated types

### 3. Authentication Flow

Uses better-auth for session management:
- PIN-based authentication instead of traditional passwords
- Session cookies for stateful authentication
- Group-based access control for expense sharing

### 4. API Design

RESTful endpoints under `/.netlify/functions/` prefix (for compatibility):
- CORS handling for cross-origin requests
- Consistent error handling and response formats
- Request/response validation with Zod schemas

### 5. Database Design

**Core Entities:**
- **Users**: Authentication and profile data
- **Groups**: Expense sharing groups (typically couples)
- **Transactions**: Individual expense records
- **Transaction Users**: Split details for each expense
- **Budget Entries**: Budget tracking and categorization
- **Expense Budget Links**: M:N junction between transactions and budget entries (see below)
- **Scheduled Actions**: Recurring expenses and budgets

**Link as a First-Class Concept:**

The `expense_budget_links` junction table allows one-to-many in either direction (one transaction linked to many budget entries, or one budget entry linked to many transactions) without any schema change. Currently the dashboard creates 1:1 links — one atomic call to `/dashboard_submit` creates exactly one expense, one budget entry, and one link row — but the data model is M:N-capable by design.

Cascade soft-deletes are application-layer, not FK triggers: when a transaction or budget entry is deleted, the handler explicitly soft-deletes the linked sibling(s) in the same `db.batch()`. The junction row itself is never deleted (no `deleted` column), so the historical relationship is always preserved. Active links are resolved by filtering on the entity's own `deleted IS NULL`.

**Materialized Views:**
- **User Balances**: Pre-calculated debt between users
- **Budget Totals**: Aggregated spending by category

## Frontend Architecture

### State Management

**Redux Toolkit + Redux Persist:**
- Authentication state (user session)
- Group metadata and preferences
- UI state management

**React Query (TanStack Query):**
- Server state management
- Caching and synchronization
- Optimistic updates

### Component Structure

```
src/
├── components/           # Reusable UI components
├── pages/               # Route-level components  
├── redux/               # State management
├── services/            # API service layer
├── hooks/               # Custom React hooks
└── utils/               # Utility functions
```

### Styling

- **Bootstrap**: Base UI framework
- **styled-components**: Component-specific styling
- **Custom CSS**: Application-specific styles

## Backend Architecture

### Cloudflare Workers

**Handler Pattern:**
```typescript
// cf-worker/src/handlers/
├── auth.ts              # Authentication endpoints
├── budget.ts            # Budget management
├── transactions.ts      # Expense tracking
├── scheduled-actions.ts # Recurring actions
└── group.ts            # Group management
```

**Middleware:**
- Authentication validation
- CORS handling
- Request/response formatting
- Error handling

### Database Layer

**Drizzle ORM:**
- Type-safe queries
- Migration management
- Schema definitions
- Connection pooling

**Migration Strategy:**
- Incremental schema changes
- Environment-specific migrations
- Rollback capability

### Scheduled Processing

**Cloudflare Workflows:**
- Daily cron triggers
- Orchestrated task execution
- Error handling and retries
- Execution history tracking

## Data Flow

### Dashboard Submit Flow (Expense + Budget + Link)

1. **Frontend**: User submits Dashboard form with expense and/or budget fields checked
2. **Validation**: Client-side form validation (amounts, percentages, currency match)
3. **API Call**: Single `POST /dashboard_submit` — no separate calls for expense and budget
4. **Authentication**: Session verification
5. **Authorization**: Group membership + budget ownership check
6. **Database**: All inserts run atomically in `db.batch()`:
   - Expense: `transactions` + `transaction_users` + `user_balances` upsert
   - Budget: `budget_entries` + `budget_totals` upsert
   - Link: `expense_budget_links` (only when both sides are present)
7. **Response**: `{ message, transactionId?, budgetEntryId?, linkId? }`
8. **Cache Invalidation**: `["transactions"]`, `["balances"]`, `["budget"]`

### Budget Tracking Flow

1. **Entry Creation**: Budget expense recorded (via `/dashboard_submit` or `/budget`)
2. **Categorization**: Assigned to budget category
3. **Aggregation**: Budget totals updated (materialized via `budget_totals`)
4. **Historical Data**: Monthly/yearly analysis
5. **Reporting**: Average spending calculations
6. **Linked View**: If created via `/dashboard_submit` alongside an expense, the entry carries a link to the originating transaction; users can cross-navigate between the two detail pages

## Security Considerations

### Authentication Security

- Session-based authentication with secure cookies
- PIN-based login (no password storage)
- Session expiration and renewal
- CSRF protection

### Data Access Control

- Group-based authorization
- User isolation within groups
- SQL injection prevention with parameterized queries
- Input validation and sanitization

### Infrastructure Security

- HTTPS-only communication
- Environment variable management
- Database connection security
- CORS policy enforcement

## Performance Optimizations

### Frontend

- Code splitting with React.lazy()
- Memoization with React.memo and useMemo
- Optimistic updates for better UX
- Image optimization and lazy loading

### Backend

- Database indexing strategy
- Materialized views for complex queries
- Connection pooling
- Caching headers for static responses

### Database

- Strategic indexing on query patterns
- Materialized views for expensive calculations
- Efficient pagination
- Query optimization

## Scalability Considerations

### Horizontal Scaling

- Stateless backend design
- Database connection pooling
- CDN for static assets
- Serverless auto-scaling

### Vertical Scaling

- Database optimization
- Query performance tuning
- Memory usage optimization
- CPU-intensive task optimization

## Technology Choices

### Why Cloudflare Workers?

- Edge computing for low latency
- Serverless scaling
- Integrated D1 database
- Cost-effective for small teams

### Why React + Redux?

- Mature ecosystem
- Predictable state management
- Excellent TypeScript support
- Large community and resources

### Why Drizzle ORM?

- Type safety without runtime overhead
- SQL-like syntax
- Excellent migration support
- Modern TypeScript-first design