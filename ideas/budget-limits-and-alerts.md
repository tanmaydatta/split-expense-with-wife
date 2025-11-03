# Budget Limits and Alerts Feature

## Overview

Add budget limit tracking with visual progress indicators and proactive alerts to help users manage spending within agreed-upon monthly limits. This feature builds on the existing budget tracking system by adding prevention capabilities alongside tracking.

## Why This Feature?

1. **Natural Progression**: Users already track budgets but can't set spending limits - this completes the budget management story
2. **Proactive Financial Management**: Helps prevent overspending BEFORE it happens, not just track it after
3. **High User Value**: For couples managing finances, staying within agreed limits is critical
4. **Leverages Existing Infrastructure**: Builds on solid budget tracking system with minimal architectural changes
5. **Visual Impact**: Progress bars and color-coded warnings provide immediate value

## User Stories

1. As a user, I want to set monthly spending limits for each budget category
2. As a user, I want to see visual progress indicators showing how much of my budget I've used
3. As a user, I want to receive alerts when I'm approaching or exceeding my budget limits
4. As a user, I want to configure alert thresholds (e.g., warn at 80% of limit)
5. As a user, I want to see budget limits on monthly charts for historical context

## Implementation Plan

### Phase 1: Database Schema Updates

#### Migration File: `cf-worker/src/db/migrations/0011_budget_limits.sql`

```sql
-- Add budget limit columns to group_budgets table
ALTER TABLE group_budgets ADD COLUMN monthly_limit_amount REAL;
ALTER TABLE group_budgets ADD COLUMN monthly_limit_currency TEXT;
ALTER TABLE group_budgets ADD COLUMN alert_threshold_percentage INTEGER DEFAULT 80;
ALTER TABLE group_budgets ADD COLUMN limit_enabled INTEGER DEFAULT 0; -- SQLite boolean

-- Create index for limit-enabled budgets
CREATE INDEX idx_group_budgets_limit_enabled
ON group_budgets(group_id, limit_enabled, deleted)
WHERE limit_enabled = 1 AND deleted IS NULL;

-- Create budget_alerts table for notification history
CREATE TABLE budget_alerts (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    group_id TEXT NOT NULL,
    alert_type TEXT NOT NULL CHECK(alert_type IN ('warning', 'exceeded', 'critical')),
    threshold_percentage INTEGER NOT NULL,
    current_amount REAL NOT NULL,
    limit_amount REAL NOT NULL,
    currency TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    acknowledged INTEGER DEFAULT 0,
    acknowledged_at TEXT,
    month_year TEXT NOT NULL, -- Format: 'YYYY-MM' for deduplication

    FOREIGN KEY (budget_id) REFERENCES group_budgets(id),
    FOREIGN KEY (group_id) REFERENCES groups(groupid)
);

-- Create indexes for budget alerts
CREATE INDEX idx_budget_alerts_budget_id ON budget_alerts(budget_id, created_at);
CREATE INDEX idx_budget_alerts_group_id ON budget_alerts(group_id, acknowledged, created_at);
CREATE INDEX idx_budget_alerts_month_year ON budget_alerts(budget_id, month_year);

-- Unique constraint to prevent duplicate alerts for same budget/month/threshold
CREATE UNIQUE INDEX idx_budget_alerts_unique
ON budget_alerts(budget_id, month_year, alert_type, threshold_percentage);
```

#### Update Schema: `cf-worker/src/db/schema/schema.ts`

```typescript
export const groupBudgets = sqliteTable(
	"group_budgets",
	{
		id: text("id").primaryKey(),
		groupId: text("group_id").notNull().references(() => groups.groupid),
		budgetName: text("budget_name").notNull(),
		description: text("description"),

		// NEW: Budget limit fields
		monthlyLimitAmount: real("monthly_limit_amount"),
		monthlyLimitCurrency: text("monthly_limit_currency"),
		alertThresholdPercentage: integer("alert_threshold_percentage").default(80),
		limitEnabled: integer("limit_enabled", { mode: "boolean" }).default(false),

		createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
		updatedAt: text("updated_at").notNull().default("CURRENT_TIMESTAMP"),
		deleted: text("deleted"),
	},
	// ... existing indexes
);

export const budgetAlerts = sqliteTable(
	"budget_alerts",
	{
		id: text("id").primaryKey(),
		budgetId: text("budget_id").notNull().references(() => groupBudgets.id),
		groupId: text("group_id").notNull().references(() => groups.groupid),
		alertType: text("alert_type", {
			enum: ["warning", "exceeded", "critical"],
		}).notNull(),
		thresholdPercentage: integer("threshold_percentage").notNull(),
		currentAmount: real("current_amount").notNull(),
		limitAmount: real("limit_amount").notNull(),
		currency: text("currency", { length: 10 }).notNull(),
		createdAt: text("created_at").notNull().default("CURRENT_TIMESTAMP"),
		acknowledged: integer("acknowledged", { mode: "boolean" }).default(false),
		acknowledgedAt: text("acknowledged_at"),
		monthYear: text("month_year").notNull(), // 'YYYY-MM'
	},
	(table) => [
		index("budget_alerts_budget_id_idx").on(table.budgetId, table.createdAt),
		index("budget_alerts_group_id_idx").on(table.groupId, table.acknowledged, table.createdAt),
		index("budget_alerts_month_year_idx").on(table.budgetId, table.monthYear),
		index("budget_alerts_unique_idx").on(
			table.budgetId,
			table.monthYear,
			table.alertType,
			table.thresholdPercentage,
		),
	],
);
```

### Phase 2: Shared Types Updates

#### Update: `shared-types/index.ts`

