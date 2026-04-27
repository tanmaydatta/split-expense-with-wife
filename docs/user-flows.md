# User Flows

What users can do in the app and how, from their perspective.

## App Overview

Split Expense is a web app for couples/groups to track shared expenses, manage budgets, and automate recurring transactions. It works on desktop and mobile browsers.

---

## 1. Authentication

### Sign Up
1. User lands on the marketing page at `/` — sees hero text, feature grid, CTA buttons
2. Clicks "Get Started Free" or "Sign Up" → navigates to `/signup`
3. Fills out 6 fields: First Name, Last Name, Username, Email, Password, Confirm Password
   - Password must be 6+ characters
   - Confirm Password must match
4. Clicks "Create Account"
5. On success → redirected to `/login` with message "Account created successfully! Please log in."
6. On error → red error box shows (e.g., "username already exists")

**Note:** Sign-up is disabled in production (blocked at the API level). New users are created by the admin.

### Login
1. User visits `/login`
2. Enters Username/Email and Password
3. Clicks "Login"
4. On success → redirected to `/` (Dashboard) as authenticated user
5. On error → red error box: "Invalid credentials. Please try again."
6. Loading state: full-page spinner during authentication

### Logout
1. Click "Logout" in sidebar (bottom)
2. Session cleared, localStorage wiped, redirected to `/login`

### Session Expiry
- If any API call returns 401, the app automatically logs the user out and redirects to `/login`

---

## 2. Navigation

### Desktop Layout
- Fixed dark sidebar (250px) on the left with navigation links
- "Welcome [FirstName]" header at top of sidebar
- Main content area on the right

### Mobile Layout (< 768px)
- Hamburger menu icon in header bar
- Tapping it slides the sidebar in from the left with a dark overlay
- Sidebar closes automatically when a link is tapped
- Header shows current page title

### Sidebar Links
| Link | Destination | Description |
|------|-------------|-------------|
| Add | `/` | Dashboard — create expenses/budget entries |
| Expenses | `/expenses` | Transaction history |
| Balances | `/balances` | Who owes whom |
| Budget | `/budget` | Budget tracking |
| Monthly Budget | `/monthly-budget` | Budget charts/analytics |
| Scheduled Actions | `/scheduled-actions` | Recurring automations |
| Settings | `/settings` | Group configuration |
| Logout | — | Ends session |

Active page is highlighted in the sidebar.

---

## 3. Dashboard — Adding Expenses & Budget Entries (`/`)

The main form for day-to-day use. Supports two actions simultaneously: adding an expense and/or updating a budget. When both are selected, the submit is **atomic** — a single API call (`/dashboard_submit`) creates the expense, the budget entry, and a link between them. Either both are saved or neither is.

### Form Fields (always visible)
| Field | Type | Validation |
|-------|------|------------|
| Description | Text | 2–100 characters, required |
| Amount | Number | 0.01–999999, 2 decimal places, required |
| Currency | Dropdown | From group currencies, default: group default currency |

### Action Toggles
Two checkboxes control which sections appear:
- **"Add Expense"** — shows expense-specific fields
- **"Update Budget"** — shows budget-specific fields

Both can be checked simultaneously to create an expense AND a budget entry in one atomic submit. The amounts and currencies must match.

### When "Add Expense" is checked
| Field | Type | Notes |
|-------|------|-------|
| Paid By | Dropdown | Select which group member paid. Shows first names. |
| Split Percentages | Number per user | One field per group member. Must total 100%. Pre-filled from group defaults. |

### When "Update Budget" is checked
| Field | Type | Notes |
|-------|------|-------|
| Credit / Debit | Toggle | Credit adds to budget, Debit subtracts |
| Budget | Dropdown | Select which budget category |

### Submitting
- Click green "Submit" button
- Shows "Processing..." while submitting
- On success: green success message appears, form stays open for additional entries
- On error: red error message with details; if the backend rejects the request, nothing is saved

### Typical Flows
- **"We just bought groceries for $50, I paid"** → Enter description, amount, select currency, check "Add Expense", select yourself as Paid By, split 50/50, submit
- **"Add $200 salary credit to our joint budget"** → Enter description, amount, check "Update Budget", select Credit, pick budget, submit
- **"Bought dinner for $80, also track in food budget"** → Check both toggles, fill all fields, submit once — expense and budget entry are created atomically with a link between them

---

## 4. Expenses / Transactions (`/expenses`)

### What You See
- **Desktop:** Table with columns: Date, Description, Amount (with currency symbol), Your Share (color-coded)
- **Mobile:** Card layout with the same info per card
- A link icon (🔗) appears on rows/cards that have a linked budget entry

