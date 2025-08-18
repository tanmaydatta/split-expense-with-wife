# Development Setup

## Prerequisites

- **Node.js** (v18 or higher)
- **Yarn** (package manager)
- **Git** (version control)
- **Cloudflare Account** (for Workers and D1 database)

## Initial Setup

### 1. Clone Repository

```bash
git clone https://github.com/tanmaydatta/split-expense-with-wife.git
cd split-expense-with-wife
```

### 2. Install Dependencies

```bash
# Install main app dependencies
yarn install

# Install CF Worker dependencies
cd cf-worker
yarn install
cd ..
```

### 3. Environment Configuration

The project uses different environments for development and production, configured through `cf-worker/wrangler.toml`.

## Development Commands

### Frontend (React App)

```bash
# Start local development server with Netlify (for testing only)
netlify dev

# Alternative React development server (port 3000)
yarn start

# Build for production
yarn build

# Run unit tests with CRACO
yarn test

# Run E2E tests with Playwright
yarn test:e2e

# Run E2E tests with browser UI
yarn test:e2e:headed

# Debug E2E tests
yarn test:e2e:debug

# Run both unit and E2E tests
yarn test:all

# TypeScript check and ESLint (fails on warnings)
yarn lint
```

### Cloudflare Worker Backend

Navigate to `cf-worker/` directory:

```bash
cd cf-worker

# Start local worker development
yarn dev

# Run unit tests with Vitest
yarn test

# Run tests with coverage report
yarn test:coverage

# Deploy to development environment (includes build, tests)
yarn deploy:dev

# Deploy to production environment (includes build, tests)
yarn deploy:prod

# TypeScript check and Biome linting
yarn lint

# Auto-fix linting issues with Biome
yarn lint:fix
```

### Database (Cloudflare D1)

Navigate to `cf-worker/` directory:

```bash
cd cf-worker

# Open Drizzle Studio for remote DB
yarn db:studio

# Open Drizzle Studio for local DB
yarn db:studio:local

# Generate migration files
yarn db:generate

# Apply migrations to local D1 database
yarn db:migrate:local

# Apply migrations to dev D1 database
yarn db:migrate:dev

# Apply migrations to production D1 database
yarn db:migrate:prod
```

## Local Development Workflow

### 1. Start Development Environment

```bash
# Terminal 1: Start the CF Worker (backend)
cd cf-worker
yarn dev

# Terminal 2: Start React development server (frontend)
yarn start
```

The development setup provides:
- **Frontend**: http://localhost:3000 (React dev server)
- **Backend**: http://localhost:8787 (Cloudflare Worker)
- **Database**: Local D1 SQLite database

### 2. Database Development

#### Creating Migrations

```bash
cd cf-worker

# 1. Modify schema in src/db/schema/schema.ts
# 2. Generate migration with custom name
yarn db:generate --name your-migration-name

# 3. Apply migration to local database
yarn db:migrate:local
```

#### Database Tools

```bash
# View database in browser interface
yarn db:studio:local

# Inspect current schema
yarn db:introspect
```

### 3. Testing During Development

```bash
# Run backend tests
cd cf-worker
yarn test

# Run frontend tests  
yarn test

# Run E2E tests
yarn test:e2e
```

## Project Structure

```
split-expense-with-wife/
├── src/                    # React frontend source
│   ├── components/         # Reusable UI components
│   ├── pages/             # Route-level pages
│   ├── redux/             # State management
│   └── services/          # API service layer
├── cf-worker/             # Cloudflare Worker backend
│   ├── src/               # Worker source code
│   │   ├── handlers/      # API endpoint handlers
│   │   ├── db/           # Database schema and migrations
│   │   ├── workflows/     # Cloudflare Workflows
│   │   └── tests/        # Backend tests
│   └── wrangler.toml     # Cloudflare configuration
├── shared-types/          # Shared TypeScript types
├── docs/                  # Documentation
├── build/                 # Production build output
└── deploy.sh             # Deployment script
```

## Environment Configuration

### Local Development

- **Database**: Local D1 SQLite
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:8787
- **Authentication**: Local session management

### Development Environment

- **Frontend**: Deployed to Cloudflare Workers
- **Backend**: `splitexpense-dev.tanmaydatta.workers.dev`
- **Database**: Cloudflare D1 (splitexpense-dev)

### Production Environment

- **Frontend**: Deployed to Cloudflare Workers  
- **Backend**: `splitexpense.tanmaydatta.workers.dev`
- **Database**: Cloudflare D1 (splitexpense)

## Code Quality Tools

### Linting and Formatting

- **Frontend**: ESLint + Prettier
- **Backend**: Biome (linting + formatting)
- **TypeScript**: Strict type checking

### Git Hooks

Pre-commit hooks automatically run:
- Biome formatting for changed files
- Linting checks for React app and CF Worker
- Tests for CF Worker

### Testing Strategy

- **Frontend**: Jest + React Testing Library (unit tests)
- **E2E**: Playwright (full user workflows)
- **Backend**: Vitest with Cloudflare Workers testing pool
- **Coverage**: Istanbul coverage reports

## Common Development Tasks

### Adding a New API Endpoint

1. Create handler in `cf-worker/src/handlers/`
2. Add route in `cf-worker/src/index.ts`
3. Define types in `shared-types/index.ts`
4. Add tests in `cf-worker/src/tests/`
5. Update frontend service layer

### Database Schema Changes

1. Modify `cf-worker/src/db/schema/schema.ts`
2. Generate migration: `yarn db:generate --name migration-name`
3. Apply locally: `yarn db:migrate:local`
4. Test changes
5. Commit migration files

### Adding Scheduled Actions

1. Define action data type in `shared-types/index.ts`
2. Add validation schema
3. Implement execution logic in workflows
4. Add tests for new action type
5. Update frontend UI if needed

## Troubleshooting

### Common Issues

**Database Connection Issues:**
```bash
# Reset local database
cd cf-worker
rm -rf .wrangler/state
yarn db:migrate:local
```

**Type Errors:**
```bash
# Rebuild shared types
cd shared-types
yarn build
```

**Worker Not Starting:**
```bash
# Clear wrangler cache
cd cf-worker
npx wrangler dev --persist-to=.wrangler/state
```

### Debug Mode

```bash
# Enable debug logging
cd cf-worker
yarn dev --local --persist-to=.wrangler/state

# Run tests in watch mode
yarn test:watch
```

## IDE Configuration

### VS Code Extensions

Recommended extensions:
- ESLint
- Prettier
- TypeScript Importer
- Drizzle ORM
- Cloudflare Workers

### TypeScript Configuration

The project uses strict TypeScript settings:
- `strict: true`
- `noUncheckedIndexedAccess: true`
- Path mapping for imports