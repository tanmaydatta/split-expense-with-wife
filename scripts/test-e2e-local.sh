#!/usr/bin/env bash
set -euo pipefail

# Resolve repo root from this script's location so the script works regardless
# of where it's invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Verify .dev.vars exists with E2E_SEED_SECRET (else friendly error).
if [ ! -f cf-worker/.dev.vars ] || ! grep -q '^E2E_SEED_SECRET=' cf-worker/.dev.vars; then
  echo "cf-worker/.dev.vars is missing or doesn't define E2E_SEED_SECRET."
  echo "Copy cf-worker/.dev.vars.example to cf-worker/.dev.vars and fill in values."
  exit 1
fi

# Read the secret from .dev.vars so the test process and worker share the same value.
E2E_SEED_SECRET="$(grep '^E2E_SEED_SECRET=' cf-worker/.dev.vars | head -1 | cut -d= -f2-)"
export E2E_SEED_SECRET

# Wipe local D1 and re-migrate.
echo "Wiping local D1 state..."
rm -rf cf-worker/.wrangler/state/v3/d1

echo "Applying migrations to local D1..."
(cd cf-worker && yarn db:migrate:local)

echo "Running playwright tests against local backend..."
yarn playwright test \
  --project=chromium \
  --workers=1 \
  --reporter=list,html \
  --trace=on \
  src/e2e/tests/expense-management.spec.ts \
  src/e2e/tests/scheduled-actions.spec.ts \
  src/e2e/tests/monthly-budget-management.spec.ts \
  src/e2e/tests/budget-management.spec.ts \
  src/e2e/tests/settings-management.spec.ts \
  src/e2e/tests/transactions-balances.spec.ts \
  src/e2e/tests/auth.spec.ts \
  "$@"
