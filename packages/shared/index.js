export const VAT_RATE = 0.16;

export const PAYMENT_METHODS = {
  CASH: 'cash',
  MPESA: 'mpesa',
};

export const SOCKET_EVENTS = {
  STOCK_UPDATED: 'stock:updated',
};

export function calcTotals(items) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const vat = subtotal * VAT_RATE;
  const total = subtotal + vat;
  return { subtotal, vat, total };
}
