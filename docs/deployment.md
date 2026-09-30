# Deployment Guide

## Overview

Split Expense With Wife uses a **unified deployment strategy** where both frontend and backend are deployed to **Cloudflare Workers**. This provides a single, scalable platform for the entire application.

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                           │
│                                                                 │
│  ┌─────────────────┐    ┌──────────────────┐    ┌─────────────┐ │
│  │   Static Assets │    │ Worker API       │    │Cloudflare D1│ │
│  │   (React Build) │◄──►│ (Backend)        │◄──►│ Database    │ │
│  │                 │    │                  │    │             │ │
│  └─────────────────┘    └──────────────────┘    └─────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Environments

### Local Development
- **Frontend**: `http://localhost:3000` (React dev server)
- **Backend**: `http://localhost:8787` (Cloudflare Worker local)
- **Database**: Local D1 SQLite
- **Testing**: Netlify Dev (compatibility testing only)

### Development Environment
- **URL**: `https://budget-dev.wastd.dev` (custom domain; `https://splitexpense-dev.tanmaydatta.workers.dev` also resolves to the same worker)
- **Database**: `splitexpense-dev` (Cloudflare D1)
- **Purpose**: Testing and staging

### Production Environment
- **URL**: `https://budget.wastd.dev`
- **Live Worker**: `splitexpense` (the top-level Worker, not `splitexpense-prod`)
- **Database**: `splitexpense` (Cloudflare D1)
- **Purpose**: Live application

## Deployment Process

### Automatic deployment and manual fallback

Cloudflare Workers Builds deploys `main` to the live `splitexpense` Worker after a
merge. The `splitexpense-dev` Worker has a separate build. Confirm the
`Workers Builds: splitexpense` check on the merged commit and the active
version before merging the next PR. A green PR build for `splitexpense-dev`
does not prove production deployed.

`./deploy.sh` is a manual fallback, not the normal production release path:

```bash
# Deploy to development
./deploy.sh dev

# Deploy to production manually only when automatic deployment is unavailable
./deploy.sh prod
```

### Manual Deployment Steps

#### 1. Prerequisites Check
```bash
# Ensure all dependencies are installed
yarn install
cd cf-worker && yarn install && cd ..

# Verify Cloudflare authentication
cd cf-worker && npx wrangler whoami
```

#### 2. Frontend Build
```bash
# Build React application for production
REACT_APP_AUTH_BASE_URL=https://budget.wastd.dev REACT_APP_API_BASE_URL=/.netlify/functions yarn build

# Verify build output in /build directory
ls -la build/
```

#### 3. Quality Assurance
```bash
# Lint React application
yarn lint

# Lint Cloudflare Worker
cd cf-worker && yarn lint

# Run backend tests
cd cf-worker && yarn test
```

#### 4. Database Migration
```bash
cd cf-worker

# Apply migrations to target environment
yarn db:migrate:dev   # for development
yarn db:migrate:prod  # for production
```

For shared bills, migration `0021_shared_bills.sql` creates the bill, dated
occurrence, and in-app reminder tables. Apply it before deploying the bill API
and UI. It only adds new tables and indexes; existing expenses and scheduled
actions are not backfilled into bills.
Migration `0022_bill_occurrence_title.sql` adds a historical title snapshot and
backfills existing bill occurrences from their plans. Migration
`0023_bill_scheduled_expenses.sql` adds the optional scheduled expense link;
`0024_bill_scheduled_budget_action.sql` adds the optional scheduled budget
link. Apply all four migrations in order before deploying the updated API.

The shared-bill reminder generator runs alongside scheduled actions in the
existing `0 0 * * *` Cloudflare cron (configured in the Cloudflare dashboard).
Keep that trigger enabled; no second cron is required. Reminder dates use UTC.
Duplicate cron deliveries are safe because each occurrence, member, and notice
type has a unique database key. Inspect Worker logs if reminders stop appearing.

#### 5. Deploy to Cloudflare Workers
```bash
cd cf-worker

# Clean Netlify redirects file
yarn clean:redirects

# Deploy to specific environment
npx wrangler deploy -e dev   # development
npx wrangler deploy -e prod --name splitexpense  # manual production fallback

# Do not run `wrangler deploy -e prod` without `--name splitexpense`:
# it targets the separate `splitexpense-prod` Worker.
```

## Configuration Management

### Environment Variables

Configuration is managed through `cf-worker/wrangler.toml`:

#### Local Development
```toml
[vars]
ALLOWED_ORIGINS = "http://localhost:3000,http://localhost:3001"
BASE_URL = "http://localhost:8787/auth"
AUTH_TRUSTED_ORIGINS = ["http://localhost:8787", "http://localhost:3000"]
LOCAL = true
```

