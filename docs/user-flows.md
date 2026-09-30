# User Flows

What users can do in the app and how, from their perspective.

## App Overview

Split Expense is a web app for couples/groups to track shared expenses, manage budgets, and automate recurring transactions. It works on desktop and mobile browsers.

---

## 1. Authentication

### Sign Up
1. User lands on the marketing page at `/` — sees a short product introduction, an explicitly labelled example split, feature cards, and account links
2. Clicks "Create account" → navigates to `/signup`
3. Fills out 6 fields: First Name, Last Name, Username, Email, Password, Confirm Password
   - Password must be 6+ characters
   - Confirm Password must match
4. Clicks "Create Account"
5. On success → redirected to `/login` with message "Account created successfully! Please log in."
6. On error → red error box shows (e.g., "username already exists")

**Note:** Production sign-up is limited to users on the server-side allowlist. The landing and sign-up pages explain this before account creation.

### Login
1. User visits `/login`
2. Enters Username or email and Password in labelled fields
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
- Fixed dark sidebar (260px) on the left with keyboard-operable navigation buttons
- "Welcome [FirstName]" header at top of sidebar
- Main content area on the right

### Mobile Layout (< 768px)
- Hamburger menu icon in header bar
- Tapping it opens a navigation dialog from the left with a dark overlay
- Focus stays inside the menu while it is open. Escape or tapping outside closes it and returns focus to the menu button. The menu also closes when a destination is chosen.
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

Active page is highlighted and announced as the current page in the sidebar. Shared buttons, cards, fields, and tables use the same palette, borders, spacing, and keyboard focus treatment throughout the app.

---

## 3. Dashboard — Adding Expenses & Budget Entries (`/`)

The dashboard opens with a page heading and an explanation of the two possible actions. The entry form sits in a shared surface and uses the app's common field and primary-button styling.

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

The page starts with a heading and a short explanation, followed by search and the responsive transaction list.

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

The detail page shows the expense and any linked budget entry together. Deleting from this page asks for confirmation; a failed deletion leaves the page open and displays an error so it can be retried.
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

The page heading stays visible for populated, empty, and error states; each person's balance remains grouped by currency.

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

The page uses the shared heading and spacing, with more room around the remaining amount, category selector, search, and entries on mobile.

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

The detail page shows the budget entry and any linked expense together. Deleting from this page asks for confirmation; a failed deletion leaves the page open and displays an error so it can be retried.
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

The chart page uses the shared heading and spacing. Time-range and currency controls use the same selected, hover, and focus styling as other controls.

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

The page groups the group name, currency, default shares, and budget categories in distinct cards, with a save action at the end. A heading stays visible while settings load.

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

## Shared Bills (`/bills`)

The **Shared Bills** item in desktop and mobile navigation opens a month
calendar, monthly totals, a due-date list, and bill plans. Previous/next month
buttons and **This month** change the calendar. A `month=YYYY-MM` URL parameter
keeps the selected month on reload. The calendar links to each due item below;
the list remains available on narrow screens.

**Add bill** opens a form for name, amount, currency, first due date, cadence
(one time, daily, weekly, monthly), payer, and per-member split percentages.
Shares must total 100%. The form uses the group's default currency and shares
when available. Searchable pickers let you choose a group scheduled expense,
a scheduled budget action, or both. They show amount, currency, run schedule,
active status, and any differences from the bill. Budget actions are labelled
Credit or Debit. When both are chosen, their generated entries are linked only
on dates when both actions actually run, even if their first dates or repeat
schedules differ, either runs first, or both ran before the bill was linked.
Scheduled actions do not confirm payment.
The picker is shown in [desktop](previews/bill-action-pickers-desktop.png) and
[mobile](previews/bill-action-pickers-mobile.png) previews.
Existing plans can be edited, stopped, or resumed. Editing refreshes
unpaid occurrences that have no expense while keeping paid and linked records;
stopping removes future unpaid dates with no expense and keeps recorded payments.

