/**
 * vfd.js  ·  CommonJS  ·  VFD220C-U-B customer display controller
 * Drop into:  apps/terminal/electron/vfd.js
 *
 * Commands use the ESC/POS-compatible subset that VFD220C supports:
 *   ESC @ = initialize (clears display, cursor home)
 *   Writes exactly 20 chars per line.
 */

const { SerialPort } = require('serialport');

const BAUD     = 9600;
const LINE_LEN = 20;

let port = null;

// ── Helpers ──────────────────────────────────────────────────────────────────

function pad(str, len) {
  str = String(str ?? '');
  if (str.length >= len) return str.slice(0, len);
  return str + ' '.repeat(len - str.length);
}

// The renderer labels a payment in a few different shapes: 'CASH', 'M-PESA'
// and 'SPLIT' come from the checkout call, while 'CASH', 'M-PESA' and
// 'CASH + M-PESA' come from the sale-complete call. Collapse all of them to
// one of three canonical kinds so the display logic below never has to care
// about casing or exact wording.
function paymentKind(paymentMethod) {
  const m = String(paymentMethod ?? '').toUpperCase();
  const hasCash  = m.includes('CASH');
  const hasMpesa = m.includes('M-PESA') || m.includes('MPESA');
  if (m.includes('SPLIT') || (hasCash && hasMpesa)) return 'split';
  if (hasMpesa) return 'mpesa';
  return 'cash';
}

function write(line1, line2) {
  if (!port || !port.isOpen) return;
  const top = pad(line1, LINE_LEN);
  const bot = pad(line2, LINE_LEN);
  // ESC @ clears + homes cursor; then 20 chars for line 1, 20 for line 2
  const buf = Buffer.from('\x1B\x40' + top + bot, 'ascii');
  port.write(buf, (err) => {
    if (err) console.error('[VFD] write error:', err.message);
  });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

function vfdOpen(comPort) {
  try {
    port = new SerialPort({ path: comPort, baudRate: BAUD, autoOpen: true });
    port.on('error', (err) => console.error('[VFD] serial error:', err.message));
    port.on('open', () => {
      console.log(`[VFD] opened ${comPort} at ${BAUD} baud`);
      vfdWelcome();
    });
  } catch (err) {
    console.error('[VFD] failed to open port:', err.message);
  }
}

function vfdClose() {
  if (port && port.isOpen) {
    port.close((err) => {
      if (err) console.error('[VFD] close error:', err.message);
    });
    port = null;
  }
}

// ── Display states ────────────────────────────────────────────────────────────

function vfdWelcome() {
  write('   Zummart        ', '     Welcome!       ');
}

function vfdClear() {
  write('                    ', '                    ');
}

/**
 * Called when a cashier scans / adds an item to the cart.
 * @param {string} productName
 * @param {number} unitPrice
 * @param {number} cartTotal
 */
function vfdItemAdded(productName, unitPrice, cartTotal) {
  const totalStr = `Tot: KES ${Number(cartTotal).toFixed(2)}`;
  write(productName, totalStr);
}

/**
 * Called when the cashier presses Checkout (before payment is confirmed).
 * @param {number} total
 * @param {'cash'|'mpesa'|'split'|string} paymentMethod  case-insensitive
 */
function vfdCheckout(total, paymentMethod) {
  const kind = paymentKind(paymentMethod);
  const line2 =
    kind === 'split'  ? 'Pay: Cash + M-Pesa'   // 18 chars, fits the 20-wide line
    : kind === 'mpesa' ? 'Pay via M-Pesa'
    : 'Pay via Cash';
  write(`TOTAL KES ${Number(total).toFixed(2)}`, line2);
}

/**
 * Called after the sale is confirmed and the receipt is printing.
 * @param {number} changeGiven
 * @param {'cash'|'mpesa'|'split'|string} paymentMethod  case-insensitive
 */
function vfdSaleComplete(changeGiven, paymentMethod) {
  const kind = paymentKind(paymentMethod);
  const change = Number(changeGiven) || 0;

  let line2;
  if (change > 0) {
    // Whenever notes actually come back to the customer -- a cash sale, an
    // M-Pesa overpayment, or the cash leg of a split -- the change is the one
    // thing they care about, so it wins regardless of method.
    line2 = `Change: KES ${change.toFixed(2)}`;
  } else if (kind === 'mpesa') {
    line2 = 'M-Pesa Received';
  } else if (kind === 'split') {
    line2 = 'Cash + M-Pesa Paid';
  } else {
    line2 = 'Payment Received';
  }

  write('  ** THANK YOU! **  ', line2);
  // Return to welcome screen after 5 seconds
  setTimeout(vfdWelcome, 5000);
}

module.exports = {
  vfdOpen,
  vfdClose,
  vfdWelcome,
  vfdClear,
  vfdItemAdded,
  vfdCheckout,
  vfdSaleComplete,
};