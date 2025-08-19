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
- **Scheduled Actions**: Recurring expenses and budgets

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

### Expense Creation Flow

1. **Frontend**: User submits expense form
2. **Validation**: Zod schema validation on client and server
3. **Authentication**: Session verification
4. **Authorization**: Group membership check
5. **Database**: Transaction insertion with split calculations
6. **Balance Updates**: Materialized view updates
7. **Response**: Success confirmation with transaction ID

### Budget Tracking Flow

1. **Entry Creation**: Budget expense recorded
2. **Categorization**: Assigned to budget category
3. **Aggregation**: Budget totals updated
4. **Historical Data**: Monthly/yearly analysis
5. **Reporting**: Average spending calculations

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