### Color Coding
- **Green** amount → you are owed money (positive share)
- **Red** amount → you owe money (negative share)
- **Gray** → no amount owed (zero share)

### Expanding a Transaction
Click/tap any row or card to expand it. Expanded view shows:
- Full description
- **Amount owed:** Breakdown by user with amounts
- **Paid by:** Who paid and how much
- **Net result:** "You are owed +$X.XX" (green) / "You owe -$X.XX" (red) / "No amount owed" (gray)
- **"View linked budget entry"** link when a linked budget entry exists → navigates to `/budget-entry/:id`

### Transaction Detail Page (`/transaction/:id`)
Full detail view for a single transaction:
- All split information (paid by, owed amounts, per-user breakdown)
- Linked budget entry card when a link exists, with a "View linked budget entry" button → `/budget-entry/:id`

### Deleting a Transaction
- Click the red trash icon on any row/card
- Transaction is soft-deleted, and any linked budget entry is also soft-deleted automatically (cascade)
- Green success message: "Transaction deleted successfully"
- Balances update automatically; the linked budget entry disappears from budget history

### Pagination
- Loads initial page of transactions
- "Show more" button at the bottom loads the next page (infinite scroll pattern)
- Shows "No transactions" when empty

---

## 5. Balances (`/balances`)

### What You See
Read-only page showing who owes whom, grouped by person.

For each group member, shows an amount grid:
```
Partner Name
  USD:  +$450.50  (green — they owe you)
  GBP:  -£200.00  (red — you owe them)
```

### Color Coding
- **Green** → the other person owes you
- **Red** → you owe the other person

### States
- Loading spinner while fetching
- "No balances to display" when all balances are zero
- Error message if fetch fails

No user actions on this page — purely informational.

---

## 6. Budget (`/budget`)

### Budget Summary
Top card shows "Budget left" with remaining amounts per currency for the selected budget.

### Budget Selector
Dropdown to switch between budget categories (e.g., "Food", "Entertainment", "Savings").

### Monthly View Link
"View Monthly Budget Breakdown" button → navigates to `/monthly-budget/{budgetName}` for chart analytics.

### Budget History
Table/list of all entries for the selected budget:
- Date, Description, Amount, Currency
- A link icon (🔗) appears on entries that have a linked expense transaction
- Click to expand for details; expanded view shows a "View linked transaction" link when a link exists → `/transaction/:id`
- Red trash icon to delete entries
- "Show more" for pagination

### Budget Entry Detail Page (`/budget-entry/:id`)
Full detail view for a single budget entry:
- Amount, description, date, currency, budget category
- Linked transaction card when a link exists, with a "View linked transaction" button → `/transaction/:id`

### Deleting a Budget Entry
- Click the red trash icon
- Budget entry is soft-deleted, and any linked transaction (and its transaction_users) is also soft-deleted automatically (cascade)
- Balances update automatically; the linked transaction disappears from the expenses list

### Typical Flow
1. Select "Food" budget from dropdown
2. See current balance: "USD: $1,500 remaining"
3. Scroll through history of food expenses — entries with a 🔗 icon were created alongside an expense
4. Click "View Monthly Budget Breakdown" to see spending trends

---

## 7. Monthly Budget Charts (`/monthly-budget`)

### Controls
| Control | Options | Purpose |
|---------|---------|---------|
| Time Range | 6M, 1Y, 2Y, All | Filter chart time window |
| Currency | USD, GBP, EUR, etc. | Filter by currency |
| Budget | Dropdown | Select which budget to chart |

### Chart
- Bar/line chart (Recharts) showing monthly spending over time
- X-axis: months, Y-axis: amounts in selected currency
- Average expense line/indicator overlaid
- Responsive — adjusts to screen size

### States
- "Loading monthly budget data..." while fetching
- "No monthly budget data available for the selected period." when empty

---

## 8. Settings (`/settings`)

### Group Information
- **Group Name** text input — editable, required

### Default Currency
- Dropdown to set the group's default currency

### Default Share Percentages
- One number input per group member (0–100, 2 decimal places)
- Shows "Total: XX.XX%" below
  - **Green** when total = 100%
  - **Red** when total ≠ 100%
- These defaults pre-fill the split fields on the Dashboard

### Budget Categories
- List of existing budgets with "Remove" button each
- "Add New Budget" form:
  - Budget Name (required)
  - Description (optional)
  - "Add Budget" button
- Removing a budget soft-deletes it; re-adding the same name resurrects it

### Saving
- **"Save All Changes"** button at the bottom
- Disabled if: no changes made, loading, or percentages don't total 100%
- On success: green "Settings saved successfully" message

---

## 9. Scheduled Actions

