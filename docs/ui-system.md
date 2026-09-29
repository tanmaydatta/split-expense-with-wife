# UI foundation and migration

The app uses React, Bootstrap CSS, styled-components, and app-owned components. The new visual foundation lives in `src/components/theme/variables.css` (`--ui-*` tokens) and `src/components/ui`. It provides a surface, button variants, and a labelled native select field. Adopt these across screens incrementally, keeping one visual language and reducing repeated CSS.

Radix Primitives supplies behavior for complex controls where the browser alone does not provide it. Alert Dialog manages destructive scheduled-action confirmation; Dialog manages mobile navigation focus and dismissal. Native selects remain the filter control because they work well with keyboards and mobile pickers. Radix is unstyled; the app owns its visual design. The accessibility target is WCAG 2.2 AA, with WAI-ARIA Authoring Practices for custom interactions.

Preview captures from local Playwright flows: [scheduled actions on desktop](previews/scheduled-actions-desktop.jpeg), [scheduled actions on mobile](previews/scheduled-actions-mobile.jpeg), [mobile navigation](previews/mobile-navigation.jpeg), and [monthly budget on desktop](previews/finance-monthly-desktop.jpeg) and [mobile](previews/finance-monthly-mobile.jpeg). They show seeded example data.

## Screen inventory and migration order

| Area | Current UI | Next migration |
| --- | --- | --- |
| Scheduled actions | Shared page layout, surfaces, buttons, field labels, and Radix confirmation across list, create, edit, history, and run details | Maintain consistency as new scheduled-action features are added |
| Dashboard and expenses | Shared page heading and spacing; dashboard form in a surface; shared fields, cards, and tables | Refine transaction detail interactions as needed |
| Budget and monthly budget | Shared page heading and spacing; chart controls use UI tokens | Refine chart data presentation as needed |
| Balances and transaction details | Balances use shared page heading and spacing; shared cards and typography | Refine transaction detail layout as needed |
| Settings | Bootstrap-style sections and custom form controls | Shared field labels, grouped surfaces, and confirmation patterns |
| Navigation and authentication | Semantic sidebar buttons and Radix mobile navigation; landing/login/signup retain page-specific styles | Unify public-page layout and controls |

Shared `Button`, `Card`, `Input`, `Select`, and `Table` now use the same palette and focus styles as the new UI layer, giving the dashboard, expenses, budget, balances, settings, and auth screens a common foundation. Their page-specific spacing and dense layouts can be refined in later passes.

Use Radix only for interactions that need its managed semantics and focus. Keep data visualizations and simple HTML form controls native. Each migration should update its user-flow documentation and run local component and browser tests at desktop and mobile widths.
