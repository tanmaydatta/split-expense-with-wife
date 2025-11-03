# Link Transactions to Budget Entries Implementation Plan

## Executive Summary
Enable users to link expenses (transactions) to specific budget entries using a one-to-one mapping. Budget category is derived from the linked budget entry's `budgetId`.

## Key Requirements
- **One-to-one mapping**: One transaction can link to maximum ONE budget entry
- **New mapping table**: `transaction_budget_links` (no columns added to existing tables)
- **Automatic linking on Dashboard**: When user creates BOTH expense AND budget in same submission, automatically link them internally
- **Manual linking UI**: Available in Budget list page and Transaction list page
- **Simple**: Keep implementation straightforward
- **Optional**: Linking is optional (expenses can exist without budget links)

## Phase 0: Research & Analysis ✅ COMPLETED

### Database Schema Analysis
**Current Tables:**
- `transactions`: Main transaction records with metadata
- `budget_entries`: Individual budget line items with amounts
- `group_budgets`: Budget categories (budgetId, name, groupId)

**Relationships:**
- `budget_entries.budgetId` → `group_budgets.budgetId` (many-to-one)
- New: `transactions.transactionId` → `budget_entries.budgetEntryId` (one-to-one via mapping table)

### Backend Analysis
- **Split Handler**: `cf-worker/src/handlers/split.ts` creates transactions
- **Budget Handler**: `cf-worker/src/handlers/budget.ts` creates budget entries
- **Dashboard Submission**: Currently can create expense, budget, or both

### Frontend Analysis
- **Dashboard**: `src/pages/Dashboard/index.tsx` - expense/budget creation form with checkboxes
- **Transactions**: `src/pages/Transactions/index.tsx` - transaction list with editing
- **Budgets**: Need to add manual linking UI to budget list page

## Phase 1: Database Schema - Create Mapping Table

### Migration File: `cf-worker/src/db/migrations/00XX_create_transaction_budget_links.sql`

```sql
-- Create transaction_budget_links table with one-to-one constraint
CREATE TABLE IF NOT EXISTS transaction_budget_links (
  transaction_id TEXT PRIMARY KEY, -- One transaction → one link (enforces one-to-one)
  budget_entry_id TEXT NOT NULL,
  linked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
  linked_by_user_id TEXT NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions(transactionId) ON DELETE CASCADE,
  FOREIGN KEY (budget_entry_id) REFERENCES budget_entries(budgetEntryId) ON DELETE CASCADE,
  FOREIGN KEY (linked_by_user_id) REFERENCES user(id) ON DELETE RESTRICT
);

-- Index for fast budget entry lookups
CREATE INDEX idx_transaction_budget_links_budget_entry
ON transaction_budget_links(budget_entry_id);

-- Index for user activity tracking
CREATE INDEX idx_transaction_budget_links_user
ON transaction_budget_links(linked_by_user_id);
```

**Key Design Decisions:**
- `transaction_id` as PRIMARY KEY enforces one-to-one mapping
- `ON DELETE CASCADE` ensures links are removed when transaction/budget is deleted
- `ON DELETE RESTRICT` for user prevents deletion of users with link history
- `linked_at` timestamp for audit trail
- `linked_by_user_id` tracks who created the link

### Update `cf-worker/src/db/schema/schema.ts`

```typescript
export const transactionBudgetLinks = sqliteTable('transaction_budget_links', {
  transactionId: text('transaction_id')
    .primaryKey()
    .references(() => transactions.transactionId, { onDelete: 'cascade' }),
  budgetEntryId: text('budget_entry_id')
    .notNull()
    .references(() => budgetEntries.budgetEntryId, { onDelete: 'cascade' }),
  linkedAt: text('linked_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%d %H:%M:%f', 'now'))`),
  linkedByUserId: text('linked_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'restrict' }),
});

// Type inference
export type TransactionBudgetLink = typeof transactionBudgetLinks.$inferSelect;
export type NewTransactionBudgetLink = typeof transactionBudgetLinks.$inferInsert;
```

### Generate and Apply Migration
```bash
cd cf-worker
yarn db:generate:transaction-budget-links
yarn db:migrate:local
yarn db:studio:local  # Verify schema
```

## Phase 2: Shared Types - Type Definitions

### Update `shared-types/index.ts`

```typescript
// Transaction-Budget Link Types
export interface TransactionBudgetLink {
  transactionId: string;
  budgetEntryId: string;
  linkedAt: string;
  linkedByUserId: string;
}

// Enriched transaction with budget info
export interface TransactionWithBudget {
  transactionId: string;
  description: string;
  amount: number;
  currency: string;
  createdAt: string;
  metadata: any;
  budgetLink?: {
    budgetEntryId: string;
    budgetEntryDescription: string;
    budgetId: string;
    budgetName: string; // Category name from group_budgets
  };
}

// Enriched budget entry with transaction info
export interface BudgetEntryWithTransaction {
  budgetEntryId: string;
  description: string;
  amount: number;
  budgetId: string;
  addedTime: string;
  transactionLink?: {
    transactionId: string;
    transactionDescription: string;
    transactionAmount: number;
  };
}

// Request/Response Types
export interface LinkTransactionToBudgetRequest {
  transactionId: string;
  budgetEntryId: string;
}

