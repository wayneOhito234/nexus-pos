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
 * @param {'cash'|'mpesa'} paymentMethod
 */
function vfdCheckout(total, paymentMethod) {
  const method = paymentMethod === 'mpesa' ? 'M-Pesa' : 'Cash';
  write(`TOTAL KES ${Number(total).toFixed(2)}`, `Pay via ${method}`);
}

/**
 * Called after the sale is confirmed and receipt is printing.
 * @param {number} changeGiven
 * @param {'cash'|'mpesa'} paymentMethod
 */
function vfdSaleComplete(changeGiven, paymentMethod) {
  if (paymentMethod === 'mpesa') {
    write('  ** THANK YOU! **  ', '  M-Pesa Received   ');
  } else {
    const chg = `Change: KES ${Number(changeGiven).toFixed(2)}`;
    write('  ** THANK YOU! **  ', pad(chg, LINE_LEN));
  }
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