## 2024-03-24 - Avoid O(N) array reductions in JSX render body and instantiate Intl objects outside loops

**Learning:** In React components dealing with large datasets (like `Dashboard.tsx` with invoices), placing `.filter().length` or `.flatMap().reduce()` directly inside the JSX render body forces O(N) recalculations on every render (even unrelated ones like hovering). Furthermore, instantiating `Intl.DateTimeFormat` (via `toLocaleDateString`) or repeatedly parsing strings to dates inside O(N) loops like `.forEach()` or `.filter()` introduces significant and completely unnecessary CPU overhead.

**Action:**
1. Always calculate derived metrics (e.g., `approvedCount`, `flaggedCount`, `globalAverageConfidence`) inside a single-pass `useMemo` block alongside other aggregations.
2. Hoist expensive constant instantiations (like `Intl.DateTimeFormat` or parsing `filterStartDate`) completely out of the iteration loops.