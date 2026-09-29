# UI foundation and migration

The app uses React, Bootstrap CSS, styled-components, and app-owned components. The new visual foundation lives in `src/components/theme/variables.css` (`--ui-*` tokens) and `src/components/ui`. It provides a surface, button variants, and a labelled native select field. Adopt these across screens incrementally, keeping one visual language and reducing repeated CSS.

Radix Primitives supplies behavior for complex controls where the browser alone does not provide it. The first use is Alert Dialog for destructive scheduled-action confirmation. It manages focus, Escape, and dialog semantics. Native selects remain the filter control because they work well with keyboards and mobile pickers. Radix is unstyled; the app owns its visual design. The accessibility target is WCAG 2.2 AA, with WAI-ARIA Authoring Practices for custom interactions.

Preview captures from the local Playwright flow: [scheduled actions on desktop](previews/scheduled-actions-desktop.jpeg) and [scheduled actions on mobile](previews/scheduled-actions-mobile.jpeg). Both show seeded example data.

## Screen inventory and migration order

| Area | Current UI | Next migration |
| --- | --- | --- |
| Scheduled actions | Shared page layout, surfaces, buttons, field labels, and Radix confirmation across list, create, edit, history, and run details | Maintain consistency as new scheduled-action features are added |
| Dashboard and expenses | Custom forms, cards, and tables | Shared page header, form fields, surface, button variants, responsive list/table |
| Budget and monthly budget | Custom cards, charts, and tables | Shared surfaces, amount hierarchy, states, and controls |
| Balances and transaction details | Page-specific cards and CSS | Shared typography, surfaces, and action layout |
| Settings | Bootstrap-style sections and custom form controls | Shared field labels, grouped surfaces, and confirmation patterns |
| Navigation and authentication | Sidebar, mobile header, landing/login/signup styles | Unified navigation, focus behavior, page spacing, and public-page styling |

Use Radix only for interactions that need its managed semantics and focus. Keep data visualizations and simple HTML form controls native. Each migration should update its user-flow documentation and run local component and browser tests at desktop and mobile widths.
