## 2024-07-02 - Hoisting and Array Consolidation in Dashboard
**Learning:** Found critical performance anti-patterns in `Dashboard.tsx`:
1. Parsing strings into Dates (`new Date(x).getTime()`) repeatedly inside a large `.filter()` loop, scaling O(N).
2. Performing inline heavy derivations (mapping, filtering, reducing Object.entries) for confidence scores directly inside the JSX render body and repeatedly evaluating them instead of calculating them once alongside memoized state.
**Action:** Always aggressively hoist constant date/string parsing outside of array loop iterations, and replace expensive chained array methods (like `.entries().filter().map().reduce()`) with simple `for...in` or `for...of` loops. Move complex metric reductions completely out of the component render block and into `useMemo` blocks.
