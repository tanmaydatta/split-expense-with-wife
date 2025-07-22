# End-to-End (E2E) Tests

This directory contains comprehensive end-to-end tests for the Split Expense with Wife application using Playwright.

## Overview

The E2E test suite covers all major user workflows and functionality:

- **Authentication Flow**: Login, logout, session management
- **Expense Management**: Adding expenses, splitting costs, form validation
- **Budget Management**: Creating budgets, viewing budget totals, monthly breakdowns
- **Transactions & Balances**: Viewing transaction history, checking balances
- **Navigation**: Sidebar navigation, routing, deep linking

## Project Structure

```
src/e2e/
├── fixtures/
│   ├── setup.ts          # Playwright fixtures and test setup
│   └── test-data.ts       # Mock data and test fixtures
├── tests/
│   ├── auth.spec.ts                    # Authentication tests
│   ├── expense-management.spec.ts      # Expense management tests
│   ├── budget-management.spec.ts       # Budget management tests
│   ├── transactions-balances.spec.ts   # Transaction and balance tests
│   └── navigation.spec.ts              # Navigation and routing tests
├── utils/
│   └── test-utils.ts      # Test helper utilities
└── README.md              # This file
```

## Test Setup

### Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npm run test:e2e:install
```

### Running Tests

#### Basic Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run tests with UI (headed mode)
npm run test:e2e:headed

# Run tests with debug mode
npm run test:e2e:debug

# Open Playwright UI for interactive testing
npm run test:e2e:ui

# View test report
npm run test:e2e:report

# Run all tests (unit + E2E)
npm run test:all
```

#### Specific Test Files

```bash
# Run specific test file
npx playwright test src/e2e/tests/auth.spec.ts

# Run specific test by name
npx playwright test --grep "should successfully login"

# Run expense deletion tests specifically
npx playwright test --grep "deletion"

# Run all expense management tests
npx playwright test src/e2e/tests/expense-management.spec.ts

# Run tests on specific browser
npx playwright test --project=chromium
```

#### Development Mode

```bash
# Run in debug mode with stepping
npm run test:e2e:debug

# Run in headed mode to see browser
npm run test:e2e:headed

# Run with UI for interactive debugging
npm run test:e2e:ui
```

## Test Architecture

### Fixtures

The test suite uses custom Playwright fixtures for setup and dependency injection:

- **`testHelper`**: Basic test helper with page utilities
- **`authenticatedPage`**: Pre-authenticated page for protected routes
- **`mockHelper`**: Page with common API mocks pre-configured

### Test Data

Mock data is centralized in `fixtures/test-data.ts`:

- **Test Users**: Different user scenarios (valid, invalid)
- **Test Expenses**: Various expense types and amounts
- **Test Budgets**: Different budget categories and types
- **Mock API Responses**: Realistic API response data

### Test Utilities

The `TestHelper` class provides utilities for:

- **Authentication**: Login, logout, session management
- **Navigation**: Page navigation, URL verification
- **Form Interactions**: Filling forms, submitting data
- **Data Extraction**: Getting balances, transactions, etc.
- **API Mocking**: Mocking responses and errors
- **Waiting**: Loading states, animations

## Test Categories

### Authentication Tests (`auth.spec.ts`)

- Login form validation
- Successful authentication flow
- Invalid credentials handling
- Session persistence
- Logout functionality
- Authentication error handling

## Expense Deletion Testing

The test suite includes comprehensive coverage for expense deletion functionality:

### Key Features Tested

1. **Basic Deletion**: Successfully deleting expenses and verifying removal
2. **Security**: PIN requirement enforcement for deletion operations
3. **Cross-Platform**: Testing deletion from both mobile and desktop views
4. **Pagination**: Handling deletion of expenses across multiple pages
5. **Balance Integration**: Verifying that balances update correctly after deletion
6. **Multi-Currency**: Testing deletion with various currencies
7. **Batch Operations**: Testing multiple consecutive deletions

### Test Scenarios

- **Single Expense Deletion**: Create → Verify → Delete → Confirm Removal
- **Multiple Expense Deletion**: Create multiple → Delete selectively → Verify state
- **PIN-Protected Deletion**: Ensure PIN is required for deletion operations
- **Viewport Testing**: Delete from both mobile cards and desktop table views
- **Pagination Testing**: Delete expenses that may be on different pages
- **Balance Verification**: Ensure balances recalculate correctly after deletion

### Usage Example

```bash
# Run all expense deletion tests
npx playwright test --grep "deletion"

# Run specific deletion test
npx playwright test --grep "should successfully delete an expense"

# Run with debug mode for deletion tests
npx playwright test --grep "deletion" --debug
```

### Expense Management Tests (`expense-management.spec.ts`)

