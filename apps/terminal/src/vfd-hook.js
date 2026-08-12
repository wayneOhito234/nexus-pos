/**
 * VFD display hook for React components.
 * Import this and call the functions at the right moments in App.jsx.
 *
 * Usage in App.jsx:
 *   import { vfd } from './vfd-hook.js';
 *
 *   // When item added to cart:
 *   vfd.itemAdded(product.name, product.price, newTotal);
 *
 *   // When cashier clicks Cash/M-Pesa checkout:
 *   vfd.checkout(cartTotal, 'cash');
 *
 *   // After sale is saved successfully:
 *   vfd.saleComplete(changeGiven, 'cash');
 */

const invoke = window?.electronAPI?.invoke || (() => {});

export const vfd = {
  itemAdded(productName, unitPrice, cartTotal) {
    invoke('vfd:item-added', { productName, unitPrice, cartTotal }).catch(() => {});
  },

  checkout(total, paymentMethod) {
    invoke('vfd:checkout', { total, paymentMethod }).catch(() => {});
  },

  saleComplete(changeGiven, paymentMethod) {
    invoke('vfd:sale-complete', { changeGiven, paymentMethod }).catch(() => {});
  },

  welcome() {
    invoke('vfd:welcome').catch(() => {});
  },

  clear() {
    invoke('vfd:clear').catch(() => {});
  },
};