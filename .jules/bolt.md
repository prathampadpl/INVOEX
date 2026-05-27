
## 2024-05-27 - Dashboard Performance Issue
**Learning:** Consolidating multiple `.filter()`, `.map()`, `.flatMap()`, and IIFEs inside a component render loop or inside a multi-call render into a single `useMemo` computation pass can significantly eliminate redundant O(N) operations over arrays on every render.
**Action:** When mapping or analyzing long arrays like `invoices`, calculate all aggregated metrics (`approvedCount`, `reviewCount`, `avgConfidenceOverall`, etc.) in a single iteration within a `useMemo` block rather than chaining multiple array transformations.
