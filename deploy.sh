#!/bin/bash
# Usage: ./deploy.sh [dev|prod]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if environment argument is provided
if [ $# -eq 0 ]; then
    print_error "Environment argument required!"
    echo "Usage: $0 [dev|prod]"
    exit 1
fi

ENV=$1

# Validate environment argument
if [ "$ENV" != "dev" ] && [ "$ENV" != "prod" ]; then
    print_error "Invalid environment: $ENV"
    echo "Valid environments: dev, prod"
    exit 1
fi

print_step "Starting deployment to $ENV environment..."

# Step 1: Install main app dependencies
print_step "Installing main app dependencies..."
yarn install --immutable
print_success "Main app dependencies installed"

# Step 2: Lint React app
print_step "Linting React app..."
yarn lint
print_success "React app linting passed"

# Step 3: Build UI
print_step "Building UI..."
yarn build
print_success "UI build completed"

# Step 4: Install CF Worker dependencies
print_step "Installing CF Worker dependencies..."
cd cf-worker
yarn install --immutable
print_success "CF Worker dependencies installed"

# Step 5: Lint CF Worker
print_step "Linting CF Worker..."
yarn lint
print_success "CF Worker linting passed"

# Step 6: Run CF Worker tests
print_step "Running CF Worker tests..."
yarn test
print_success "CF Worker tests passed"

# Step 7: Deploy to Cloudflare Workers
print_step "Deploying to Cloudflare Workers ($ENV environment)..."
yarn wrangler deploy -e $ENV
print_success "Deployment to $ENV completed!"

cd ..
print_success "All deployment steps completed successfully! 🚀" 