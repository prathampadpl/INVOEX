## 2024-06-25 - Extracted constant calculations out of the React render loop
**Learning:** Found instances where arrays are filtered and reduced directly inside the JSX render loop or complex logic is duplicated. This results in heavy calculations on every re-render causing O(n) or O(n^2) operations leading to jank.
**Action:** Lift the operations using `useMemo` so that they only recalculate when their dependencies change. This improves render efficiency significantly, especially as data grows.
