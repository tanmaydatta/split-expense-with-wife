# UI foundation and migration

The app uses React, Bootstrap CSS, styled-components, and app-owned components. The new visual foundation lives in `src/components/theme/variables.css` (`--ui-*` tokens) and `src/components/ui`. It provides a surface, button variants, and a labelled native select field. Adopt these across screens incrementally, keeping one visual language and reducing repeated CSS.

Radix Primitives supplies behavior for complex controls where the browser alone does not provide it. Alert Dialog manages destructive scheduled-action confirmation; Dialog manages mobile navigation focus and dismissal. Native selects remain the filter control because they work well with keyboards and mobile pickers. Radix is unstyled; the app owns its visual design. The accessibility target is WCAG 2.2 AA, with WAI-ARIA Authoring Practices for custom interactions.

Preview captures from local Playwright flows: [scheduled actions on desktop](previews/scheduled-actions-desktop.jpeg), [scheduled actions on mobile](previews/scheduled-actions-mobile.jpeg), [mobile navigation](previews/mobile-navigation.jpeg), [monthly budget on desktop](previews/finance-monthly-desktop.jpeg) and [mobile](previews/finance-monthly-mobile.jpeg), [settings on desktop](previews/settings-desktop.jpeg) and [mobile](previews/settings-mobile.jpeg), [landing on desktop](previews/landing-desktop.jpeg) and [mobile](previews/landing-mobile.jpeg), and [signup on mobile](previews/signup-mobile.jpeg). They show seeded example data where a session is required.

Shared bills previews from local seeded households: [calendar on desktop](previews/bills-calendar-desktop.jpeg) and [mobile](previews/bills-calendar-mobile.jpeg), plus [due list on desktop](previews/bills-due-list-desktop.jpeg) and [mobile](previews/bills-due-list-mobile.jpeg).

The in-app reminder panel is shown on [desktop](previews/bills-reminders-desktop.jpeg) and [mobile](previews/bills-reminders-mobile.jpeg). The bill is seeded locally; the upcoming reminder response is a local Playwright fixture so the panel can be captured without running the daily cron.

## Screen inventory and migration order

| Area | Current UI | Next migration |
| --- | --- | --- |
| Scheduled actions | Shared page layout, surfaces, buttons, field labels, and Radix confirmation across list, create, edit, history, and run details | Maintain consistency as new scheduled-action features are added |
| Dashboard and expenses | Shared page heading and spacing; dashboard form in a surface; shared fields, cards, and tables | Refine transaction detail interactions as needed |
| Budget and monthly budget | Shared page heading and spacing; chart controls use UI tokens | Refine chart data presentation as needed |
| Balances and transaction details | Balances use shared page heading and spacing; transaction and budget entry details use shared page layout and delete confirmation | Maintain consistency as detail actions grow |
| Settings | Shared page heading, grouped cards, and aligned actions | Keep settings sections consistent as options grow |
| Navigation and authentication | Semantic sidebar buttons and Radix mobile navigation; landing, login, signup, and not-found pages use the shared palette, controls, and focus treatment | Maintain consistent public and signed-in flows |

Shared `Button`, `Card`, `Input`, `Select`, and `Table` now use the same palette and focus styles as the new UI layer, giving the dashboard, expenses, budget, balances, settings, and auth screens a common foundation. Their page-specific spacing and dense layouts can be refined in later passes.

Use Radix only for interactions that need its managed semantics and focus. Keep data visualizations and simple HTML form controls native. Each migration should update its user-flow documentation and run local component and browser tests at desktop and mobile widths.


## Budget and expense list filters

Search stays visible above a native **Filters** disclosure. Desktop starts with
filters expanded; mobile starts collapsed. Its active count and **Clear all**
control make the filtered state visible. Clear all keeps the chosen budget.
Filters remain available while results load, and changing filters starts a new
first page. URL parameters preserve filters, budget selection, refresh, and
browser back/forward navigation. Existing `q` search URLs still work.

Dates use the stored entry's UTC calendar date, with both bounds included.
**Total amount** compares the magnitude of the whole entry, in its original
currency; budget credit/debit signs do not affect the range. Choose currency to
compare like amounts; no conversion occurs. Budget direction is Credit or Debit.
Expense direction is **You are owed**, **You owe**, or **No net balance**, based
on the signed-in user's net share when the transaction was created, rounded to
the existing two-decimal display. This is historical contribution, not payment
status. **Budget left** remains a lifetime total independent of filters.

Sort by newest/oldest or total amount low/high; stable ID ties prevent duplicates
between pages. Invalid date or amount ranges show an inline message. A filtered
empty list offers Clear all; pagination errors keep the list and offer retry via
Show more. Detail and delete interactions remain available in filtered results.

Local synthetic example screenshots: [Budget desktop](images/budget-list-filters-desktop.png),
[Budget mobile](images/budget-list-filters-mobile.png),
[Expenses desktop](images/expense-list-filters-desktop.png), and
[Expenses mobile](images/expense-list-filters-mobile.png).
