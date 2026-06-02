## 2024-05-24 - Hoist constants and expensive parsing outside loops
**Learning:** Found a performance anti-pattern where constant calculations like `new Date().getTime()` and `string.toLowerCase()` were placed inside large array methods (like `.filter()`). This leads to redundant O(n) executions.
**Action:** Always inspect array iterations inside `useMemo` hooks or render cycles and hoist any invariants or expensive parsings (like Date parsing or regular expressions) outside the loop to prevent repeated computations.