- Expense form validation
- Adding new expenses
- Split percentage calculations
- Multi-currency support
- **Expense deletion functionality**
- **PIN-based deletion security**
- **Mobile and desktop deletion views**
- **Pagination handling during deletion**
- Error handling
- Loading states

### Budget Management Tests (`budget-management.spec.ts`)

- Budget creation (credit/debit)
- Budget categorization
- Monthly budget charts
- Budget totals by currency
- Budget deletion
- Error handling

### Transaction & Balance Tests (`transactions-balances.spec.ts`)

- Transaction listing
- Balance calculations
- Multi-currency balances
- Transaction details
- **Balance updates after expense deletion**
- **Integration testing of deletion effects**
- Empty states
- Error handling
- Loading states

### Navigation Tests (`navigation.spec.ts`)

- Sidebar navigation
- URL routing
- Deep linking
- Browser navigation (back/forward)
- Mobile navigation
- Authentication-protected routes

## Best Practices

### Test Writing

1. **Use descriptive test names**: Tests should clearly describe what they're testing
2. **Mock external dependencies**: Use API mocking for consistent tests
3. **Test user flows**: Focus on complete user journeys
4. **Handle async operations**: Properly wait for loading states
5. **Clean up after tests**: Clear storage and reset state

### Test Organization

1. **Group related tests**: Use `test.describe` blocks
2. **Use fixtures appropriately**: Choose the right fixture for each test
3. **Share test data**: Use centralized test data files
4. **Keep tests independent**: Each test should work in isolation

### Error Handling

1. **Test error scenarios**: Include negative test cases
2. **Verify error messages**: Check that errors are properly displayed
3. **Test network failures**: Handle API failures gracefully
4. **Test authentication errors**: Verify proper redirects

## Configuration

### Playwright Configuration

The tests use the configuration in `playwright.config.ts`:

- **Multiple browsers**: Chrome, Firefox, Safari, Mobile
- **Parallel execution**: Tests run in parallel for speed
- **Screenshots**: Captured on failure
- **Videos**: Recorded for failed tests
- **Traces**: Collected for debugging

### Environment Variables

The tests support environment variables:

```bash
# Base URL for the application
PLAYWRIGHT_BASE_URL=http://localhost:3000

# API base URL
REACT_APP_API_BASE_URL=/.netlify/functions

# Test timeout
PLAYWRIGHT_TIMEOUT=30000
```

## CI/CD Integration

### GitHub Actions

The E2E tests are integrated with GitHub Actions:

- **Trigger**: On push to main/develop branches and PRs
- **Matrix**: Multiple browsers and environments
- **Artifacts**: Test reports and screenshots
- **Notifications**: Failure notifications

### Pre-commit Hooks

E2E tests can be run as pre-commit hooks:

```bash
# Install husky
npm run prepare

# Add pre-commit hook
npx husky add .husky/pre-commit "npm run test:e2e"
```

## Debugging

### Common Issues

1. **Timeout errors**: Increase timeout or check loading states
2. **Element not found**: Verify selectors and wait conditions
3. **Authentication failures**: Check mock data and API responses
4. **Network errors**: Verify API mocking setup

### Debug Commands

```bash
# Run with debug mode
npm run test:e2e:debug

# Run with trace viewer
npx playwright test --trace on

# Run with screenshot on failure
npx playwright test --screenshot only-on-failure

# Run with video recording
npx playwright test --video retain-on-failure
```

### Visual Debugging

```bash
# Open Playwright Inspector
npx playwright test --debug

# Open trace viewer
npx playwright show-trace trace.zip

# View HTML report
npx playwright show-report
```

## Maintenance

### Regular Tasks

1. **Update dependencies**: Keep Playwright and browsers updated
2. **Review test data**: Ensure mock data reflects API changes
3. **Check selectors**: Verify element selectors are still valid
4. **Update screenshots**: Refresh visual regression baselines

### Performance Optimization

1. **Parallel execution**: Use `fullyParallel: true`
2. **Browser reuse**: Configure browser context reuse
3. **Selective running**: Run only relevant tests during development
4. **Mock optimization**: Use efficient API mocking

## Contributing

### Adding New Tests

1. **Choose appropriate test file**: Based on functionality
2. **Use existing patterns**: Follow established test patterns
3. **Add mock data**: Update test data files as needed
4. **Document complex tests**: Add comments for complex scenarios

### Test Review Checklist

- [ ] Test covers happy path and error scenarios
- [ ] Appropriate fixtures and mocks used
- [ ] Test is independent and can run in isolation
- [ ] Descriptive test names and comments
- [ ] Proper cleanup and teardown
- [ ] Performance considerations addressed

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Test Automation Patterns](https://playwright.dev/docs/test-patterns)
- [CI/CD Integration](https://playwright.dev/docs/ci) 