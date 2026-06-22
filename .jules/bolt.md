## 2024-11-20 - Hoisting Constants & Pre-computing Data
**Learning:** Instantiating formatters (like `Intl.DateTimeFormat`) or calculating derivations (like average confidence scores) inside large array maps (`.forEach()`, `.filter()`, or inline JSX) can severely impact React's render performance.
**Action:** Always hoist constants and string transformations outside of array iteration loops. Additionally, pre-compute data derivation logic when fetching or receiving data (e.g., inside `onSnapshot` subscriptions) rather than processing it on-the-fly during React re-renders.
