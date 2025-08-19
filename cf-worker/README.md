# Split Expense Cloudflare Worker

This is a Cloudflare Worker implementation of the split expense application, converting all Netlify functions to run on Cloudflare Workers using TypeScript and Cloudflare D1 database.

## Features

- **Authentication**: Login/logout with session management
- **Budget Management**: Create, list, delete, and track budget entries
- **Transaction Splitting**: Split expenses between users with detailed tracking
- **Splitwise Integration**: Integrate with Splitwise API for external expense tracking
- **Balance Tracking**: Track who owes whom across multiple currencies
- **Monthly Reports**: Generate monthly budget summaries

## API Routes

All API routes maintain the same structure as the original Netlify functions:

- `/.netlify/functions/login` - User authentication
- `/.netlify/functions/logout` - Session cleanup
- `/.netlify/functions/balances` - Get transaction balances
- `/.netlify/functions/budget` - Create budget entries
- `/.netlify/functions/budget_delete` - Delete budget entries
- `/.netlify/functions/budget_list` - List budget entries
- `/.netlify/functions/budget_monthly` - Monthly budget summaries
- `/.netlify/functions/budget_total` - Budget totals by currency
- `/.netlify/functions/split` - Create Splitwise expenses
- `/.netlify/functions/split_new` - Create database-only transaction splits
- `/.netlify/functions/split_delete` - Delete transaction splits
- `/.netlify/functions/transactions_list` - List transactions

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Update `wrangler.toml` with your values:

```toml
[vars]
AUTH_PIN = "your-auth-pin-here"
SPLITWISE_API_KEY = "your-splitwise-api-key-here"

[[d1_databases]]
binding = "DB"
database_name = "split-expense"
database_id = "your-database-id-here"
```

### 3. Set up Cloudflare D1 Database

Create a new D1 database:

```bash
wrangler d1 create split-expense
```

Update the `database_id` in `wrangler.toml` with the ID returned from the command above.

### 4. Create Database Schema

You'll need to create the following tables in your D1 database:

```sql
-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    groupid INTEGER NOT NULL,
    password TEXT NOT NULL
);

-- Sessions table
CREATE TABLE sessions (
    username TEXT NOT NULL,
    sessionid TEXT NOT NULL PRIMARY KEY,
    expiry_time TEXT NOT NULL
);

-- Groups table
CREATE TABLE groups (
    groupid INTEGER PRIMARY KEY,
    budgets TEXT NOT NULL, -- JSON array of budget names
    userids TEXT NOT NULL, -- JSON array of user IDs
    metadata TEXT NOT NULL -- JSON object with group metadata
);

-- Budget entries table
CREATE TABLE budget (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    added_time TEXT NOT NULL,
    price TEXT NOT NULL,
    amount REAL NOT NULL,
    name TEXT NOT NULL,
    deleted TEXT, -- NULL if not deleted
    groupid INTEGER NOT NULL,
    currency TEXT NOT NULL
);

-- Transactions table
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT NOT NULL,
    metadata TEXT NOT NULL, -- JSON object with transaction metadata
    currency TEXT NOT NULL,
    transaction_id TEXT NOT NULL UNIQUE,
    group_id INTEGER NOT NULL,
    deleted TEXT -- NULL if not deleted
);

-- Transaction users table (for split tracking)
CREATE TABLE transaction_users (
    transaction_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    owed_to_user_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    currency TEXT NOT NULL,
    deleted TEXT -- NULL if not deleted
);
```

### 5. Deploy

Deploy to Cloudflare Workers:

```bash
npm run deploy
```

## Development

Run the worker locally:

```bash
npm run dev
```

## Key Features

### Database Operations
- Uses Cloudflare D1 for all database operations
- Implements batch operations instead of transactions as requested
- Soft deletes for data integrity

### Authentication
- Session-based authentication with cookies
- Secure session management with expiration
- Group-based authorization

### Error Handling
- Comprehensive error handling with proper HTTP status codes
- Input validation for all API endpoints
- Detailed error logging

### Currency Support
- Multi-currency support for budgets and transactions
- Currency validation against supported currencies
- Separate tracking per currency

### Split Calculations
- Complex split calculations with percentage-based sharing
- Support for uneven splits and custom amounts
- Automatic balance calculation across users

## Architecture

The worker is structured as follows:

- `src/index.ts` - Main worker entry point with route handling
- `src/types.ts` - TypeScript type definitions
- `src/utils.ts` - Utility functions for authentication, database operations, etc.
- `wrangler.toml` - Cloudflare Worker configuration
- `package.json` - Dependencies and scripts

## Migration from Netlify Functions

This worker maintains API compatibility with the original Netlify functions, so the frontend application should work without changes. The key differences are:

1. **Database**: Uses Cloudflare D1 instead of the original database
2. **Runtime**: Runs on Cloudflare Workers instead of AWS Lambda
3. **Batch Operations**: Uses D1 batch operations instead of database transactions
4. **TypeScript**: Fully typed implementation for better maintainability

## Security Notes

- The `AUTH_PIN` environment variable is used for sensitive operations
- Session cookies are HTTP-only and secure
- All database queries use prepared statements to prevent SQL injection
- Input validation is performed on all endpoints

## Force Refresh Feature

The worker now supports a `forceRefresh` query parameter that can be used to bypass session caching and fetch fresh data from the database. This is useful for ensuring immediate consistency after data updates.

### Usage

Add `?forceRefresh=true` to any API endpoint to force fresh session data:

```bash
# Example: Force refresh group details after budget updates
GET /.netlify/functions/group/details?forceRefresh=true
```

### When to Use

- **After budget updates**: When you delete/update budgets and need to see changes immediately
- **After user changes**: When group membership or user data changes
- **Cache consistency**: When you need guaranteed fresh data from the database

### Technical Details

- Works with all authenticated endpoints that use the `withAuth` middleware
- Uses better-auth's `disableCookieCache: true` option internally
- Serverless-friendly (no in-memory state required)
- Backward compatible - existing API calls work unchanged

### Example Frontend Integration

```javascript
// After successful budget update, get fresh group details
const updateResponse = await fetch('/.netlify/functions/group/metadata', {
  method: 'POST',
  body: JSON.stringify(budgetData)
});

if (updateResponse.ok) {
  // Force refresh to get updated budget data
  const freshData = await fetch('/.netlify/functions/group/details?forceRefresh=true');
  const groupDetails = await freshData.json();
  // UI now shows updated budgets immediately
}
```

## Support

For issues or questions, please refer to the original project documentation or open an issue in the project repository. 