```typescript
// Add to existing GroupBudgetData interface
export interface GroupBudgetData {
	id: string;
	budgetName: string;
	description: string | null;
	// NEW: Budget limit fields
	monthlyLimitAmount: number | null;
	monthlyLimitCurrency: string | null;
	alertThresholdPercentage: number;
	limitEnabled: boolean;
}

// NEW: Budget status types
export interface BudgetStatus {
	budgetId: string;
	budgetName: string;
	currentSpending: number;
	limit: number | null;
	currency: string;
	percentageUsed: number | null;
	status: 'safe' | 'warning' | 'exceeded' | 'critical';
	monthYear: string; // 'YYYY-MM'
}

// NEW: Budget alert types
export interface BudgetAlert {
	id: string;
	budgetId: string;
	budgetName?: string; // Enriched from join
	alertType: 'warning' | 'exceeded' | 'critical';
	thresholdPercentage: number;
	currentAmount: number;
	limitAmount: number;
	currency: string;
	createdAt: string;
	acknowledged: boolean;
	acknowledgedAt?: string;
	monthYear: string;
}

// NEW: API request/response types
export interface SetBudgetLimitRequest {
	budgetId: string;
	monthlyLimitAmount: number | null;
	monthlyLimitCurrency: string | null;
	alertThresholdPercentage: number;
	limitEnabled: boolean;
}

export interface BudgetStatusRequest {
	budgetIds?: string[]; // Optional: filter by specific budgets
	monthYear?: string; // Optional: specific month (default: current)
}

export interface BudgetStatusResponse {
	statuses: BudgetStatus[];
	alerts: BudgetAlert[];
}

export interface AcknowledgeAlertRequest {
	alertId: string;
}

// NEW: Add to ApiEndpoints interface
export interface ApiEndpoints {
	// ... existing endpoints

	"/.netlify/functions/budget/limits": {
		request: SetBudgetLimitRequest;
		response: { message: string };
	};
	"/.netlify/functions/budget/status": {
		request: BudgetStatusRequest;
		response: BudgetStatusResponse;
	};
	"/.netlify/functions/budget/alerts/acknowledge": {
		request: AcknowledgeAlertRequest;
		response: { message: string };
	};
}

// NEW: Zod schemas for validation
export const SetBudgetLimitRequestSchema = z.object({
	budgetId: z.string().min(1),
	monthlyLimitAmount: z.number().positive().nullable(),
	monthlyLimitCurrency: z.enum(CURRENCIES as readonly [string, ...string[]]).nullable(),
	alertThresholdPercentage: z.number().min(1).max(100).default(80),
	limitEnabled: z.boolean(),
}).refine(
	(data) => {
		// If limit is enabled, amount and currency must be provided
		if (data.limitEnabled) {
			return data.monthlyLimitAmount !== null && data.monthlyLimitCurrency !== null;
		}
		return true;
	},
	{ message: "Limit amount and currency required when limit is enabled" }
);

export const BudgetStatusRequestSchema = z.object({
	budgetIds: z.array(z.string()).optional(),
	monthYear: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

export const AcknowledgeAlertRequestSchema = z.object({
	alertId: z.string().min(1),
});
```

### Phase 3: Backend API Implementation

#### New Handler: `cf-worker/src/handlers/budget-limits.ts`

