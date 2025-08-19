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
- **URL**: `https://splitexpense-dev.tanmaydatta.workers.dev`
- **Database**: `splitexpense-dev` (Cloudflare D1)
- **Purpose**: Testing and staging

### Production Environment
- **URL**: `https://splitexpense.tanmaydatta.workers.dev`
- **Database**: `splitexpense` (Cloudflare D1)
- **Purpose**: Live application

## Deployment Process

### Automated Deployment Script

The project includes a comprehensive deployment script: `./deploy.sh`

```bash
# Deploy to development
./deploy.sh dev

# Deploy to production  
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
# Build React application
yarn build

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

#### 5. Deploy to Cloudflare Workers
```bash
cd cf-worker

# Clean Netlify redirects file
yarn clean:redirects

# Deploy to specific environment
npx wrangler deploy -e dev   # development
npx wrangler deploy -e prod  # production
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
ALLOWED_ORIGINS = "https://splitexpense-dev.tanmaydatta.workers.dev"
BASE_URL = "https://splitexpense-dev.tanmaydatta.workers.dev/auth"
AUTH_TRUSTED_ORIGINS = ["https://splitexpense-dev.tanmaydatta.workers.dev"]
LOCAL = false
```

#### Production Environment
```toml
[env.prod.vars]
ALLOWED_ORIGINS = "https://splitexpense.tanmaydatta.workers.dev"
BASE_URL = "https://splitexpense.tanmaydatta.workers.dev/auth"
AUTH_TRUSTED_ORIGINS = ["https://splitexpense.tanmaydatta.workers.dev"]
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

1. **Development First**: Always migrate dev environment first
2. **Test Migration**: Verify data integrity after migration
3. **Production Migration**: Apply same migration to production
4. **Rollback Plan**: Keep rollback scripts ready

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
npx wrangler d1 migrations list splitexpense-dev -e dev
```

### Migration Best Practices

- **Backup First**: Although D1 handles this, document current state
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
# Real-time logs
npx wrangler tail -e prod

# Specific time range
npx wrangler tail -e prod --since 2024-01-01
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

## Rollback Procedures

### Application Rollback

```bash
# Deploy previous version
cd cf-worker
npx wrangler deploy -e prod --compatibility-date=2024-01-01

# Or rollback via Cloudflare dashboard
# Workers & Pages > splitexpense > Deployments > Rollback
```

### Database Rollback

```bash
# Create rollback migration
yarn db:generate --name rollback-migration-name

# Apply rollback migration
yarn db:migrate:prod
```

### Emergency Procedures

1. **Immediate Issues**: Use Cloudflare dashboard for instant rollback
2. **Database Issues**: Apply emergency rollback migration
3. **Service Down**: Check Cloudflare status and error logs
4. **Data Corruption**: Restore from D1 backups (contact Cloudflare support)

## CI/CD Integration

### GitHub Actions (Optional)

Example workflow for automated deployments:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'yarn'
      
      - name: Install dependencies
        run: yarn install --immutable
      
      - name: Build application
        run: yarn build
      
      - name: Deploy to Cloudflare Workers
        run: |
          cd cf-worker
          yarn install --immutable
          yarn test
          npx wrangler deploy -e prod
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Manual Deployment (Current)

The project currently uses manual deployment via the `deploy.sh` script:

```bash
# Development deployment
./deploy.sh dev

# Production deployment (after thorough testing)
./deploy.sh prod
```

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
npx wrangler deployments list -e prod

# View real-time logs
npx wrangler tail -e prod
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