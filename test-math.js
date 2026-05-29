const item = { quantity: 1, rate: 1500, discount: 20, discountType: 'percent' };
const qty = parseFloat(item.quantity) || 0;
const rate = parseFloat(item.rate) || 0;
const disc = parseFloat(item.discount) || 0;
const isPercent = item.discountType === 'percent';
const gst = 0;

const subtotal = qty * rate;
const taxableLine = isPercent ? subtotal * (1 - disc / 100) : subtotal - disc;
const amount = Number((taxableLine * (1 + gst / 100)).toFixed(2));

console.log("Amount is:", amount);