```typescript
import { and, eq, inArray, desc, sql } from "drizzle-orm";
import { ulid } from "ulid";
import {
	SetBudgetLimitRequestSchema,
	BudgetStatusRequestSchema,
	AcknowledgeAlertRequestSchema,
	type BudgetStatus,
	type BudgetAlert,
} from "../../../shared-types";
import {
	groupBudgets,
	budgetAlerts,
	budgetEntries
} from "../db/schema/schema";
import {
	createErrorResponse,
	createJsonResponse,
	formatZodError,
	withAuth,
	formatSQLiteTime,
} from "../utils";

// Set or update budget limit
export async function handleSetBudgetLimit(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = session.group;
		if (!group) {
			return createErrorResponse("User not in a group", 400, request, env);
		}

		const json = await request.json();
		const parsed = SetBudgetLimitRequestSchema.safeParse(json);
		if (!parsed.success) {
			return createErrorResponse(
				formatZodError(parsed.error),
				400,
				request,
				env,
			);
		}

		const body = parsed.data;

		// Verify budget belongs to user's group
		const budget = await db
			.select()
			.from(groupBudgets)
			.where(
				and(
					eq(groupBudgets.id, body.budgetId),
					eq(groupBudgets.groupId, group.groupid),
				),
			)
			.limit(1);

		if (budget.length === 0) {
			return createErrorResponse("Budget not found", 404, request, env);
		}

		// Update budget with limit settings
		await db
			.update(groupBudgets)
			.set({
				monthlyLimitAmount: body.monthlyLimitAmount,
				monthlyLimitCurrency: body.monthlyLimitCurrency,
				alertThresholdPercentage: body.alertThresholdPercentage,
				limitEnabled: body.limitEnabled,
				updatedAt: formatSQLiteTime(),
			})
			.where(eq(groupBudgets.id, body.budgetId));

		return createJsonResponse(
			{ message: "Budget limit updated successfully" },
			200,
			{},
			request,
			env,
		);
	});
}

// Calculate budget status for current month
function calculateBudgetStatus(
	currentSpending: number,
	limit: number | null,
	thresholdPercentage: number,
): 'safe' | 'warning' | 'exceeded' | 'critical' {
	if (limit === null || limit === 0) {
		return 'safe';
	}

	const percentageUsed = (currentSpending / limit) * 100;

	if (percentageUsed >= 100) {
		return 'exceeded';
	}
	if (percentageUsed >= 95) {
		return 'critical';
	}
	if (percentageUsed >= thresholdPercentage) {
		return 'warning';
	}
	return 'safe';
}

// Get budget status and alerts
export async function handleGetBudgetStatus(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = session.group;
		if (!group) {
			return createErrorResponse("User not in a group", 400, request, env);
		}

		const url = new URL(request.url);
		const parsed = BudgetStatusRequestSchema.safeParse({
			budgetIds: url.searchParams.get("budgetIds")?.split(","),
			monthYear: url.searchParams.get("monthYear"),
		});

		if (!parsed.success) {
			return createErrorResponse(
				formatZodError(parsed.error),
				400,
				request,
				env,
			);
		}

		const { budgetIds, monthYear } = parsed.data;

		// Default to current month
		const targetMonth = monthYear || new Date().toISOString().slice(0, 7);
		const startDate = `${targetMonth}-01`;
		const endDate = new Date(
			new Date(startDate).getFullYear(),
			new Date(startDate).getMonth() + 1,
			0,
		).toISOString().slice(0, 10);

		// Get budgets with limits enabled
		let budgetQuery = db
			.select()
			.from(groupBudgets)
			.where(
				and(
					eq(groupBudgets.groupId, group.groupid),
					eq(groupBudgets.limitEnabled, true),
					sql`${groupBudgets.deleted} IS NULL`,
				),
			);

		if (budgetIds && budgetIds.length > 0) {
			budgetQuery = budgetQuery.where(inArray(groupBudgets.id, budgetIds));
		}

		const budgets = await budgetQuery;

		// Calculate current spending for each budget
		const statuses: BudgetStatus[] = await Promise.all(
			budgets.map(async (budget) => {
				// Get current month spending
				const spending = await db
					.select({
						total: sql<number>`COALESCE(SUM(${budgetEntries.amount}), 0)`,
					})
					.from(budgetEntries)
					.where(
						and(
							eq(budgetEntries.budgetId, budget.id),
							eq(budgetEntries.currency, budget.monthlyLimitCurrency!),
							sql`${budgetEntries.deleted} IS NULL`,
							sql`${budgetEntries.addedTime} >= ${startDate}`,
							sql`${budgetEntries.addedTime} <= ${endDate}`,
						),
					);

				const currentSpending = spending[0]?.total || 0;
				const limit = budget.monthlyLimitAmount;
				const percentageUsed = limit ? (currentSpending / limit) * 100 : null;

				return {
					budgetId: budget.id,
					budgetName: budget.budgetName,
					currentSpending,
					limit,
					currency: budget.monthlyLimitCurrency!,
					percentageUsed,
					status: calculateBudgetStatus(
						currentSpending,
						limit,
						budget.alertThresholdPercentage,
					),
					monthYear: targetMonth,
				};
			}),
		);

		// Get recent unacknowledged alerts
		const alerts = await db
			.select()
			.from(budgetAlerts)
			.where(
				and(
					eq(budgetAlerts.groupId, group.groupid),
					eq(budgetAlerts.acknowledged, false),
					eq(budgetAlerts.monthYear, targetMonth),
				),
			)
			.orderBy(desc(budgetAlerts.createdAt))
			.limit(50);

		// Enrich alerts with budget names
		const enrichedAlerts: BudgetAlert[] = alerts.map((alert) => {
			const budget = budgets.find((b) => b.id === alert.budgetId);
			return {
				...alert,
				budgetName: budget?.budgetName,
				acknowledgedAt: alert.acknowledgedAt || undefined,
			};
		});

		return createJsonResponse(
			{
				statuses,
				alerts: enrichedAlerts,
			},
			200,
			{},
			request,
			env,
		);
	});
}

// Acknowledge alert
export async function handleAcknowledgeAlert(
	request: Request,
	env: Env,
): Promise<Response> {
	return withAuth(request, env, async (session, db) => {
		const group = session.group;
		if (!group) {
			return createErrorResponse("User not in a group", 400, request, env);
		}

		const json = await request.json();
		const parsed = AcknowledgeAlertRequestSchema.safeParse(json);
		if (!parsed.success) {
			return createErrorResponse(
				formatZodError(parsed.error),
				400,
				request,
				env,
			);
		}

		const { alertId } = parsed.data;

		// Verify alert belongs to user's group
		const alert = await db
			.select()
			.from(budgetAlerts)
			.where(
				and(
					eq(budgetAlerts.id, alertId),
					eq(budgetAlerts.groupId, group.groupid),
				),
			)
			.limit(1);

		if (alert.length === 0) {
			return createErrorResponse("Alert not found", 404, request, env);
		}

		// Mark as acknowledged
		await db
			.update(budgetAlerts)
			.set({
				acknowledged: true,
				acknowledgedAt: formatSQLiteTime(),
			})
			.where(eq(budgetAlerts.id, alertId));

		return createJsonResponse(
			{ message: "Alert acknowledged" },
			200,
			{},
			request,
			env,
		);
	});
}

// Helper function to create budget alert (used by cron)
export async function createBudgetAlert(
	db: any,
	budgetId: string,
	groupId: string,
	alertType: 'warning' | 'exceeded' | 'critical',
	thresholdPercentage: number,
	currentAmount: number,
	limitAmount: number,
	currency: string,
	monthYear: string,
): Promise<void> {
	// Check if alert already exists for this budget/month/type/threshold
	const existing = await db
		.select()
		.from(budgetAlerts)
		.where(
			and(
				eq(budgetAlerts.budgetId, budgetId),
				eq(budgetAlerts.monthYear, monthYear),
				eq(budgetAlerts.alertType, alertType),
				eq(budgetAlerts.thresholdPercentage, thresholdPercentage),
			),
		)
		.limit(1);

	if (existing.length > 0) {
		return; // Alert already exists
	}

	// Create new alert
	await db.insert(budgetAlerts).values({
		id: ulid(),
		budgetId,
		groupId,
		alertType,
		thresholdPercentage,
		currentAmount,
		limitAmount,
		currency,
		createdAt: formatSQLiteTime(),
		acknowledged: false,
		monthYear,
	});
}
```

#### Update Routes: `cf-worker/src/index.ts`