export interface LinkTransactionToBudgetResponse {
  success: boolean;
  link?: TransactionBudgetLink;
  error?: string;
}

export interface UnlinkTransactionFromBudgetRequest {
  transactionId: string;
}

export interface UnlinkTransactionFromBudgetResponse {
  success: boolean;
  error?: string;
}

// Validation Schemas
export const LinkTransactionToBudgetRequestSchema = z.object({
  transactionId: z.string().min(1),
  budgetEntryId: z.string().min(1),
});

export const UnlinkTransactionFromBudgetRequestSchema = z.object({
  transactionId: z.string().min(1),
});

// Dashboard submission now returns both IDs when both are created
export interface DashboardSubmitResponse {
  success: boolean;
  transactionId?: string;
  budgetEntryId?: string;
  linkedAutomatically?: boolean; // NEW: Indicates auto-linking happened
  error?: string;
}
```

### Build Shared Types
```bash
cd shared-types
yarn build
```

## Phase 3: Backend API - Link Management Handlers

### Create `cf-worker/src/handlers/transaction-budget-links.ts`

```typescript
import { eq, and, isNull } from "drizzle-orm";
import type { getDb } from "../db";
import { transactionBudgetLinks } from "../db/schema/schema";
import { transactions, budgetEntries } from "../db/schema/schema";
import type {
  LinkTransactionToBudgetRequest,
  LinkTransactionToBudgetResponse,
  UnlinkTransactionFromBudgetRequest,
  UnlinkTransactionFromBudgetResponse,
} from "../../../shared-types";
import { formatSQLiteTime } from "../utils";

type DbInstance = ReturnType<typeof getDb>;

/**
 * Link a transaction to a budget entry (one-to-one)
 * Replaces existing link if present
 */