#### Development Environment
```toml
[env.dev.vars]
ALLOWED_ORIGINS = "https://budget-dev.wastd.dev,https://splitexpense-dev.tanmaydatta.workers.dev,https://splitexpense.netlify.app,https://deploy-preview-5--splitexpense.netlify.app,http://localhost:3000,http://localhost:3001"
BASE_URL = "https://budget-dev.wastd.dev/auth"
AUTH_TRUSTED_ORIGINS = ["https://budget-dev.wastd.dev","https://splitexpense-dev.tanmaydatta.workers.dev"]
LOCAL = false
```

#### Production Environment
```toml
[env.prod.vars]
ALLOWED_ORIGINS = "https://budget.wastd.dev,..."
BASE_URL = "https://budget.wastd.dev/auth"
AUTH_TRUSTED_ORIGINS = ["https://budget.wastd.dev", "https://splitexpense.tanmaydatta.workers.dev"]
LOCAL = false
```

### Database Configuration

#### Development Database
```toml
[[env.dev.d1_databases]]
binding = "DB"
database_name = "splitexpense-dev"
database_id = "a721ee7e-a5ee-452d-88d4-ebb97a1f0786"
migrations_dir = "src/db/migrations"
```

#### Production Database
```toml
[[env.prod.d1_databases]]
binding = "DB"
database_name = "splitexpense"
database_id = "56f19864-f964-4c28-b176-001047d58e00"
migrations_dir = "src/db/migrations"
```

### Cloudflare Workflows

Scheduled actions are powered by Cloudflare Workflows:

```toml
# Development Workflows
[[env.dev.workflows]]
binding = "ORCHESTRATOR_WORKFLOW"
class_name = "ScheduledActionsOrchestratorWorkflow"
name = "scheduled-actions-orchestrator-dev"

# Production Workflows
[[env.prod.workflows]]
binding = "ORCHESTRATOR_WORKFLOW"
class_name = "ScheduledActionsOrchestratorWorkflow"
name = "scheduled-actions-orchestrator"
```

## Static Asset Handling

### Asset Configuration

Cloudflare Workers serves the React build as static assets:

```toml
[assets]
directory = "../build"
binding = "ASSETS"
not_found_handling = "single-page-application"
run_worker_first = ["/.netlify/functions/*", "/hello", "/auth/*"]
```

### Asset Optimization

- **SPA Routing**: Handles client-side routing correctly
- **Worker Priority**: API routes processed before static assets
- **Caching**: Automatic edge caching for static files
- **Compression**: Automatic gzip/brotli compression

## Database Migration Strategy

### Migration Workflow

1. Apply and test each migration on dev.
2. Record the production D1 Time Travel bookmark and active Worker version.
3. Apply additive migrations to production before deploying code that needs them.
4. Verify migration status and database health before merging each PR.

### Migration Commands

```bash
cd cf-worker

# Generate new migration
yarn db:generate --name descriptive-migration-name

# Apply to local (testing)
yarn db:migrate:local

# Apply to development
yarn db:migrate:dev

# Apply to production (after thorough testing)
yarn db:migrate:prod

# View migration status
npx wrangler d1 migrations list splitexpense -e prod --remote
```

### Migration Best Practices

- **Bookmark First**: Record the current D1 Time Travel bookmark before each release
- **Test Locally**: Always test migrations locally first
- **Incremental Changes**: Small, focused migrations
- **Zero Downtime**: Design migrations to avoid service interruption

## Monitoring and Observability

### Cloudflare Analytics

Built-in monitoring through Cloudflare dashboard:
- **Request Volume**: Track API usage patterns
- **Error Rates**: Monitor 4xx/5xx responses
- **Performance**: Response time analytics
- **Geographic Distribution**: User location insights

### Application Logs

```toml
[observability.logs]
enabled = true
```

Access logs via:
```bash
# Real-time logs from the live Worker
npx wrangler tail --name splitexpense
```

### Error Tracking

- **Console Logs**: Available in Cloudflare dashboard
- **Error Responses**: Structured error logging
- **Performance Metrics**: Automated by Cloudflare

## Security Considerations

### HTTPS/TLS

- **Automatic HTTPS**: All Cloudflare Workers deployments use HTTPS
- **TLS 1.3**: Latest TLS version by default
- **Certificate Management**: Automatic certificate provisioning

### Environment Isolation

- **Separate Databases**: Development and production use different D1 instances
- **Environment Variables**: Isolated configuration per environment
- **Access Control**: Environment-specific authentication settings

### Secrets Management

```bash
# Set secrets for specific environment
npx wrangler secret put SECRET_NAME -e prod

# List secrets
npx wrangler secret list -e prod
```

