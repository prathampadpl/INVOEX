
## 2024-05-17 - Hoisting Invariants out of Filter Loops
**Learning:** Found O(N) operations inside React component rendering filter loops, specifically recalculating string toLowerCase() and instantiating multiple Date objects per invoice inside array.filter. In components handling potentially large arrays of invoices, these calculations cause noticeable lag.
**Action:** Always aggressively hoist parsing, toLowerCase(), Date parsing, and API-expensive calls outside of O(N) filter/map loops into O(1) operations that execute once before the array iteration, wrapped in a `useMemo` block.
