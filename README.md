# Split Expense with Wife

[![E2E Tests](https://github.com/tanmaydatta/split-expense-with-wife/actions/workflows/e2e-tests.yml/badge.svg)](https://github.com/tanmaydatta/split-expense-with-wife/actions/workflows/e2e-tests.yml)
[![CF Worker Tests](https://github.com/tanmaydatta/split-expense-with-wife/actions/workflows/cf-worker-tests.yml/badge.svg)](https://github.com/tanmaydatta/split-expense-with-wife/actions/workflows/cf-worker-tests.yml)

A full-stack expense splitting application built with React, Cloudflare Workers, and D1. This app helps couples manage shared expenses, budgets, and track financial balances.

## 🏗️ Architecture

- **Frontend**: React with TypeScript, Redux for state management
- **Backend**: Cloudflare Workers with Hono framework
- **Database**: Cloudflare D1 (SQLite)
- **Deployment**: Cloudflare Workers (React static assets and API)
- **Legacy Services**: Netlify Functions (Go) remain in the repository

## 🚀 Features

- **Expense Tracking**: Add, edit, and delete shared expenses
- **Budget Management**: Set and monitor monthly budgets
- **Balance Calculation**: Real-time balance tracking between partners
- **Authentication**: Secure PIN-based authentication
- **Responsive Design**: Mobile-friendly interface
- **Bank imports (development only)**: Connect a Plaid Sandbox bank for a separate review workflow. Bank activity does not change shared expenses or balances when connected.
- **Real-time Updates**: Automatic data synchronization

## 📁 Project Structure

```
split-expense-with-wife/
├── src/                    # React frontend application
│   ├── components/         # React components
│   ├── redux/             # Redux store and slices
│   ├── e2e/               # E2E tests with Playwright
│   └── utils/             # Utility functions
├── cf-worker/             # Cloudflare Workers backend
│   ├── src/               # Worker source code
│   ├── tests/             # Unit tests for workers
│   └── wrangler.toml      # Cloudflare configuration
├── netlify/               # Netlify Functions (Go)
│   ├── functions/         # Individual function handlers
│   └── common/            # Shared utilities
└── .github/workflows/     # GitHub Actions CI/CD
```

## 🛠️ Development Setup

### Prerequisites

- Node.js 22+
- npm or yarn
- Cloudflare account (for Workers)

### Frontend Development

```bash
# Install dependencies
npm install

# Start development server
npm start
# or
netlify dev

# Build for production
npm run build
```

### Cloudflare Workers Development

```bash
# Navigate to cf-worker directory
cd cf-worker

# Install dependencies
npm install

# Start local development
npm run dev

# Run tests
npm run test

# Deploy to dev environment
npm run deploy:dev

# Manual production fallback; normal production deployment runs on merge to main
npm run deploy:prod
```

### Environment Variables

Set up the following environment variables in GitHub Secrets/Variables:

- `REACT_APP_API_BASE_URL` - API base URL for the frontend
- `CLOUDFLARE_API_TOKEN` - Cloudflare API token (if needed)
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID (if needed)

## 🧪 Testing

### E2E Tests

```bash
# Install Playwright browsers
npm run test:e2e:install

# Run E2E tests
npm run test:e2e

# Run specific test file
npm run test:e2e src/e2e/tests/budget-management.spec.ts
```

### CF Worker Tests

```bash
cd cf-worker

# Run unit tests
npm run test

# Run tests with coverage
npm run test -- --coverage
```

## 🔄 CI/CD

The project uses GitHub Actions for continuous integration:

- **E2E Tests**: Runs Playwright tests on every push/PR to `e2e-tests` branch
- **CF Worker Tests**: Runs unit tests for Cloudflare Workers on every push/PR to `e2e-tests` branch

Both workflows:
- Run automatically on git commits
- Fail the build if any tests fail
- Upload test results and coverage reports
- Use secure environment variables from GitHub Secrets

## 📦 Deployment

### Frontend and backend (Cloudflare Workers)

Cloudflare Workers Builds automatically deploys merged `main` to the live
`splitexpense` Worker at `https://budget.wastd.dev`; the React build is served
as Worker static assets. The `splitexpense-dev` Worker is separate. See the
[deployment and rollback runbook](docs/deployment.md) before merging a
database-dependent release. Wrangler commands below are manual fallbacks:

```bash
cd cf-worker

# Deploy to development
npm run deploy:dev

# Deploy to production
npm run deploy:prod
```

## 📊 Database

The application uses Cloudflare D1 (SQLite) for data persistence:

- **Development**: `splitexpense-dev` database
- **Production**: `splitexpense` database

Database schema includes tables for:
- Users and authentication
- Expenses and transactions
- Budget categories and limits
- Balance calculations

## 🔒 Security

- PIN-based authentication system
- CORS protection with allowed origins
- Environment-specific configurations
- Secure API token management

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the ISC License.

## 🐛 Issues

If you encounter any issues or have suggestions, please open an issue on GitHub.

---

Built with ❤️ for managing shared expenses efficiently.
