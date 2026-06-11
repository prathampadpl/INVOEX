
## 2024-05-24 - Hoisting parsing from React loops and removing O(N) ops from JSX render
**Learning:** Parsing operations like string methods (`.toLowerCase()`) or `new Date().getTime()` placed directly inside `.filter()` loops run O(N) times on every dependency change. In addition, doing O(N) data reductions (like calculating averages across nested array objects) directly inside JSX means blocking the render cycle on every update.
**Action:** Always aggressively hoist parsing constraints outside filtering loops. Wrap derived list logic or heavy reductions inside `useMemo` so they only recalculate when underlying data actually changes, preventing UI regressions during fast re-renders.