Each occurrence shows its UTC calendar due date, payer, amount, split, and
pending/overdue/paid status. **Mark paid** offers three explicit choices:
record the payment only, link an existing matching expense, or create an
expense from the bill's payer and split. When creating an expense, a budget
category can optionally be debited by the same amount. These changes are saved
together. If a linked scheduled expense runs on the due date, the dialog blocks
creating another expense and can link its output after it runs. It warns if that
output's amount, currency, or payer differs from the bill. If a linked scheduled
budget action runs on the due date, the dialog does not offer a second manual
debit. The budget action's own Credit or Debit setting determines its effect.
**Mark pending** reverses only the paid status; any expense or budget debit
remains and stays linked to prevent a second creation. The payment choices are
shown in [desktop](previews/bill-payment-desktop.png) and
[mobile](previews/bill-payment-mobile.png) previews. The monthly summary shows
unpaid dues, paid totals, and planned amounts owed by non-payers for
unpaid bills. These are separate for each currency and are not settled balances; there is no
exchange-rate conversion. Monthly due dates on days 29–31 use the last day of
shorter months, and weekly dates repeat every seven UTC calendar days.

The **Reminders** panel shows unread in-app notices for upcoming and overdue
bills, with a **Dismiss** action. Notices disappear when dismissed or when the
bill occurrence is marked paid. At the daily midnight UTC cron, daily bills
receive a due-today notice, weekly bills a one-day advance notice, and one-time
or monthly bills a three-day advance notice. Unpaid occurrences also get one
overdue notice after their due date. Reminder delivery depends on opening the
app; email is deferred.

## Bank imports (`/bank-import`, local and development)

The **Bank imports** navigation item opens Plaid Sandbox Link. A user can connect a test bank and see their own connection status. A connected bank is stored under the connecting user, even when the user belongs to a shared group. A separate review inbox will display imported transactions after synchronization is enabled. Connecting a bank never creates a shared expense, marks a bill paid, or changes balances.

The feature is unavailable on the production Worker. Sandbox institutions and transactions are test data; linking a real UK bank requires a separate production Plaid arrangement.

## 9. Scheduled Actions

Automate recurring expenses or budget entries (e.g., monthly rent, weekly grocery budget).

### List Page (`/scheduled-actions`)

Shows scheduled actions in a single-column list of cards on desktop and mobile. Every card shows description, amount and currency, action type, frequency, active or paused status, and next execution date. Expense cards show the payer and each person's split percentage directly. Budget cards show the budget category and credit or debit type directly. Member and budget names are shown when available. **More setup** expands secondary dates, including start date and last run, without repeating the amount.

The page uses the shared surface, button, and field-label styling, with a clear page heading and explanation. The delete confirmation uses an accessible alert dialog: focus starts on **Cancel**, Escape dismisses it, and the background cannot be operated while it is open.

Use the labelled native controls above the list to filter by status (**All**, **Active**, **Paused**), type (**All**, **Expense**, **Budget**), or frequency (**Any**, **Daily**, **Weekly**, **Monthly**). Sort by **Recently added**, **Next run soonest**, or **Name A–Z**. The matching count updates with the filters. Filter and sort choices remain in the page URL for sharing and reloading. **Clear filters** removes the three filters while keeping the chosen sort. When nothing matches, the page offers a clear action distinct from the empty account state.

**Card actions:**
| Button | Action |
|--------|--------|
| More setup / Hide setup | Expand or collapse secondary schedule dates |
| History | View execution history |
| Edit | Edit the action |
| Pause / Resume | Toggle active/paused status |
| Delete | Delete with a confirmation dialog |

**"Add Action"** button in header → create new action.

More actions load as you scroll. A visible **Load more actions** button is also available while more pages remain. The page shows an invitation to create the first action when empty, a loading message during fetch, and a retry button if loading fails.

### Creating an Action (`/scheduled-actions/new`)

The create and edit pages use the shared page heading, explanation, back button, and action-details surface. The primary save action is visually distinct. The history and run-details pages use the same page layout and surfaces; history entries are keyboard-operable buttons.

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
