export const VAT_RATE = 0.16;

export * from './taxonomy.js';

export const PAYMENT_METHODS = {
  CASH: 'cash',
  MPESA: 'mpesa',
};

export const SOCKET_EVENTS = {
  STOCK_UPDATED: 'stock:updated',
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function calcTotals(items) {
  // Prices are VAT-inclusive: the marked shelf price is exactly what the
  // customer pays. So the total is simply the sum of line prices, and the 16%
  // VAT is the portion already contained within that total (total minus the
  // net amount). `subtotal` is the net, ex-VAT figure shown on the receipt.
  // The three always reconcile: subtotal + vat === total.
  const total = round2(items.reduce((sum, item) => sum + item.price * item.qty, 0));
  const vat = round2(total - total / (1 + VAT_RATE));
  const subtotal = round2(total - vat);
  return { subtotal, vat, total };
}