## 2024-05-19 - Expensive `new Date()` parsing inside filters
**Learning:** Found O(N) operations inside React components performing `new Date()` parsing on every re-render loop (`.filter()`, `.map()`).
**Action:** Always hoist constant date calculations or use `getTime()` on existing numbers outside the loop, and use `useMemo` for filtering logic to prevent redundant O(n) operations during re-renders.
