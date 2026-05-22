## 2024-05-23 - Date Parsing Optimization inside React Filters
**Learning:** `new Date()` combined with `.getTime()` and `Intl.DateTimeFormat` can be surprisingly slow when executed inside large loop arrays or `.filter` conditions common in dashboard table filtering or search queries.
**Action:** Always hoist `new Date()` initialization, string transforms like `.toLowerCase()`, and `Intl.DateTimeFormat` constructors outside `.filter()` and `.forEach()` loops, and use `useMemo()` to prevent recalculating on every re-render.
