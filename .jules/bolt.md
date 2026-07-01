## 2024-11-20 - Hoisting expensive parsers and eliminating array methods
**Learning:** O(N) redundant calculations inside `useMemo` hooks (such as string lowercasing and time ms parsing) and chained array methods inside React render cycles (`.filter().map().reduce()`) cause severe UI jank. `Intl.DateTimeFormat` instantiations inside loops are extremely costly.
**Action:** Always eagerly pre-compute/hoist generic properties outside iterations, pre-instantiate `Intl.DateTimeFormat` out-of-loop, and consolidate array aggregations into a single `for...of` or `for...in` loop.
