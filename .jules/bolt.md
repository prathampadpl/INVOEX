## 2026-06-05 - [Anti-Pattern: Inline Iterations]
**Learning:** Avoid executing constant calculations (e.g., date parsing or lowercase conversions) inside large array methods (.filter(), .map()), or placing O(N) reductions directly inside the JSX render body. This causes redundant computations and UI jank during re-renders.
**Action:** Aggressively hoist constant calculations outside of filter loops and move complex calculations (like calculating totals or averages) out of the JSX render body and into useMemo hooks, computing them only when the source data changes.