```typescript
// Add imports
import {
	handleSetBudgetLimit,
	handleGetBudgetStatus,
	handleAcknowledgeAlert,
} from "./handlers/budget-limits";

// Add to handleBasicApiRoutes function
async function handleBasicApiRoutes(
	request: Request,
	env: Env,
	apiPath: string,
): Promise<Response | null> {
	switch (apiPath) {
		// ... existing cases

		case "budget/limits":
			return await handleSetBudgetLimit(request, env);
		case "budget/status":
			return await handleGetBudgetStatus(request, env);
		case "budget/alerts/acknowledge":
			return await handleAcknowledgeAlert(request, env);

		// ... rest of cases
	}
}
```

### Phase 4: Scheduled Alert Checking (Cron Job)

#### Update: `cf-worker/src/handlers/cron.ts`

```typescript
import { checkBudgetLimits } from "./budget-limits";

export async function handleCron(env: Env, cronExpression: string) {
	console.log(`Cron triggered: ${cronExpression}`);

	// Existing scheduled actions check
	// ...

	// NEW: Check budget limits daily
	if (cronExpression === "0 0 * * *") { // Daily at midnight
		try {
			await checkBudgetLimits(env);
		} catch (error) {
			console.error("Error checking budget limits:", error);
		}
	}
}
```

#### Add to: `cf-worker/src/handlers/budget-limits.ts`

```typescript
// Daily cron job to check all budget limits
export async function checkBudgetLimits(env: Env): Promise<void> {
	const db = getDb(env.DB);
	const currentMonth = new Date().toISOString().slice(0, 7);

	// Get all budgets with limits enabled across all groups
	const budgetsWithLimits = await db
		.select()
		.from(groupBudgets)
		.where(
			and(
				eq(groupBudgets.limitEnabled, true),
				sql`${groupBudgets.deleted} IS NULL`,
			),
		);

	for (const budget of budgetsWithLimits) {
		try {
			// Calculate current spending
			const spending = await db
				.select({
					total: sql<number>`COALESCE(SUM(${budgetEntries.amount}), 0)`,
				})
				.from(budgetEntries)
				.where(
					and(
						eq(budgetEntries.budgetId, budget.id),
						eq(budgetEntries.currency, budget.monthlyLimitCurrency!),
						sql`${budgetEntries.deleted} IS NULL`,
						sql`strftime('%Y-%m', ${budgetEntries.addedTime}) = ${currentMonth}`,
					),
				);

			const currentSpending = spending[0]?.total || 0;
			const limit = budget.monthlyLimitAmount!;
			const percentageUsed = (currentSpending / limit) * 100;

			// Determine alert type based on percentage
			let alertType: 'warning' | 'exceeded' | 'critical' | null = null;
			let thresholdPercentage = budget.alertThresholdPercentage;

			if (percentageUsed >= 100) {
				alertType = 'exceeded';
				thresholdPercentage = 100;
			} else if (percentageUsed >= 95) {
				alertType = 'critical';
				thresholdPercentage = 95;
			} else if (percentageUsed >= budget.alertThresholdPercentage) {
				alertType = 'warning';
			}

			// Create alert if threshold exceeded
			if (alertType) {
				await createBudgetAlert(
					db,
					budget.id,
					budget.groupId,
					alertType,
					thresholdPercentage,
					currentSpending,
					limit,
					budget.monthlyLimitCurrency!,
					currentMonth,
				);
			}
		} catch (error) {
			console.error(`Error checking budget ${budget.id}:`, error);
		}
	}
}
```

### Phase 5: Frontend Implementation

#### 5.1 Custom Hooks

##### New Hook: `src/hooks/useBudgetStatus.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { BudgetStatusResponse, SetBudgetLimitRequest } from 'split-expense-shared-types';

export function useBudgetStatus(budgetIds?: string[], monthYear?: string) {
	return useQuery({
		queryKey: ['budgetStatus', budgetIds, monthYear],
		queryFn: async () => {
			const params = new URLSearchParams();
			if (budgetIds) params.set('budgetIds', budgetIds.join(','));
			if (monthYear) params.set('monthYear', monthYear);

			return api.get<BudgetStatusResponse>(
				`/.netlify/functions/budget/status?${params.toString()}`
			);
		},
		refetchInterval: 60000, // Refetch every minute
	});
}

export function useSetBudgetLimit() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (data: SetBudgetLimitRequest) => {
			return api.post('/.netlify/functions/budget/limits', data);
		},
		onSuccess: () => {
			// Invalidate budget status and group details queries
			queryClient.invalidateQueries({ queryKey: ['budgetStatus'] });
			queryClient.invalidateQueries({ queryKey: ['groupDetails'] });
		},
	});
}

export function useAcknowledgeAlert() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (alertId: string) => {
			return api.post('/.netlify/functions/budget/alerts/acknowledge', { alertId });
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['budgetStatus'] });
		},
	});
}
```

#### 5.2 UI Components

##### New Component: `src/components/BudgetProgressBar/index.tsx`

```typescript
import React from 'react';
import type { BudgetStatus } from 'split-expense-shared-types';
import getSymbolFromCurrency from 'currency-symbol-map';
import './index.css';

interface BudgetProgressBarProps {
	status: BudgetStatus;
	showDetails?: boolean;
}