export async function linkTransactionToBudget(
  request: LinkTransactionToBudgetRequest,
  userId: string,
  groupId: string,
  db: DbInstance,
): Promise<LinkTransactionToBudgetResponse> {
  const { transactionId, budgetEntryId } = request;

  try {
    // Verify transaction exists and belongs to user's group
    const transaction = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.transactionId, transactionId),
          eq(transactions.groupId, groupId),
          isNull(transactions.deleted),
        ),
      )
      .limit(1);

    if (transaction.length === 0) {
      return {
        success: false,
        error: "Transaction not found or access denied",
      };
    }

    // Verify budget entry exists and belongs to same group
    const budgetEntry = await db
      .select()
      .from(budgetEntries)
      .where(
        and(
          eq(budgetEntries.budgetEntryId, budgetEntryId),
          isNull(budgetEntries.deleted),
        ),
      )
      .limit(1);

    if (budgetEntry.length === 0) {
      return {
        success: false,
        error: "Budget entry not found",
      };
    }

    // Check if link already exists
    const existingLink = await db
      .select()
      .from(transactionBudgetLinks)
      .where(eq(transactionBudgetLinks.transactionId, transactionId))
      .limit(1);

    const timestamp = formatSQLiteTime();

    if (existingLink.length > 0) {
      // Update existing link (replace)
      await db
        .update(transactionBudgetLinks)
        .set({
          budgetEntryId,
          linkedAt: timestamp,
          linkedByUserId: userId,
        })
        .where(eq(transactionBudgetLinks.transactionId, transactionId));
    } else {
      // Create new link
      await db.insert(transactionBudgetLinks).values({
        transactionId,
        budgetEntryId,
        linkedAt: timestamp,
        linkedByUserId: userId,
      });
    }

    // Fetch created/updated link
    const link = await db
      .select()
      .from(transactionBudgetLinks)
      .where(eq(transactionBudgetLinks.transactionId, transactionId))
      .limit(1);

    return {
      success: true,
      link: link[0],
    };
  } catch (error) {
    console.error("Error linking transaction to budget:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Unlink a transaction from its budget entry
 */
export async function unlinkTransactionFromBudget(
  request: UnlinkTransactionFromBudgetRequest,
  userId: string,
  groupId: string,
  db: DbInstance,
): Promise<UnlinkTransactionFromBudgetResponse> {
  const { transactionId } = request;

  try {
    // Verify transaction exists and belongs to user's group
    const transaction = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.transactionId, transactionId),
          eq(transactions.groupId, groupId),
          isNull(transactions.deleted),
        ),
      )
      .limit(1);

    if (transaction.length === 0) {
      return {
        success: false,
        error: "Transaction not found or access denied",
      };
    }

    // Delete link
    await db
      .delete(transactionBudgetLinks)
      .where(eq(transactionBudgetLinks.transactionId, transactionId));

    return { success: true };
  } catch (error) {
    console.error("Error unlinking transaction from budget:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get transactions with their budget links (enriched data)
 */
export async function getTransactionsWithBudgetLinks(
  groupId: string,
  db: DbInstance,
) {
  const results = await db
    .select({
      transaction: transactions,
      budgetLink: transactionBudgetLinks,
      budgetEntry: budgetEntries,
    })
    .from(transactions)
    .leftJoin(
      transactionBudgetLinks,
      eq(transactions.transactionId, transactionBudgetLinks.transactionId),
    )
    .leftJoin(
      budgetEntries,
      eq(transactionBudgetLinks.budgetEntryId, budgetEntries.budgetEntryId),
    )
    .where(
      and(
        eq(transactions.groupId, groupId),
        isNull(transactions.deleted),
      ),
    )
    .orderBy(transactions.createdAt);

  return results;
}

/**
 * Get budget entries with their transaction links (enriched data)
 */
export async function getBudgetEntriesWithTransactionLinks(
  groupId: string,
  db: DbInstance,
) {
  const results = await db
    .select({
      budgetEntry: budgetEntries,
      transactionLink: transactionBudgetLinks,
      transaction: transactions,
    })
    .from(budgetEntries)
    .leftJoin(
      transactionBudgetLinks,
      eq(budgetEntries.budgetEntryId, transactionBudgetLinks.budgetEntryId),
    )
    .leftJoin(
      transactions,
      eq(transactionBudgetLinks.transactionId, transactions.transactionId),
    )
    .where(isNull(budgetEntries.deleted))
    .orderBy(budgetEntries.addedTime);

  return results;
}
```

### Update `cf-worker/src/index.ts` - Register Routes

```typescript
import {
  linkTransactionToBudget,
  unlinkTransactionFromBudget,
} from "./handlers/transaction-budget-links";
import {
  LinkTransactionToBudgetRequestSchema,
  UnlinkTransactionFromBudgetRequestSchema,
} from "../../shared-types";

// Add new routes
if (pathname === "/.netlify/functions/link_transaction_to_budget") {
  if (req.method === "POST") {
    const body = await req.json();
    const parsed = LinkTransactionToBudgetRequestSchema.safeParse(body);

    if (!parsed.success) {
      return json({ error: "Invalid request", details: parsed.error }, { status: 400 });
    }

    const result = await linkTransactionToBudget(
      parsed.data,
      session.userId,
      session.groupId,
      db,
    );

    return json(result, { status: result.success ? 200 : 400 });
  }
}

if (pathname === "/.netlify/functions/unlink_transaction_from_budget") {
  if (req.method === "POST") {
    const body = await req.json();
    const parsed = UnlinkTransactionFromBudgetRequestSchema.safeParse(body);

    if (!parsed.success) {
      return json({ error: "Invalid request", details: parsed.error }, { status: 400 });
    }

    const result = await unlinkTransactionFromBudget(
      parsed.data,
      session.userId,
      session.groupId,
      db,
    );

    return json(result, { status: result.success ? 200 : 400 });
  }
}
```

## Phase 4: Backend - Dashboard Auto-Linking

### Update `src/pages/Dashboard/formHandlers.ts`

Modify the Dashboard submission handler to detect when both expense and budget are created, then return both IDs:

```typescript
export function createFormSubmitHandler(dashboardSubmit: any, data: any) {
  return async (options: any, form: any) => {
    const formData = options.value;

    // Check if both expense and budget are being created
    const creatingExpense = formData.addExpense;
    const creatingBudget = formData.updateBudget;

    // ... existing submission logic

    // The backend response should include both IDs when both are created
    const response = await dashboardSubmit.mutateAsync({
      // ... existing fields
    });

    // Response structure:
    // {
    //   success: true,
    //   transactionId: "tx_123", // if expense created
    //   budgetEntryId: "be_456", // if budget created
    //   linkedAutomatically: true // if both created and auto-linked
    // }

    return response;
  };
}
```

### Update Backend Handler to Auto-Link

Modify the dashboard submission handler in `cf-worker/src/handlers/` to:

1. Create transaction (if addExpense=true)
2. Create budget entry (if updateBudget=true)
3. If BOTH created, automatically link them
4. Return both IDs and linkedAutomatically flag

```typescript
// In the main dashboard handler (split or combined handler)
export async function handleDashboardSubmission(
  request: DashboardSubmitRequest,
  userId: string,
  groupId: string,
  db: DbInstance,
): Promise<DashboardSubmitResponse> {
  let transactionId: string | undefined;
  let budgetEntryId: string | undefined;
  let linkedAutomatically = false;

  try {
    // Create expense if requested
    if (request.addExpense) {
      const splitResult = await createSplitTransaction(/* ... */);
      transactionId = splitResult.transactionId;
    }

    // Create budget entry if requested
    if (request.updateBudget) {
      const budgetResult = await createBudgetEntry(/* ... */);
      budgetEntryId = budgetResult.budgetEntryId;
    }

    // Auto-link if BOTH were created
    if (transactionId && budgetEntryId) {
      const linkResult = await linkTransactionToBudget(
        { transactionId, budgetEntryId },
        userId,
        groupId,
        db,
      );

      if (linkResult.success) {
        linkedAutomatically = true;
      }
    }

    return {
      success: true,
      transactionId,
      budgetEntryId,
      linkedAutomatically,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

## Phase 5: Frontend - React Query Hooks

### Create `src/hooks/useTransactionBudgetLinks.ts`

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  LinkTransactionToBudgetRequest,
  LinkTransactionToBudgetResponse,
  UnlinkTransactionFromBudgetRequest,
  UnlinkTransactionFromBudgetResponse,
} from "split-expense-shared-types";
import { queryFunctionFactory } from "@/api";

const TRANSACTIONS_QUERY_KEY = ["transactions"];
const BUDGETS_QUERY_KEY = ["budgets"];

export function useLinkTransactionToBudget() {
  const queryClient = useQueryClient();

  return useMutation<
    LinkTransactionToBudgetResponse,
    Error,
    LinkTransactionToBudgetRequest
  >({
    mutationFn: queryFunctionFactory<
      LinkTransactionToBudgetRequest,
      LinkTransactionToBudgetResponse
    >("link_transaction_to_budget"),
    onSuccess: () => {
      // Invalidate both transactions and budgets to refresh lists
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: BUDGETS_QUERY_KEY });
    },
  });
}

export function useUnlinkTransactionFromBudget() {
  const queryClient = useQueryClient();

  return useMutation<
    UnlinkTransactionFromBudgetResponse,
    Error,
    UnlinkTransactionFromBudgetRequest
  >({
    mutationFn: queryFunctionFactory<
      UnlinkTransactionFromBudgetRequest,
      UnlinkTransactionFromBudgetResponse
    >("unlink_transaction_from_budget"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: TRANSACTIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: BUDGETS_QUERY_KEY });
    },
  });
}
```

## Phase 6: Frontend - Transaction List Manual Linking

### Update `src/pages/Transactions/index.tsx`

Add budget link display and edit functionality:

```typescript
import {
  useLinkTransactionToBudget,
  useUnlinkTransactionFromBudget,
} from "@/hooks/useTransactionBudgetLinks";

