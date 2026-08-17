/**
 * VFD display hook for React components.
 * Talks to the Electron main process over the `window.nexusVfd` bridge that
 * preload.js exposes. In a plain browser (vite dev, no Electron) nexusVfd is
 * undefined, so every call harmlessly no-ops.
 */

const bridge = () =>
  (typeof window !== 'undefined' ? window.nexusVfd : undefined);

export const vfd = {
  itemAdded(productName, unitPrice, cartTotal) {
    bridge()?.itemAdded(productName, unitPrice, cartTotal)?.catch?.(() => {});
  },
  checkout(total, paymentMethod) {
    bridge()?.checkout(total, paymentMethod)?.catch?.(() => {});
  },
  saleComplete(changeGiven, paymentMethod) {
    bridge()?.saleComplete(changeGiven, paymentMethod)?.catch?.(() => {});
  },
  welcome() {
    bridge()?.welcome()?.catch?.(() => {});
  },
  clear() {
    bridge()?.clear()?.catch?.(() => {});
  },
};