export const BudgetProgressBar: React.FC<BudgetProgressBarProps> = ({
	status,
	showDetails = true,
}) => {
	const { budgetName, currentSpending, limit, currency, percentageUsed, status: statusType } = status;

	// Determine color based on status
	const getColorClass = () => {
		switch (statusType) {
			case 'exceeded': return 'progress-exceeded';
			case 'critical': return 'progress-critical';
			case 'warning': return 'progress-warning';
			default: return 'progress-safe';
		}
	};

	const getStatusText = () => {
		switch (statusType) {
			case 'exceeded': return 'Over Budget';
			case 'critical': return 'Critical';
			case 'warning': return 'Warning';
			default: return 'On Track';
		}
	};

	const percentage = Math.min(percentageUsed || 0, 100);
	const currencySymbol = getSymbolFromCurrency(currency);

	return (
		<div className="budget-progress-container">
			{showDetails && (
				<div className="budget-progress-header">
					<span className="budget-name">{budgetName}</span>
					<span className={`budget-status-badge ${getColorClass()}`}>
						{getStatusText()}
					</span>
				</div>
			)}

			<div className="progress-bar-wrapper">
				<div className="progress-bar-background">
					<div
						className={`progress-bar-fill ${getColorClass()}`}
						style={{ width: `${percentage}%` }}
					/>
				</div>
			</div>

			{showDetails && (
				<div className="budget-progress-details">
					<span className="spent-amount">
						{currencySymbol}{currentSpending.toFixed(2)} spent
					</span>
					<span className="limit-amount">
						of {currencySymbol}{limit?.toFixed(2) || 'Unlimited'}
					</span>
					{percentageUsed !== null && (
						<span className="percentage">
							({percentageUsed.toFixed(1)}%)
						</span>
					)}
				</div>
			)}
		</div>
	);
};
```

##### Styles: `src/components/BudgetProgressBar/index.css`

```css
.budget-progress-container {
	margin: 1rem 0;
	padding: 1rem;
	background: var(--card-background, #ffffff);
	border-radius: 8px;
	box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.budget-progress-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 0.75rem;
}

.budget-name {
	font-weight: 600;
	font-size: 1rem;
	color: var(--text-primary, #333);
}

.budget-status-badge {
	padding: 0.25rem 0.75rem;
	border-radius: 12px;
	font-size: 0.75rem;
	font-weight: 600;
	text-transform: uppercase;
}

.progress-safe {
	background-color: #d4edda;
	color: #155724;
}

.progress-warning {
	background-color: #fff3cd;
	color: #856404;
}

.progress-critical {
	background-color: #f8d7da;
	color: #721c24;
}

.progress-exceeded {
	background-color: #dc3545;
	color: #ffffff;
}

.progress-bar-wrapper {
	margin: 0.75rem 0;
}

.progress-bar-background {
	width: 100%;
	height: 24px;
	background-color: #e9ecef;
	border-radius: 12px;
	overflow: hidden;
	position: relative;
}

.progress-bar-fill {
	height: 100%;
	border-radius: 12px;
	transition: width 0.3s ease;
}

.progress-bar-fill.progress-safe {
	background: linear-gradient(90deg, #28a745 0%, #20c997 100%);
}

.progress-bar-fill.progress-warning {
	background: linear-gradient(90deg, #ffc107 0%, #fd7e14 100%);
}

.progress-bar-fill.progress-critical {
	background: linear-gradient(90deg, #dc3545 0%, #c82333 100%);
}

.progress-bar-fill.progress-exceeded {
	background: linear-gradient(90deg, #bd2130 0%, #a71d2a 100%);
}

.budget-progress-details {
	display: flex;
	gap: 0.5rem;
	font-size: 0.875rem;
	color: var(--text-secondary, #666);
	margin-top: 0.5rem;
}

.spent-amount {
	font-weight: 600;
	color: var(--text-primary, #333);
}
```

##### New Component: `src/components/BudgetAlerts/index.tsx`

```typescript
import React from 'react';
import type { BudgetAlert } from 'split-expense-shared-types';
import { useAcknowledgeAlert } from '@/hooks/useBudgetStatus';
import getSymbolFromCurrency from 'currency-symbol-map';
import './index.css';

interface BudgetAlertsProps {
	alerts: BudgetAlert[];
}

export const BudgetAlerts: React.FC<BudgetAlertsProps> = ({ alerts }) => {
	const acknowledgeAlert = useAcknowledgeAlert();

	if (alerts.length === 0) {
		return null;
	}

	const handleDismiss = (alertId: string) => {
		acknowledgeAlert.mutate(alertId);
	};

	const getAlertIcon = (type: string) => {
		switch (type) {
			case 'exceeded': return '🚨';
			case 'critical': return '⚠️';
			default: return '💡';
		}
	};

	const getAlertMessage = (alert: BudgetAlert) => {
		const symbol = getSymbolFromCurrency(alert.currency);
		const percentage = ((alert.currentAmount / alert.limitAmount) * 100).toFixed(1);

		switch (alert.alertType) {
			case 'exceeded':
				return `exceeded budget limit of ${symbol}${alert.limitAmount} (${percentage}%)`;
			case 'critical':
				return `is at ${percentage}% of budget limit (${symbol}${alert.limitAmount})`;
			default:
				return `reached ${alert.thresholdPercentage}% of budget limit`;
		}
	};

	return (
		<div className="budget-alerts-container">
			{alerts.map((alert) => (
				<div
					key={alert.id}
					className={`budget-alert alert-${alert.alertType}`}
					data-test-id={`budget-alert-${alert.alertType}`}
				>
					<div className="alert-content">
						<span className="alert-icon">{getAlertIcon(alert.alertType)}</span>
						<div className="alert-message">
							<strong>{alert.budgetName}</strong> {getAlertMessage(alert)}
						</div>
					</div>
					<button
						className="alert-dismiss"
						onClick={() => handleDismiss(alert.id)}
						disabled={acknowledgeAlert.isPending}
						data-test-id="dismiss-alert-button"
					>
						×
					</button>
				</div>
			))}
		</div>
	);
};
```

##### Styles: `src/components/BudgetAlerts/index.css`

```css
.budget-alerts-container {
	position: fixed;
	top: 70px;
	right: 20px;
	z-index: 1000;
	max-width: 400px;
	width: 100%;
}

.budget-alert {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	padding: 1rem;
	margin-bottom: 0.75rem;
	border-radius: 8px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	animation: slideIn 0.3s ease;
}

@keyframes slideIn {
	from {
		transform: translateX(100%);
		opacity: 0;
	}
	to {
		transform: translateX(0);
		opacity: 1;
	}
}

.alert-warning {
	background-color: #fff3cd;
	border-left: 4px solid #ffc107;
}

.alert-critical {
	background-color: #f8d7da;
	border-left: 4px solid #dc3545;
}

.alert-exceeded {
	background-color: #dc3545;
	color: #ffffff;
	border-left: 4px solid #bd2130;
}

.alert-content {
	display: flex;
	gap: 0.75rem;
	align-items: flex-start;
	flex: 1;
}

.alert-icon {
	font-size: 1.5rem;
	line-height: 1;
}

.alert-message {
	font-size: 0.875rem;
	line-height: 1.4;
}

.alert-message strong {
	display: block;
	margin-bottom: 0.25rem;
	font-weight: 600;
}

.alert-dismiss {
	background: transparent;
	border: none;
	font-size: 1.5rem;
	line-height: 1;
	cursor: pointer;
	color: inherit;
	opacity: 0.7;
	padding: 0;
	margin-left: 1rem;
	width: 24px;
	height: 24px;
	display: flex;
	align-items: center;
	justify-content: center;
}

.alert-dismiss:hover {
	opacity: 1;
}

.alert-exceeded .alert-dismiss {
	color: #ffffff;
}

@media (max-width: 768px) {
	.budget-alerts-container {
		top: 60px;
		right: 10px;
		left: 10px;
		max-width: none;
	}
}
```

#### 5.3 Settings Page Updates

##### Update: `src/pages/Settings/BudgetsSection.tsx`

```typescript
// Add budget limits configuration to existing budgets section

import { useState } from 'react';
import { useSetBudgetLimit } from '@/hooks/useBudgetStatus';
import type { GroupBudgetData } from 'split-expense-shared-types';

// Add to existing BudgetsSection component

const [editingLimitFor, setEditingLimitFor] = useState<string | null>(null);
const setBudgetLimit = useSetBudgetLimit();

const handleSetLimit = (budget: GroupBudgetData) => {
	// Open modal/form to set limit
	setEditingLimitFor(budget.id);
};

// Add UI for each budget item:
<div className="budget-item">
	<div className="budget-info">
		<span className="budget-name">{budget.budgetName}</span>
		{budget.limitEnabled && budget.monthlyLimitAmount && (
			<span className="budget-limit-badge">
				Limit: {getSymbolFromCurrency(budget.monthlyLimitCurrency || 'GBP')}
				{budget.monthlyLimitAmount}
			</span>
		)}
	</div>
	<button
		className="btn-secondary"
		onClick={() => handleSetLimit(budget)}
	>
		{budget.limitEnabled ? 'Edit Limit' : 'Set Limit'}
	</button>
</div>

// Add modal for setting limits
{editingLimitFor && (
	<BudgetLimitModal
		budget={budgets.find(b => b.id === editingLimitFor)!}
		onClose={() => setEditingLimitFor(null)}
		onSave={(limitData) => {
			setBudgetLimit.mutate(limitData, {
				onSuccess: () => setEditingLimitFor(null),
			});
		}}
	/>
)}
```

##### New Component: `src/components/BudgetLimitModal/index.tsx`

```typescript
import React, { useState } from 'react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Form/Input';
import { Select } from '@/components/Form/Select';
import type { GroupBudgetData, SetBudgetLimitRequest } from 'split-expense-shared-types';
import { CURRENCIES } from 'split-expense-shared-types';
import './index.css';

interface BudgetLimitModalProps {
	budget: GroupBudgetData;
	onClose: () => void;
	onSave: (data: SetBudgetLimitRequest) => void;
}

export const BudgetLimitModal: React.FC<BudgetLimitModalProps> = ({
	budget,
	onClose,
	onSave,
}) => {
	const [limitEnabled, setLimitEnabled] = useState(budget.limitEnabled);
	const [amount, setAmount] = useState(budget.monthlyLimitAmount || 0);
	const [currency, setCurrency] = useState(budget.monthlyLimitCurrency || 'GBP');
	const [threshold, setThreshold] = useState(budget.alertThresholdPercentage);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onSave({
			budgetId: budget.id,
			monthlyLimitAmount: limitEnabled ? amount : null,
			monthlyLimitCurrency: limitEnabled ? currency : null,
			alertThresholdPercentage: threshold,
			limitEnabled,
		});
	};

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-content" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">
					<h3>Set Budget Limit: {budget.budgetName}</h3>
					<button className="close-button" onClick={onClose}>×</button>
				</div>

				<form onSubmit={handleSubmit} className="budget-limit-form">
					<div className="form-group">
						<label className="checkbox-label">
							<input
								type="checkbox"
								checked={limitEnabled}
								onChange={(e) => setLimitEnabled(e.target.checked)}
							/>
							Enable monthly spending limit
						</label>
					</div>

					{limitEnabled && (
						<>
							<div className="form-group">
								<label>Monthly Limit Amount</label>
								<Input
									type="number"
									value={amount}
									onChange={(e) => setAmount(Number(e.target.value))}
									min={0}
									step={0.01}
									required
								/>
							</div>

							<div className="form-group">
								<label>Currency</label>
								<Select
									value={currency}
									onChange={(e) => setCurrency(e.target.value)}
									required
								>
									{CURRENCIES.map((curr) => (
										<option key={curr} value={curr}>
											{curr}
										</option>
									))}
								</Select>
							</div>

							<div className="form-group">
								<label>Alert Threshold (%)</label>
								<Input
									type="number"
									value={threshold}
									onChange={(e) => setThreshold(Number(e.target.value))}
									min={1}
									max={100}
									required
								/>
								<small className="form-help">
									You'll be alerted when spending reaches {threshold}% of the limit
								</small>
							</div>
						</>
					)}

					<div className="modal-actions">
						<Button type="button" variant="secondary" onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit">
							Save Limit
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
};
```

#### 5.4 Dashboard Updates

##### Update: `src/pages/Dashboard/index.tsx`

```typescript
// Add at the top of Dashboard component
import { useBudgetStatus } from '@/hooks/useBudgetStatus';
import { BudgetAlerts } from '@/components/BudgetAlerts';
import { BudgetProgressBar } from '@/components/BudgetProgressBar';

// Inside Dashboard component
const budgetStatusQuery = useBudgetStatus();

// Add before the form
{budgetStatusQuery.data && (
	<>
		<BudgetAlerts alerts={budgetStatusQuery.data.alerts} />

		{budgetStatusQuery.data.statuses.some(s => s.limit !== null) && (
			<Card>
				<h3>Budget Status</h3>
				{budgetStatusQuery.data.statuses.map((status) => (
					<BudgetProgressBar key={status.budgetId} status={status} />
				))}
			</Card>
		)}
	</>
)}
```

#### 5.5 Monthly Budget Chart Updates

##### Update: `src/pages/MonthlyBudgetPage/ChartComponents.tsx`

```typescript
// Add limit line to chart
import { ReferenceLine } from 'recharts';

// Inside BudgetChart component, add limit from props
interface BudgetChartProps {
	chartData: any[];
	averageExpense: number;
	currency: string;
	windowWidth: number;
	budgetLimit?: number; // NEW
}

// Add to chart
{budgetLimit && (
	<ReferenceLine
		y={budgetLimit}
		stroke="#dc3545"
		strokeDasharray="3 3"
		strokeWidth={2}
		label={{
			value: 'Limit',
			position: 'right',
			fill: '#dc3545',
			fontSize: 12,
		}}
	/>
)}
```

### Phase 6: Testing

#### 6.1 Backend Tests

##### New File: `cf-worker/tests/budget-limits.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import {
	setupAndCleanDatabase,
	createTestUserData,
	signInAndGetCookies,
	createTestRequest,
} from './test-utils';
import {
	handleSetBudgetLimit,
	handleGetBudgetStatus,
	handleAcknowledgeAlert,
} from '../src/handlers/budget-limits';

describe('Budget Limits API', () => {
	let env: Env;
	let testData: any;
	let cookies: string;

	beforeEach(async () => {
		env = getMiniflareBindings();
		await setupAndCleanDatabase(env);
		testData = await createTestUserData(env);
		cookies = await signInAndGetCookies(env, testData.user1.email, '123456');
	});

	describe('Set Budget Limit', () => {
		it('should set budget limit successfully', async () => {
			const request = createTestRequest(
				'budget/limits',
				'POST',
				{
					budgetId: testData.budgetIds[0],
					monthlyLimitAmount: 1000,
					monthlyLimitCurrency: 'GBP',
					alertThresholdPercentage: 80,
					limitEnabled: true,
				},
				cookies,
			);

			const response = await handleSetBudgetLimit(request, env);
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.message).toContain('updated successfully');
		});

		it('should validate limit when enabled', async () => {
			const request = createTestRequest(
				'budget/limits',
				'POST',
				{
					budgetId: testData.budgetIds[0],
					monthlyLimitAmount: null,
					monthlyLimitCurrency: null,
					alertThresholdPercentage: 80,
					limitEnabled: true, // Enabled but no amount
				},
				cookies,
			);

			const response = await handleSetBudgetLimit(request, env);
			expect(response.status).toBe(400);
		});

		it('should reject invalid budget ID', async () => {
			const request = createTestRequest(
				'budget/limits',
				'POST',
				{
					budgetId: 'invalid-budget-id',
					monthlyLimitAmount: 1000,
					monthlyLimitCurrency: 'GBP',
					alertThresholdPercentage: 80,
					limitEnabled: true,
				},
				cookies,
			);

			const response = await handleSetBudgetLimit(request, env);
			expect(response.status).toBe(404);
		});
	});

	describe('Get Budget Status', () => {
		it('should return budget status with spending', async () => {
			// Set up limit
			await setBudgetLimit(env, testData.budgetIds[0], 1000, 'GBP');

			// Add some spending
			await addBudgetEntry(env, testData.budgetIds[0], 500, 'GBP');

			const request = createTestRequest(
				'budget/status',
				'GET',
				null,
				cookies,
			);

			const response = await handleGetBudgetStatus(request, env);
			expect(response.status).toBe(200);

			const data = await response.json();
			expect(data.statuses).toHaveLength(1);
			expect(data.statuses[0].currentSpending).toBe(500);
			expect(data.statuses[0].percentageUsed).toBe(50);
			expect(data.statuses[0].status).toBe('safe');
		});

		it('should show warning status at threshold', async () => {
			await setBudgetLimit(env, testData.budgetIds[0], 1000, 'GBP', 80);
			await addBudgetEntry(env, testData.budgetIds[0], 850, 'GBP');

			const request = createTestRequest(
				'budget/status',
				'GET',
				null,
				cookies,
			);

			const response = await handleGetBudgetStatus(request, env);
			const data = await response.json();

			expect(data.statuses[0].status).toBe('warning');
		});

		it('should show exceeded status over limit', async () => {
			await setBudgetLimit(env, testData.budgetIds[0], 1000, 'GBP');
			await addBudgetEntry(env, testData.budgetIds[0], 1200, 'GBP');

			const request = createTestRequest(
				'budget/status',
				'GET',
				null,
				cookies,
			);

			const response = await handleGetBudgetStatus(request, env);
			const data = await response.json();

			expect(data.statuses[0].status).toBe('exceeded');
			expect(data.statuses[0].percentageUsed).toBeGreaterThan(100);
		});
	});

	describe('Acknowledge Alert', () => {
		it('should acknowledge alert successfully', async () => {
			const alertId = await createTestAlert(env, testData.budgetIds[0]);

			const request = createTestRequest(
				'budget/alerts/acknowledge',
				'POST',
				{ alertId },
				cookies,
			);

			const response = await handleAcknowledgeAlert(request, env);
			expect(response.status).toBe(200);

			// Verify alert is acknowledged
			const alert = await getAlert(env, alertId);
			expect(alert.acknowledged).toBe(true);
		});
	});
});
```

#### 6.2 Frontend Tests

##### New File: `src/components/BudgetProgressBar/index.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { BudgetProgressBar } from './index';
import type { BudgetStatus } from 'split-expense-shared-types';

describe('BudgetProgressBar', () => {
	const mockStatus: BudgetStatus = {
		budgetId: '1',
		budgetName: 'Food',
		currentSpending: 500,
		limit: 1000,
		currency: 'GBP',
		percentageUsed: 50,
		status: 'safe',
		monthYear: '2025-01',
	};

	it('should render safe status correctly', () => {
		render(<BudgetProgressBar status={mockStatus} />);

		expect(screen.getByText('Food')).toBeInTheDocument();
		expect(screen.getByText('On Track')).toBeInTheDocument();
		expect(screen.getByText(/£500.00 spent/)).toBeInTheDocument();
		expect(screen.getByText(/of £1000.00/)).toBeInTheDocument();
	});

	it('should render warning status', () => {
		const warningStatus = { ...mockStatus, currentSpending: 850, percentageUsed: 85, status: 'warning' as const };
		render(<BudgetProgressBar status={warningStatus} />);

		expect(screen.getByText('Warning')).toBeInTheDocument();
	});

	it('should render exceeded status', () => {
		const exceededStatus = { ...mockStatus, currentSpending: 1200, percentageUsed: 120, status: 'exceeded' as const };
		render(<BudgetProgressBar status={exceededStatus} />);

		expect(screen.getByText('Over Budget')).toBeInTheDocument();
	});
});
```

#### 6.3 E2E Tests

##### New File: `src/e2e/tests/budget-limits.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Budget Limits', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('should set budget limit from settings', async ({ page }) => {
		await page.goto('/settings');

		// Find budget and click set limit
		await page.click('[data-test-id="set-limit-food"]');

		// Fill in limit form
		await page.check('input[type="checkbox"]');
		await page.fill('input[type="number"][name="amount"]', '1000');
		await page.selectOption('select[name="currency"]', 'GBP');
		await page.fill('input[name="threshold"]', '80');

		await page.click('button[type="submit"]');

		await expect(page.locator('text=Budget limit updated')).toBeVisible();
	});

	test('should show progress bar on dashboard', async ({ page }) => {
		// Set up limit first
		await page.goto('/settings');
		await page.click('[data-test-id="set-limit-food"]');
		await page.check('input[type="checkbox"]');
		await page.fill('input[type="number"][name="amount"]', '1000');
		await page.click('button[type="submit"]');

		// Go to dashboard
		await page.goto('/');

		// Should see budget status card
		await expect(page.locator('text=Budget Status')).toBeVisible();
		await expect(page.locator('.budget-progress-container')).toBeVisible();
	});

	test('should show alert when threshold exceeded', async ({ page }) => {
		// This would require adding budget entries that exceed threshold
		// Implementation depends on your test data setup
		await page.goto('/');

		// Add enough spending to trigger alert
		// ... add transactions

		await expect(page.locator('.budget-alert')).toBeVisible();
		await expect(page.locator('text=reached 80% of budget limit')).toBeVisible();
	});

	test('should dismiss alert', async ({ page }) => {
		await page.goto('/');

		const alert = page.locator('.budget-alert').first();
		await alert.locator('[data-test-id="dismiss-alert-button"]').click();

		await expect(alert).not.toBeVisible();
	});
});
```

### Phase 7: Documentation Updates

#### Update: `docs/database.md`

Add sections documenting:
- New `group_budgets` columns for limits
- New `budget_alerts` table
- Indexes and performance considerations

#### Update: `docs/api.md`

Add API documentation for:
- `POST /.netlify/functions/budget/limits` - Set budget limits
- `GET /.netlify/functions/budget/status` - Get budget status
- `POST /.netlify/functions/budget/alerts/acknowledge` - Acknowledge alerts

#### New: `docs/features/budget-limits.md`

Create comprehensive feature documentation explaining:
- How to set budget limits
- How alerts work
- Alert thresholds and customization
- Visual indicators meaning
- Best practices for budget management

### Phase 8: Deployment Checklist

1. **Database Migration**
   ```bash
   cd cf-worker
   yarn db:migrate:dev
   yarn db:migrate:prod
   ```

2. **Backend Deployment**
   ```bash
   cd cf-worker
   yarn lint
   yarn test
   yarn deploy:dev
   # Test in dev environment
   yarn deploy:prod
   ```

3. **Frontend Deployment**
   ```bash
   yarn lint
   yarn test
   yarn build
   # Auto-deploys via Netlify on merge to main
   ```

4. **Smoke Testing**
   - Set a budget limit in Settings
   - Add transactions to approach threshold
   - Verify alert appears
   - Check dashboard progress bars
   - View monthly chart with limit line
   - Acknowledge alert
   - Verify cron job runs daily

## Success Metrics

- **Adoption**: % of budgets with limits enabled
- **Engagement**: How often users check budget status
- **Prevention**: Reduction in over-budget months
- **Alerts**: Average time to acknowledge alerts

## Future Enhancements

1. **Email Notifications**: Send email when limits exceeded
2. **Budget Rollover**: Carry unused budget to next month
3. **Smart Predictions**: ML-based spending forecasts
4. **Category Groups**: Set limits for groups of budgets
5. **Custom Alert Rules**: Advanced threshold configurations
6. **Historical Limit Tracking**: See how limits changed over time

## Alternative Features Considered

### CSV/PDF Export
- **Effort**: Medium
- **Value**: High for tax season
- **Priority**: Next after limits

### Search & Filters
- **Effort**: Medium
- **Value**: High for large transaction history
- **Priority**: After export feature
