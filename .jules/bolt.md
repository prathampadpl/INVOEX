## 2024-11-20 - Hoisting Expensive Object Instantiations and Calculations out of Render/Filter Loops

**Learning:**
In `src/pages/Dashboard.tsx`, multiple performance bottlenecks existed.
First, `new Date()` object instantiation and `.getTime()` computations were being performed dynamically on every single item in the `filteredInvoices` array loop.
Second, `.toLocaleDateString('en-US', { ... })` dynamically instantiated an `Intl.DateTimeFormat` object on every single invoice dynamically in the data generation logic.
Finally, aggregations like `invoices.filter(...)` and nested `flatMap` logic were being executed inside the pure JSX block, which caused them to be redundantly re-calculated upon every component re-render (e.g., when a user merely typed a key in a search box, unrelated to the core array length changes).

**Action:**
1. Always hoist constant calculations (e.g., `filterStartDate` parsing or `.toLowerCase()`) outside of iterators like `.map` or `.filter`.
2. Aggressively cache formatters (`new Intl.DateTimeFormat()`) outside loops before formatting dates over large loops.
3. Keep the JSX block purely presentation-focused. Any O(N) filtering, mapping, or reducing should happen *before* the JSX block, heavily guarded by a `useMemo` block with appropriate dependencies (like the actual data array).