Automate recurring expenses or budget entries (e.g., monthly rent, weekly grocery budget).

### List Page (`/scheduled-actions`)

Shows all scheduled actions as cards:
- **Status dot:** green (active) or red (paused)
- **Description:** e.g., "Monthly Rent"
- **Metadata:** Frequency (DAILY/WEEKLY/MONTHLY) • Type (Add Expense/Add to Budget) • Next execution date

**Card actions:**
| Icon | Action |
|------|--------|
| Play/Pause | Toggle active/paused status |
| Pencil | Edit the action |
| Trash | Delete (with confirmation dialog) |
| Click card body | View execution history |

**"Add Action"** button in header → create new action.

Infinite scroll loads more actions.

### Creating an Action (`/scheduled-actions/new`)

**Step 1: Choose Action Type** (toggle)
- "Add Expense" or "Add to Budget"

**Step 2: Set Frequency** (toggle)
- Daily, Weekly, or Monthly

**Step 3: Set Start Date** (date picker)
- Cannot be in the past (minimum: today)

**Step 4: Fill Action Details**

For **Add Expense:**
| Field | Notes |
|-------|-------|
| Description | 2–100 chars |
| Amount | Min 0.01 |
| Currency | From group currencies |
| Paid By | Select group member |
| Split Percentages | Per-user, should total 100% |

For **Add to Budget:**
| Field | Notes |
|-------|-------|
| Description | 2–100 chars |
| Amount | Min 0.01 |
| Currency | From group currencies |
| Credit/Debit | Toggle |
| Budget | Select from available budgets |

**Step 5:** Click "Create" → action is saved and will execute on schedule.

### Editing an Action (`/scheduled-actions/:id/edit`)

Same form as creation, except:
- **Action Type is locked** (can't change expense ↔ budget)
- **Start Date is locked**
- Everything else is editable
- Button says "Save" instead of "Create"

### Action History (`/scheduled-actions/:id`)

Shows the execution log for a single action:

**Upcoming Run card:**
- Next execution date
- **"Run now"** button — trigger immediate execution
- **"Skip next"** button — skip the next scheduled run
- **Custom date** picker + "Set date" — manually override next run date

**History list:**
Each entry shows:
- Execution date/time
- Status dot: green (success), red (failed), orange (started/running)
- Click to view full details

### Run Details (`/scheduled-actions/history/run/:historyId`)

Full details of a single execution:
- **Execution info:** ID, status, timestamp, error message (if failed)
- **Action data:** Type, description, amount, currency
  - For expenses: Paid by (name), split percentages per user
  - For budgets: Budget name, credit/debit type

---

## 10. Complete User Journey Example

**New couple setting up the app:**
1. Admin creates accounts for both users
2. User logs in → lands on Dashboard
3. Goes to Settings:
   - Names the group "Home"
   - Sets default currency to USD
   - Sets default split to 50/50
   - Creates budgets: "Groceries", "Rent", "Entertainment"
   - Saves
4. Back to Dashboard:
   - Adds first expense: "Dinner out" $60, paid by User A, split 50/50
   - Adds budget entry: "Monthly rent" $2000 Credit to "Rent" budget
5. Checks Balances → sees User B owes User A $30
6. Goes to Scheduled Actions:
   - Creates monthly recurring: "Rent" expense, $2000, paid by User A, 50/50 split
   - Creates monthly recurring: "Rent budget credit" $2000 Credit to Rent budget
7. Over time:
   - Daily: adds expenses from Dashboard
   - Weekly: checks Balances to settle up
   - Monthly: reviews Monthly Budget charts for spending trends
   - Automated: rent expenses and budget credits happen automatically on schedule

---

## 11. Mobile-Specific Behaviors

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Navigation | Fixed sidebar always visible | Hamburger menu, slide-in sidebar |
| Transaction list | Table with columns | Card layout |
| Forms | Side-by-side where applicable | Stacked vertically |
| Buttons | Inline | Full-width, 44px min touch target |
| Charts | Wide with margins | Adjusted margins, scrollable |
| Font size | Standard | 16px minimum on inputs (prevents iOS zoom) |

---

## 12. Error Patterns (What Users See)

| Scenario | What Happens |
|----------|-------------|
| Invalid login | Red box: "Invalid credentials. Please try again." |
| Session expired | Auto-logout, redirect to login |
| Network error | Red error box with message, close button |
| Validation error | Red error below field or at top of form |
| Delete confirmation | Modal dialog: "Are you sure?" with Confirm/Cancel |
| Success feedback | Green box with message, auto-dismissible |
| Empty data | Friendly message: "No transactions", "No history yet", etc. |
| Loading | Full-page spinner or inline "Loading..." text |
