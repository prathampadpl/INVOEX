## 2025-02-14 - [O(N) Operations in render and loops]
**Learning:** O(N) operations like `.toLowerCase()`, `new Date()`, and expensive array aggregations (`.filter()`, `.flatMap()`) inside JSX render bodies or `.filter()` loops cause redundant computation on every re-render or iteration.
**Action:** Always hoist constants out of loops and wrap derived state (such as stats objects) in `useMemo` to prevent these performance regressions and UI jank.