## Performance Optimization

### Edge Computing Benefits

- **Global Distribution**: Deployed to Cloudflare's edge network
- **Low Latency**: Requests served from nearest edge location
- **Auto Scaling**: Automatic scaling based on demand
- **Cold Start Optimization**: Minimal cold start times

### Database Performance

- **Connection Pooling**: Handled automatically by D1
- **Query Optimization**: Strategic indexing and materialized views
- **Regional Replication**: D1 handles data replication

### Caching Strategy

- **Static Assets**: Cached at edge with optimal cache headers
- **API Responses**: Conditional caching for appropriate endpoints
- **Database Queries**: Application-level caching for expensive operations

## Shared-bills release and rollback runbook

### Before the first merge

Run these from `cf-worker` with the project-pinned Wrangler. Record the output
and UTC time in the release notes. The live Worker is `splitexpense`; the D1
database is `splitexpense` (`56f19864-f964-4c28-b176-001047d58e00`). The
`-e prod` migration commands select that database. Worker lookup and rollback
commands must name the live Worker explicitly.

```bash
cd cf-worker
yarn wrangler whoami
yarn wrangler deployments status --name splitexpense --json
yarn wrangler d1 time-travel info splitexpense -e prod --json
yarn wrangler d1 migrations list splitexpense -e prod --remote
curl -fsS https://budget.wastd.dev/health
```

Write down the version ID receiving 100% of traffic and the **fresh** D1
bookmark. Use `yarn wrangler versions view VERSION_ID --name splitexpense
--json` to check that the live version's `DB` binding points at the production
database, the health endpoint passes, and the pending list contains exactly
`0021_shared_bills.sql` through `0024_bill_scheduled_budget_action.sql`.
Cloudflare Time Travel bookmarks expire after the plan's retention window;
recapture one immediately before any later restore decision.

Apply migrations before merging the API PR. They add bill tables and columns,
and should leave old code functional. The project-local Wrangler applies
pending migrations in filename order. Confirm each result and then require
an empty pending list before continuing:

```bash
yarn wrangler d1 migrations apply splitexpense -e prod --remote
yarn wrangler d1 migrations list splitexpense -e prod --remote
```

Stop if the applied set differs from `0021`, `0022`, `0023`, `0024`, if D1
reports an error, or if `/health` fails. Do not merge while the schema state
is uncertain.

### Merge and verify one PR at a time

Merge in this order: `#99 → #100 → #102 → #103 → #104`, then the release
runbook PR if still open. Before each merge, confirm the PR is based on
`main`, is mergeable, and all required checks pass. Stacked PR bases can be
retargeted after the preceding merge; a merge into an intermediate feature
branch does **not** release that layer. Use the GitHub stack view to inspect
the chain. After each merge:

1. Wait for the merged commit's **`Workers Builds: splitexpense`** check to
   succeed. A GitHub merge result alone does not mean Cloudflare deployed.
2. Run `yarn wrangler deployments status --name splitexpense --json` from
   `cf-worker`. Confirm the active 100% version changed. Inspect it with
   `yarn wrangler versions view VERSION_ID --name splitexpense --json` to
   confirm the production `DB` binding. Check `https://budget.wastd.dev/health`
   and a read-only login/API page request.
3. Inspect production logs or the Cloudflare deployment dashboard if the
   check fails or the version does not advance. Stop before merging the next
   PR. Do not use `wrangler deploy -e prod` as an automatic-build substitute.

After `#104`, verify login and bills in a browser, the bill API with a
production account, and the configured daily `0 0 * * *` cron on
`splitexpense`. Do not create or modify real bills as a smoke test. A
configured trigger and manual Workflow test do not prove that the next
midnight cron delivery succeeds; inspect its actual logs and reminders later.

### If a deployment fails

Stop merging. Capture the failing deployment ID, active version, build logs,
request errors, and the current D1 bookmark. If a bad new Worker version is
receiving traffic, roll back **Worker code** to the recorded last healthy
version (replace `VERSION_ID` with the exact recorded ID):

```bash
cd cf-worker
yarn wrangler rollback VERSION_ID --name splitexpense --message "Rollback shared-bills release" --yes
yarn wrangler deployments status --name splitexpense --json
curl -fsS https://budget.wastd.dev/health
```

Cloudflare's dashboard path is Workers & Pages → `splitexpense` → Deployments
→ Rollback. Verify the selected version receives 100% of traffic. A Worker
rollback does **not** roll back D1 data or schema, and it can fail if a
connected resource changed. The additive bill migrations are intended to
remain in place when older code is restored. If the old code cannot run with
the migrated schema, investigate and prepare a forward fix; do not improvise
a destructive schema reversal during an incident.