function TransactionRow({ transaction }: { transaction: any }) {
  const linkMutation = useLinkTransactionToBudget();
  const unlinkMutation = useUnlinkTransactionFromBudget();
  const [isEditingLink, setIsEditingLink] = useState(false);

  const data = useSelector((state: ReduxState) => state.value);
  const budgetEntries = data?.extra?.group?.budgetEntries || [];
  const budgets = data?.extra?.group?.budgets || [];

  const budgetIdToName = new Map(
    budgets.map(b => [b.budgetId, b.name])
  );

  const handleLinkChange = async (budgetEntryId: string) => {
    if (budgetEntryId === "") {
      // Unlink
      await unlinkMutation.mutateAsync({
        transactionId: transaction.transactionId,
      });
    } else {
      // Link or update
      await linkMutation.mutateAsync({
        transactionId: transaction.transactionId,
        budgetEntryId,
      });
    }
    setIsEditingLink(false);
  };

  // Get budget name from budgetLink
  const linkedBudgetName = transaction.budgetLink
    ? budgetIdToName.get(transaction.budgetLink.budgetId)
    : null;

  return (
    <tr>
      {/* ... existing columns */}

      <td>
        {isEditingLink ? (
          <select
            value={transaction.budgetLink?.budgetEntryId || ""}
            onChange={(e) => handleLinkChange(e.target.value)}
            onBlur={() => setIsEditingLink(false)}
            data-test-id="transaction-budget-link-selector"
          >
            <option value="">None</option>
            {/* Group by budget category */}
            {Array.from(new Set(budgetEntries.map(e => e.budgetId))).map(budgetId => {
              const categoryName = budgetIdToName.get(budgetId);
              const entries = budgetEntries.filter(e => e.budgetId === budgetId);
              return (
                <optgroup key={budgetId} label={categoryName}>
                  {entries.map((entry) => (
                    <option key={entry.budgetEntryId} value={entry.budgetEntryId}>
                      {entry.description} (${entry.amount})
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        ) : (
          <div
            onClick={() => setIsEditingLink(true)}
            className="budget-link-cell"
            data-test-id="transaction-budget-link-display"
          >
            {transaction.budgetLink ? (
              <span className="budget-link">
                {linkedBudgetName}: {transaction.budgetLink.budgetEntryDescription}
              </span>
            ) : (
              <span className="no-budget-link">Click to link</span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
```

### Update `src/components/TransactionCard/index.tsx`

Add budget link display for mobile view:

```typescript
export function TransactionCard({ transaction }: Props) {
  const data = useSelector((state: ReduxState) => state.value);
  const budgets = data?.extra?.group?.budgets || [];

  const budgetIdToName = new Map(
    budgets.map(b => [b.budgetId, b.name])
  );

  const linkedBudgetName = transaction.budgetLink
    ? budgetIdToName.get(transaction.budgetLink.budgetId)
    : null;

  return (
    <div className="transaction-card">
      {/* ... existing fields */}

      {transaction.budgetLink && (
        <div className="transaction-budget-link">
          <strong>Budget:</strong> {linkedBudgetName} - {transaction.budgetLink.budgetEntryDescription}
        </div>
      )}
    </div>
  );
}
```

## Phase 7: Frontend - Budget List Manual Linking

### Update or Create Budget List Page

If budget list page doesn't exist, this needs to be created. If it exists, add linking functionality:

```typescript
// src/pages/Budgets/BudgetList.tsx (or similar)
import {
  useLinkTransactionToBudget,
  useUnlinkTransactionFromBudget,
} from "@/hooks/useTransactionBudgetLinks";

function BudgetEntryRow({ budgetEntry }: { budgetEntry: any }) {
  const linkMutation = useLinkTransactionToBudget();
  const unlinkMutation = useUnlinkTransactionFromBudget();
  const [isEditingLink, setIsEditingLink] = useState(false);

  const data = useSelector((state: ReduxState) => state.value);
  const transactions = data?.extra?.transactions || [];

  const handleLinkChange = async (transactionId: string) => {
    if (transactionId === "") {
      // Unlink - need to find the current transaction ID
      if (budgetEntry.transactionLink) {
        await unlinkMutation.mutateAsync({
          transactionId: budgetEntry.transactionLink.transactionId,
        });
      }
    } else {
      // Link or update
      await linkMutation.mutateAsync({
        transactionId,
        budgetEntryId: budgetEntry.budgetEntryId,
      });
    }
    setIsEditingLink(false);
  };

  return (
    <tr>
      {/* ... existing budget entry columns */}

      <td>
        {isEditingLink ? (
          <select
            value={budgetEntry.transactionLink?.transactionId || ""}
            onChange={(e) => handleLinkChange(e.target.value)}
            onBlur={() => setIsEditingLink(false)}
            data-test-id="budget-transaction-link-selector"
          >
            <option value="">None</option>
            {transactions.map((tx) => (
              <option key={tx.transactionId} value={tx.transactionId}>
                {tx.description} (${tx.amount}) - {tx.createdAt}
              </option>
            ))}
          </select>
        ) : (
          <div
            onClick={() => setIsEditingLink(true)}
            className="transaction-link-cell"
            data-test-id="budget-transaction-link-display"
          >
            {budgetEntry.transactionLink ? (
              <span className="transaction-link">
                {budgetEntry.transactionLink.transactionDescription} (${budgetEntry.transactionLink.transactionAmount})
              </span>
            ) : (
              <span className="no-transaction-link">Click to link</span>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
```

## Phase 8: Backend Testing

### Create `cf-worker/src/tests/transaction-budget-links.test.ts`

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "../db";
import {
  linkTransactionToBudget,
  unlinkTransactionFromBudget,
  getTransactionsWithBudgetLinks,
  getBudgetEntriesWithTransactionLinks,
} from "../handlers/transaction-budget-links";

describe("Transaction Budget Links", () => {
  let db: ReturnType<typeof getDb>;
  let testTransactionId: string;
  let testBudgetEntryId: string;
  let testUserId: string;
  let testGroupId: string;

  beforeEach(async () => {
    // Setup test data
    // ... create test transaction, budget entry, user, group
  });

  describe("linkTransactionToBudget", () => {
    it("should create new link successfully", async () => {
      const result = await linkTransactionToBudget(
        {
          transactionId: testTransactionId,
          budgetEntryId: testBudgetEntryId,
        },
        testUserId,
        testGroupId,
        db,
      );

      expect(result.success).toBe(true);
      expect(result.link).toBeDefined();
      expect(result.link?.transactionId).toBe(testTransactionId);
      expect(result.link?.budgetEntryId).toBe(testBudgetEntryId);
    });

    it("should update existing link (one-to-one)", async () => {
      // Create first link
      await linkTransactionToBudget(
        {
          transactionId: testTransactionId,
          budgetEntryId: testBudgetEntryId,
        },
        testUserId,
        testGroupId,
        db,
      );

      // Update to different budget entry
      const newBudgetEntryId = "new_budget_entry_id";
      const result = await linkTransactionToBudget(
        {
          transactionId: testTransactionId,
          budgetEntryId: newBudgetEntryId,
        },
        testUserId,
        testGroupId,
        db,
      );

      expect(result.success).toBe(true);
      expect(result.link?.budgetEntryId).toBe(newBudgetEntryId);

      // Verify only one link exists
      const links = await getTransactionsWithBudgetLinks(testGroupId, db);
      const transactionLinks = links.filter(
        l => l.transaction.transactionId === testTransactionId
      );
      expect(transactionLinks.length).toBe(1);
    });

    it("should reject invalid transaction", async () => {
      const result = await linkTransactionToBudget(
        {
          transactionId: "invalid_id",
          budgetEntryId: testBudgetEntryId,
        },
        testUserId,
        testGroupId,
        db,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should reject invalid budget entry", async () => {
      const result = await linkTransactionToBudget(
        {
          transactionId: testTransactionId,
          budgetEntryId: "invalid_id",
        },
        testUserId,
        testGroupId,
        db,
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("unlinkTransactionFromBudget", () => {
    beforeEach(async () => {
      // Create link
      await linkTransactionToBudget(
        {
          transactionId: testTransactionId,
          budgetEntryId: testBudgetEntryId,
        },
        testUserId,
        testGroupId,
        db,
      );
    });

    it("should remove link successfully", async () => {
      const result = await unlinkTransactionFromBudget(
        { transactionId: testTransactionId },
        testUserId,
        testGroupId,
        db,
      );

      expect(result.success).toBe(true);

      // Verify link removed
      const links = await getTransactionsWithBudgetLinks(testGroupId, db);
      const transactionLinks = links.filter(
        l => l.transaction.transactionId === testTransactionId
      );
      expect(transactionLinks[0].budgetLink).toBeNull();
    });

    it("should succeed even if no link exists", async () => {
      // Remove once
      await unlinkTransactionFromBudget(
        { transactionId: testTransactionId },
        testUserId,
        testGroupId,
        db,
      );

      // Remove again (idempotent)
      const result = await unlinkTransactionFromBudget(
        { transactionId: testTransactionId },
        testUserId,
        testGroupId,
        db,
      );

      expect(result.success).toBe(true);
    });
  });

  describe("Dashboard auto-linking", () => {
    it("should auto-link when both expense and budget created", async () => {
      // Simulate dashboard submission with both expense and budget
      const result = await handleDashboardSubmission(
        {
          addExpense: true,
          updateBudget: true,
          // ... other required fields
        },
        testUserId,
        testGroupId,
        db,
      );

      expect(result.success).toBe(true);
      expect(result.transactionId).toBeDefined();
      expect(result.budgetEntryId).toBeDefined();
      expect(result.linkedAutomatically).toBe(true);

      // Verify link exists
      const links = await getTransactionsWithBudgetLinks(testGroupId, db);
      const link = links.find(
        l => l.transaction.transactionId === result.transactionId
      );
      expect(link?.budgetLink).toBeDefined();
      expect(link?.budgetLink?.budgetEntryId).toBe(result.budgetEntryId);
    });

    it("should not auto-link when only expense created", async () => {
      const result = await handleDashboardSubmission(
        {
          addExpense: true,
          updateBudget: false,
          // ... other required fields
        },
        testUserId,
        testGroupId,
        db,
      );

      expect(result.transactionId).toBeDefined();
      expect(result.budgetEntryId).toBeUndefined();
      expect(result.linkedAutomatically).toBe(false);
    });
  });

  describe("getTransactionsWithBudgetLinks", () => {
    it("should return transactions with budget data", async () => {
      await linkTransactionToBudget(
        {
          transactionId: testTransactionId,
          budgetEntryId: testBudgetEntryId,
        },
        testUserId,
        testGroupId,
        db,
      );

      const results = await getTransactionsWithBudgetLinks(testGroupId, db);

      const linkedTransaction = results.find(
        r => r.transaction.transactionId === testTransactionId
      );

      expect(linkedTransaction).toBeDefined();
      expect(linkedTransaction?.budgetLink).toBeDefined();
      expect(linkedTransaction?.budgetEntry).toBeDefined();
    });

    it("should return transactions without budget links", async () => {
      const results = await getTransactionsWithBudgetLinks(testGroupId, db);

      const unlinkedTransaction = results.find(
        r => r.transaction.transactionId === testTransactionId
      );

      expect(unlinkedTransaction).toBeDefined();
      expect(unlinkedTransaction?.budgetLink).toBeNull();
    });
  });

  describe("getBudgetEntriesWithTransactionLinks", () => {
    it("should return budget entries with transaction data", async () => {
      await linkTransactionToBudget(
        {
          transactionId: testTransactionId,
          budgetEntryId: testBudgetEntryId,
        },
        testUserId,
        testGroupId,
        db,
      );

      const results = await getBudgetEntriesWithTransactionLinks(testGroupId, db);

      const linkedBudgetEntry = results.find(
        r => r.budgetEntry.budgetEntryId === testBudgetEntryId
      );

      expect(linkedBudgetEntry).toBeDefined();
      expect(linkedBudgetEntry?.transactionLink).toBeDefined();
      expect(linkedBudgetEntry?.transaction).toBeDefined();
    });
  });
});
```

### Run Backend Tests
```bash
cd cf-worker
yarn test
yarn lint
```

## Phase 9: Frontend Testing

### Unit Tests: `src/hooks/useTransactionBudgetLinks.test.ts`

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  useLinkTransactionToBudget,
  useUnlinkTransactionFromBudget,
} from "./useTransactionBudgetLinks";

describe("useTransactionBudgetLinks", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  it("should link transaction to budget entry", async () => {
    const { result } = renderHook(() => useLinkTransactionToBudget(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    result.current.mutate({
      transactionId: "tx123",
      budgetEntryId: "be456",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  // ... more tests
});
```

### E2E Tests: `src/e2e/tests/transaction-budget-links.spec.ts`

```typescript
import { test, expect } from "@playwright/test";

test.describe("Transaction Budget Links", () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto("/login");
    // ... perform login
  });

  test("should auto-link when creating both expense and budget", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Check both checkboxes
    await page.check('[data-test-id="add-expense-checkbox"]');
    await page.check('[data-test-id="update-budget-checkbox"]');

    // Fill expense form
    await page.fill('[data-test-id="description-input"]', "Test expense");
    await page.fill('[data-test-id="amount-input"]', "100");

    // Fill budget form
    await page.selectOption('[data-test-id="budget-category-select"]', { label: "Groceries" });

    // Submit
    await page.click('[data-test-id="submit-button"]');
    await expect(page.locator('[data-test-id="success-container"]')).toContainText("linked automatically");

    // Verify link in transactions list
    await page.goto("/transactions");
    const row = page.locator("tr", { hasText: "Test expense" });
    await expect(row.locator('[data-test-id="transaction-budget-link-display"]')).toContainText("Groceries");
  });

  test("should manually link transaction from transaction list", async ({ page }) => {
    // Create unlinked transaction
    // ... create transaction without budget

    await page.goto("/transactions");

    // Find transaction row
    const row = page.locator("tr", { hasText: "Unlinked expense" });

    // Click to edit link
    await row.locator('[data-test-id="transaction-budget-link-display"]').click();

    // Select budget entry
    await row.locator('[data-test-id="transaction-budget-link-selector"]').selectOption({ label: /Test Budget Entry/ });

    // Verify linked
    await expect(row.locator('[data-test-id="transaction-budget-link-display"]')).toContainText("Test Budget Entry");
  });

  test("should manually link transaction from budget list", async ({ page }) => {
    // Create unlinked budget entry
    // ... create budget entry

    await page.goto("/budgets");

    // Find budget entry row
    const row = page.locator("tr", { hasText: "Test Budget Entry" });

    // Click to edit link
    await row.locator('[data-test-id="budget-transaction-link-display"]').click();

    // Select transaction
    await row.locator('[data-test-id="budget-transaction-link-selector"]').selectOption({ label: /Test expense/ });

    // Verify linked
    await expect(row.locator('[data-test-id="budget-transaction-link-display"]')).toContainText("Test expense");
  });

  test("should unlink transaction", async ({ page }) => {
    // Create linked transaction
    // ...

    await page.goto("/transactions");

    const row = page.locator("tr", { hasText: "Linked expense" });
    await row.locator('[data-test-id="transaction-budget-link-display"]').click();
    await row.locator('[data-test-id="transaction-budget-link-selector"]').selectOption({ label: "None" });

    await expect(row.locator('[data-test-id="transaction-budget-link-display"]')).toContainText("Click to link");
  });
});
```

### Run Frontend Tests
```bash
yarn test  # Unit tests
yarn test:e2e  # E2E tests
yarn lint
```

## Phase 10: Documentation

### Update `docs/database.md`

Add documentation for new table:

```markdown
## transaction_budget_links

Links transactions to budget entries (one-to-one relationship).

**Columns:**
- `transaction_id` (TEXT, PRIMARY KEY): Foreign key to transactions.transactionId
- `budget_entry_id` (TEXT, NOT NULL): Foreign key to budget_entries.budgetEntryId
- `linked_at` (TEXT, NOT NULL): Timestamp when link was created
- `linked_by_user_id` (TEXT, NOT NULL): User who created the link

**Relationships:**
- One transaction → maximum one budget entry
- One budget entry can be linked to many transactions
- Budget category derived from budget_entries.budgetId

**Indexes:**
- PRIMARY KEY on transaction_id enforces one-to-one from transaction side
- `idx_transaction_budget_links_budget_entry` on budget_entry_id
- `idx_transaction_budget_links_user` on linked_by_user_id

**Cascade Behavior:**
- DELETE transaction → DELETE link (cascade)
- DELETE budget_entry → DELETE link (cascade)
- DELETE user → RESTRICT (preserves audit trail)
```

### Update `docs/api.md`

Add new endpoint documentation:

```markdown
## POST /.netlify/functions/link_transaction_to_budget

Links a transaction to a budget entry (one-to-one).

**Request Body:**
```json
{
  "transactionId": "tx_123",
  "budgetEntryId": "be_456"
}
```

**Response:**
```json
{
  "success": true,
  "link": {
    "transactionId": "tx_123",
    "budgetEntryId": "be_456",
    "linkedAt": "2024-01-15 10:30:00.000",
    "linkedByUserId": "user_1"
  }
}
```

## POST /.netlify/functions/unlink_transaction_from_budget

Removes budget link from transaction.

**Request Body:**
```json
{
  "transactionId": "tx_123"
}
```

**Response:**
```json
{
  "success": true
}
```

## Dashboard Submission Response

When creating both expense and budget, response includes auto-linking info:

```json
{
  "success": true,
  "transactionId": "tx_123",
  "budgetEntryId": "be_456",
  "linkedAutomatically": true
}
```
```

### Create `docs/transaction-budget-links.md`

```markdown
# Transaction-Budget Links Feature

## Overview
Allows users to link expenses (transactions) to specific budget entries. This creates a connection between spending and budget tracking, enabling better financial analysis.

## Key Concepts

### One-to-One Relationship
- Each transaction can link to maximum ONE budget entry
- This keeps the feature simple and prevents ambiguous categorization
- Links can be updated/replaced but not duplicated

### Budget Category Derivation
- Budget category is NOT stored in the link
- Category is derived from the linked budget entry's `budgetId`
- This ensures consistency when budget entries are renamed/reorganized

### Optional Feature
- Linking is completely optional
- Transactions can exist without budget links
- Unlinked transactions are still valid and functional

## User Workflows

### Automatic Linking on Dashboard
1. User checks BOTH "Add Expense" and "Update Budget" checkboxes
2. Fills expense form (description, amount, etc.)
3. Fills budget form (category, amount, etc.)
4. Submits form
5. System creates both transaction and budget entry
6. **Automatically links them together**
7. Success message indicates auto-linking occurred

### Manual Linking from Transaction List
1. User navigates to Transactions page
2. Sees "Budget" column in transaction table
3. Clicks on budget link cell
4. Dropdown appears with all budget entries (grouped by category)
5. Selects budget entry or "None" to unlink
6. Link updated automatically

### Manual Linking from Budget List
1. User navigates to Budgets page
2. Sees "Transaction" column in budget entries table
3. Clicks on transaction link cell
4. Dropdown appears with all transactions
5. Selects transaction or "None" to unlink
6. Link updated automatically

### Viewing Linked Data
- Transaction list shows budget entry description and category
- Budget list shows linked transaction description and amount
- Transaction card (mobile) displays budget link if present
- Budget category name derived from group budgets

## Technical Implementation

### Database Schema
- New table: `transaction_budget_links`
- Primary key on `transaction_id` enforces one-to-one
- Foreign keys with CASCADE deletes for referential integrity

### API Endpoints
- `link_transaction_to_budget`: Create or update link
- `unlink_transaction_from_budget`: Remove link
- Dashboard submission returns both IDs when both created
- Transaction/budget fetch includes link data

### Frontend Components
- Dashboard form: Detects when both checkboxes selected
- Transaction list: Inline editing of budget links with dropdowns
- Budget list: Inline editing of transaction links with dropdowns
- Transaction card: Displays budget info when linked

## Benefits

1. **Automatic Linking**: When creating both at once, no extra work needed
2. **Better Budget Tracking**: See which expenses consume budget entries
3. **Simplified Categorization**: Category derived automatically from budget
4. **Flexible Manual Control**: Link/unlink anytime from two different pages
5. **Performance**: Indexed lookups for fast queries
6. **Data Integrity**: Foreign keys prevent orphaned links

## Future Enhancements

- Filter transactions by budget category
- Budget consumption reports (% used)
- Bulk link multiple transactions
- Auto-suggest budget entries based on description
- Analytics: spending patterns by budget category
```

### Update `docs/migration-changelog.md`

```markdown
## Migration 00XX: Create transaction_budget_links Table (2024-XX-XX)

### Purpose
Enable linking transactions to budget entries for better expense categorization and budget tracking.

### Changes
- Created new table `transaction_budget_links` with one-to-one relationship
- Added foreign keys to transactions, budget_entries, and user tables
- Created indexes for performance

### Features Enabled
- Automatic linking when creating both expense and budget on Dashboard
- Manual linking from Transaction list page
- Manual linking from Budget list page
- View linked data in both transaction and budget lists

### Data Migration
No data migration required (new feature).

### Rollback
To rollback, drop the table:
```sql
DROP TABLE IF EXISTS transaction_budget_links;
```

### Testing
- Verified one-to-one constraint enforcement
- Tested cascade deletes
- Validated foreign key constraints
- Tested auto-linking on dashboard
- Tested manual linking from both pages
- All 185+ tests passing
```

## Phase 11: Deployment

### Pre-Deployment Checklist
- [ ] All backend tests passing (`cd cf-worker && yarn test`)
- [ ] All frontend unit tests passing (`yarn test`)
- [ ] All E2E tests passing (`yarn test:e2e`)
- [ ] Lint passing for both frontend and backend
- [ ] Database migration tested locally (`yarn db:migrate:local`)
- [ ] Documentation updated (database.md, api.md, transaction-budget-links.md, migration-changelog.md)

### Deployment Steps

1. **Deploy Database Migration (Dev)**
```bash
cd cf-worker
yarn db:migrate:dev
yarn db:studio  # Verify migration applied
```

2. **Deploy Backend (Dev)**
```bash
cd cf-worker
yarn deploy:dev  # Includes build, tests, deploy
```

3. **Test in Dev Environment**
- Create expense + budget together (verify auto-linking)
- Manually link transaction from transaction list
- Manually link transaction from budget list
- Unlink transaction
- Verify cascade deletes work

4. **Deploy Database Migration (Prod)**
```bash
cd cf-worker
yarn db:migrate:prod
```

5. **Deploy Backend (Prod)**
```bash
cd cf-worker
yarn deploy:prod
```

6. **Deploy Frontend**
- Frontend auto-deploys via Netlify on main branch merge
- Monitor deployment logs

7. **Post-Deployment Verification**
- Test auto-linking in production (create expense + budget)
- Test manual linking from transaction list
- Test manual linking from budget list
- Check error logging for issues

## Success Criteria

1. ✅ When creating both expense AND budget on Dashboard, they are automatically linked
2. ✅ Users can manually link transactions to budget entries from Transaction list
3. ✅ Users can manually link transactions to budget entries from Budget list
4. ✅ Users can unlink transactions from both pages
5. ✅ One-to-one relationship enforced (one transaction → one budget entry max)
6. ✅ Budget category derived from budget entry
7. ✅ Links are optional (transactions/budgets work without them)
8. ✅ Cascade deletes prevent orphaned links
9. ✅ All tests passing (backend, frontend, E2E)
10. ✅ Documentation complete and accurate
11. ✅ Mobile-friendly UI
12. ✅ No breaking changes to existing functionality

## Timeline: 28-36 hours (3.5-4.5 days)

**Breakdown:**
- Phase 1: Database Schema (2-3 hours)
- Phase 2: Shared Types (1-2 hours)
- Phase 3: Backend API (4-5 hours)
- Phase 4: Dashboard Auto-Linking (2-3 hours)
- Phase 5: React Query Hooks (2 hours)
- Phase 6: Transaction List Manual Linking (3-4 hours)
- Phase 7: Budget List Manual Linking (3-4 hours)
- Phase 8: Backend Testing (5-6 hours)
- Phase 9: Frontend Testing (5-6 hours)
- Phase 10: Documentation (2-3 hours)
- Phase 11: Deployment & Verification (2 hours)

## Next Steps After Completion

1. Monitor production usage and errors
2. Gather user feedback on UX
3. Consider future enhancements:
   - Budget consumption analytics
   - Auto-suggest budget entries
   - Filter transactions by budget category
   - Bulk linking operations
4. Update user documentation/help guides
