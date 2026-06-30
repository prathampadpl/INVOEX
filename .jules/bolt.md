## 2024-07-01 - Optimizing repeated array iterations in JSX
**Learning:** Avoid putting O(N) reductions directly inside the JSX render body.
**Action:** Always aggressively hoist these constants outside the loop and wrap derived list logic in `useMemo`.