Use D1 Time Travel only for a confirmed data-corruption incident after
identifying every write since the bookmark. A restore **overwrites the live
database and loses intervening writes**, including unrelated users' activity;
it also cancels in-flight queries. It is not the normal rollback for a bad
Worker deploy. Coordinate an outage/write freeze and explicit data-loss
decision before using `yarn wrangler d1 time-travel restore splitexpense -e
prod --bookmark=BOOKMARK`. Record the pre-restore bookmark so the operation
can itself be undone if needed.

Cloudflare references: [Worker rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
and [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

## Plaid Sandbox stack release and rollback

This release is the development-only Sandbox stack `#107 → #108 → #110`.
Production keeps `PLAID_SANDBOX_ENABLED` unset and needs no Plaid secrets. The
production build may include the new routes and hidden UI, but `plaidEnabled`
rejects bank operations while the flag is absent. Do not enable it as part of
this release.

Before merging, from `cf-worker`, record the UTC time, active 100% version of
`splitexpense`, its production `DB` binding, a fresh D1 Time Travel bookmark,
the pending migration list, and a successful `https://budget.wastd.dev/health`
response. Keep the bookmark private. The only pending migrations should be
`0025_plaid_sandbox.sql`, `0026_bank_accounts.sql`, and
`0027_bank_review.sql`. Apply them **before** the first merge, confirm Wrangler
applies them in that numeric order, then require an empty pending list and a
healthy production Worker:

```bash
cd cf-worker
yarn wrangler deployments status --name splitexpense --json
yarn wrangler d1 time-travel info splitexpense -e prod --json
yarn wrangler d1 migrations list splitexpense -e prod --remote
curl -fsS https://budget.wastd.dev/health
yarn wrangler d1 migrations apply splitexpense -e prod --remote
yarn wrangler d1 migrations list splitexpense -e prod --remote
curl -fsS https://budget.wastd.dev/health
```

These migrations add only bank tables and bank-only columns/indexes; the old
Worker ignores them. Stop if the pending set or apply order differs, a
migration errors, or health fails. Do not merge into an uncertain schema.

Merge `#107`, then `#108`, then `#110` into `main`, one at a time. After each
merge, ensure the next PR is based on `main`, wait for **Workers Builds:
splitexpense** on the merged commit, and verify the active production Worker
version changes and still binds production D1. Check health and read-only
login, expenses, budgets, and bills paths before continuing. A green
`splitexpense-dev` build does not prove production deployed. Also confirm the
active production version has no `PLAID_SANDBOX_ENABLED` binding. Do not use a
bank connection or write real app data as a smoke test.

If a deployed layer regresses, stop the remaining merges and roll back Worker
code to the recorded last healthy `splitexpense` version:

```bash
cd cf-worker
yarn wrangler rollback VERSION_ID --name splitexpense --message "Rollback Plaid Sandbox stack" --yes
yarn wrangler deployments status --name splitexpense --json
curl -fsS https://budget.wastd.dev/health
```

Leave the additive D1 tables in place; a Worker rollback does not reverse
migrations. Use D1 Time Travel restore only for confirmed data corruption and
a separate decision about losing intervening live writes.

## CI/CD Integration

Cloudflare Workers Builds deploys `main` automatically to `splitexpense` and
`splitexpense-dev`. The merged `main` commit exposes separate checks for each
Worker; verify the production check and active version. GitHub Actions run
lint, Worker tests, and end-to-end tests, but do not deploy production.
`./deploy.sh` remains a manual fallback.

## Troubleshooting

### Common Deployment Issues

#### Build Failures
```bash
# Clear build cache
rm -rf build/ node_modules/
yarn install
yarn build
```

#### Migration Failures
```bash
# Check migration status
cd cf-worker
npx wrangler d1 migrations list splitexpense-dev -e dev

# Manual migration fix
npx wrangler d1 execute splitexpense-dev -e dev --file=./src/db/migrations/fix.sql
```

#### Worker Deployment Issues
```bash
# Verify authentication
npx wrangler whoami

# Check worker status
npx wrangler deployments status --name splitexpense --json

# View real-time logs
npx wrangler tail --name splitexpense
```

### Debug Mode

```bash
# Local debugging
cd cf-worker
yarn dev --local --debug

# Remote debugging
npx wrangler tail -e dev --debug
```

### Support Resources

- **Cloudflare Workers Docs**: https://developers.cloudflare.com/workers/
- **D1 Database Docs**: https://developers.cloudflare.com/d1/
- **Wrangler CLI Docs**: https://developers.cloudflare.com/workers/wrangler/
- **Community Forum**: https://community.cloudflare.com/
