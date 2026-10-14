# Recent bank inbox verification

The bank inbox initially shows today and the previous four UTC calendar days.
Load more fetches bounded50-row keyset pages and preserves the visible list.
Expenses/Budget date behavior is unchanged. Existing bank detail URLs remain valid.

Focused local Worker suite:17/17, including inclusive dateboundary, future exclusion,
emptyrecent with olderrows, ownerprivacy, tied-date51-row paging and invalidcursor.
Focused UI suite:3/3, covering activefilter reload, appendfailure retry without
losingrows, and filtercursor reset. Frontend/Worker types, frontend ESLint,
changed-handler Biome and independent UI build passed.

`scripts/capture-bank-inbox-window.cjs` uses invented sessions/activity and blocks
external requests/service workers. Browser smoke asserts olderrows are not fetched
initially, Load more accumulates rows, emptyrecent retains the older action, and
mobile/desktop layouts have no horizontal overflow. Fixtures honor the active
status filter. No live bank access, synchronization or ledger writes occurred.

Evidence in `docs/previews/bank-inbox-window` includes untouchedviewport and
supplemental full-content captures (the latter temporarily exposes internal shell
scroll height, preserving widths and restoring styles):

- [Recent desktop](../previews/bank-inbox-window/recent-desktop-viewport.png)
- [Loaded older desktop](../previews/bank-inbox-window/loaded-desktop-viewport.png)
- [Recent mobile](../previews/bank-inbox-window/recent-mobile-viewport.png)
- [Loaded older mobile](../previews/bank-inbox-window/loaded-mobile-viewport.png)
- [Empty recent mobile](../previews/bank-inbox-window/empty-recent-mobile-viewport.png)

The coordinating agent personally reviewed the layout. No migration is required.
Full financial browser E2E expansion remains deferred.
