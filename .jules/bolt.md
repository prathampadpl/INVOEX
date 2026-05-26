## 2024-05-26 - Memoizing expensive array operations in Analytics

**Learning:** Unmemoized array operations in React functional components (especially loops over hundreds of items to format chart data) re-run on every render, which is a common frontend performance anti-pattern.
**Action:** When working on dashboard-like components that compute aggregates (e.g., grouping by vendor, calculating averages) from large lists of data, always verify if those computations are properly memoized using `useMemo` so they only update when the source data changes.
