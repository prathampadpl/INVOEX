const items = Array.from({length: 10000}, (_, i) => Date.now() - i * 10000);

console.time('new Date inside loop');
let count1 = 0;
items.forEach(t => {
  const start = new Date("2023-01-01").getTime();
  if (t > start) count1++;
});
console.timeEnd('new Date inside loop');

console.time('new Date outside loop');
let count2 = 0;
const start = new Date("2023-01-01").getTime();
items.forEach(t => {
  if (t > start) count2++;
});
console.timeEnd('new Date outside loop');

console.time('Intl inside loop');
items.forEach(t => {
  new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
});
console.timeEnd('Intl inside loop');

console.time('Intl outside loop');
const formatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
items.forEach(t => {
  formatter.format(new Date(t));
});
console.timeEnd('Intl outside loop');
