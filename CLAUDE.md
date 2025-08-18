# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Frontend (React App)
- `netlify dev` - Start local development server (recommended for testing)
- `yarn start` - Alternative React development server (port 3000)
- `yarn build` - Build for production
- `yarn test` - Run unit tests with CRACO
- `yarn test:e2e` - Run E2E tests with Playwright
- `yarn test:e2e:headed` - Run E2E tests with browser UI
- `yarn test:e2e:debug` - Debug E2E tests
- `yarn test:all` - Run both unit and E2E tests
- `yarn lint` - TypeScript check and ESLint (fails on warnings)

### Cloudflare Worker Backend
Navigate to `cf-worker/` directory:
- `yarn dev` - Start local worker development
- `yarn test` - Run unit tests with Vitest
- `yarn test:coverage` - Run tests with coverage report
- `yarn deploy:dev` - Deploy to development environment (includes build, tests)
- `yarn deploy:prod` - Deploy to production environment (includes build, tests)
- `yarn lint` - TypeScript check and Biome linting
- `yarn lint:fix` - Auto-fix linting issues with Biome

### Database (Cloudflare D1)
Navigate to `cf-worker/` directory:
- `yarn db:studio` - Open Drizzle Studio for remote DB
- `yarn db:studio:local` - Open Drizzle Studio for local DB
- `yarn db:generate` - Generate migration files
- `yarn db:migrate:local` - Apply migrations to local D1 database
- `yarn db:migrate:dev` - Apply migrations to dev D1 database
- `yarn db:migrate:prod` - Apply migrations to production D1 database

## Architecture Overview

This is a full-stack expense splitting application with the following architecture:

### Frontend
- **Framework**: React 18 with TypeScript
- **State Management**: Redux Toolkit + Redux Persist for app state, React Query for server state
- **Routing**: React Router v6
- **Styling**: Bootstrap + styled-components + custom CSS
- **Authentication**: Better-auth client integration
- **Testing**: Jest/React Testing Library (unit), Playwright (E2E)

### Backend
- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite) with Drizzle ORM
- **Authentication**: Better-auth with PIN-based login
- **Workflows**: Cloudflare Workflows for scheduled actions
- **Testing**: Vitest with Cloudflare Workers testing pool

### Key Architectural Patterns

1. **Monorepo Structure**: Uses Yarn workspaces with three main packages:
   - Root: React frontend
   - `cf-worker/`: Cloudflare Worker backend
   - `shared-types/`: Shared TypeScript types

2. **Type Safety**: Comprehensive shared types in `shared-types/index.ts` ensure consistency between frontend and backend

3. **Authentication Flow**: Uses better-auth for session management with custom PIN-based authentication

4. **API Structure**: RESTful endpoints under `/.netlify/functions/` prefix for compatibility, with CORS handling

5. **Database Schema**: 
   - User management with group-based expense sharing
   - Transaction tracking with detailed split calculations
   - Budget categories and monthly tracking
   - Scheduled actions for recurring expenses/budgets

## Important Development Notes

### Code Quality Rules (from .cursor/rules/)
- Always lint and test after finishing work
- Always write tests when adding/updating logic or features
- Use Biome to format changed files before committing

### Testing Strategy
- Unit tests for components and utilities
- E2E tests cover complete user workflows
- CF Worker tests use Vitest with isolated test database
- All deployments require tests to pass

### Environment Configuration
- Development: `splitexpense-dev` D1 database
- Production: `splitexpense` D1 database  
- Staging URLs supported in CORS configuration
- Better-auth configuration varies by environment

### Key Files to Understand
- `cf-worker/src/index.ts`: Main worker entry point with routing
- `shared-types/index.ts`: Complete type definitions
- `src/redux/store.tsx`: Frontend state management
- `cf-worker/src/db/schema/`: Database schema definitions
- `cf-worker/wrangler.toml`: Worker and D1 configuration

### Deployment Strategy
- Frontend: Auto-deployed to Netlify on main branch
- Backend: Manual deployment via `yarn deploy:dev|prod` commands
- Database migrations: Run separately before deploying code changes
- always use yarn in this project
- do not add created by claude in commit message

### While implementing
- After you complete the plan you work on, update and append detailed descriptions of the changes you made, so following tasks can be easily handed over to other engineers
- After you complete your work, make sure to update docs/ folder. If the folder doesn't exists, create one and document everything present in the code.
- Always run format, tests and lint once you implement the changes.

## Recent Major Changes

### Budget Storage Migration (August 2024) - COMPLETED
**Migration 0010**: Migrated budget categories from JSON storage to normalized `group_budgets` table.

**Changes Made:**
- **Database**: Added new `group_budgets` table with foreign key relationships to `groups` table
- **Migration**: Created `0010_eager_scorpion.sql` with automatic data migration using D1 JSON functions
- **Backend**: Updated `cf-worker/src/utils.ts`, `handlers/group.ts`, `types.ts`, and `scheduled-actions.ts`
- **Compatibility**: Implemented full backward compatibility with graceful fallback to legacy JSON storage
- **Types**: Added new `GroupBudgetData` interface for type safety
- **Testing**: All 174 tests passing with fallback compatibility mechanism

**Benefits:**
- Unique budget IDs enable safe renaming and referential integrity
- Foreign key constraints prevent orphaned data
- Foundation for future budget metadata (descriptions, colors, limits)
- Better query performance with proper indexing
- Normalized data structure eliminates duplicate budget names

**Deployment Status:**
- ✅ Local testing completed successfully
- ✅ Migration tested and validated
- ✅ Backward compatibility verified
- ✅ Documentation updated (`docs/database.md`, `docs/migration-changelog.md`)
- 🔄 Ready for dev environment deployment (`yarn db:migrate:dev && yarn deploy:dev`)

**Files Created/Modified:**
- `cf-worker/src/db/migrations/0010_eager_scorpion.sql` - Migration with data migration
- `cf-worker/src/db/schema/schema.ts` - Added groupBudgets table definition  
- `cf-worker/src/types.ts` - New GroupBudgetData interface
- `cf-worker/src/utils.ts` - Updated budget fetching with fallback logic
- `cf-worker/src/handlers/group.ts` - New budget management functions with fallback
- `cf-worker/src/handlers/scheduled-actions.ts` - Updated for new budget structure
- `docs/database.md` - Updated with new table documentation
- `docs/migration-changelog.md` - New detailed migration documentation
- `docs/README.md` - Added reference to migration changelog

**Rollback Strategy:** Migration can be rolled back by regenerating the `groups.budgets` JSON column from the normalized data.