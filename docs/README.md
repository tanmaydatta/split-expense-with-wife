# Split Expense With Wife - Documentation

This folder contains comprehensive documentation for the Split Expense With Wife application.

## Documentation Structure

- [**Architecture Overview**](./architecture.md) - High-level system architecture and design patterns
- [**Development Setup**](./development.md) - Getting started with local development
- [**Database Documentation**](./database.md) - Schema, migrations, and data management
- [**Migration Changelog**](./migration-changelog.md) - Major database migrations and changes
- [**API Documentation**](./api.md) - REST endpoints, types, and integration guide
- [**Deployment Guide**](./deployment.md) - Production deployment and configuration
- [**Testing Guide**](./testing.md) - Testing strategy, frameworks, and best practices

## Quick Start

For developers new to the project:

1. Start with [Development Setup](./development.md) to get your environment running
2. Read [Architecture Overview](./architecture.md) to understand the system design
3. Explore [API Documentation](./api.md) for backend integration details
4. Check [Database Documentation](./database.md) for schema and migration info

## Project Overview

Split Expense With Wife is a full-stack expense splitting application built with:

- **Frontend**: React 18 + TypeScript + Redux Toolkit
- **Backend**: Cloudflare Workers + D1 Database  
- **Database**: SQLite with Drizzle ORM
- **Authentication**: Better-auth with PIN-based login
- **Testing**: Jest/React Testing Library + Playwright + Vitest
- **Deployment**: Cloudflare Workers (full-stack deployment)

The application enables couples to track shared expenses, split costs, manage budgets, and schedule recurring transactions.