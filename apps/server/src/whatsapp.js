import 'dotenv/config';

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// Tracks which products we've already alerted on, so a hovering-at-low-stock
// item doesn't spam a message on every single sale. Cleared when stock is
// restocked back above the reorder level.
const alerted = new Set();

export async function checkLowStockAndAlert(products) {
  for (const product of products) {
    const isLow = product.stock_qty <= product.reorder_level;

    if (isLow && !alerted.has(product.id)) {
      alerted.add(product.id);
      await sendLowStockAlert(product);
    }

    if (!isLow && alerted.has(product.id)) {
      alerted.delete(product.id);
    }
  }
}

async function sendLowStockAlert(product) {
  try {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text:
          `Low stock alert: Exit Mart\n` +
          `${product.name} is down to ${product.stock_qty} units ` +
          `(reorder level: ${product.reorder_level}).`,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.warn('Telegram low-stock alert failed:', body);
    }
  } catch (err) {
    // Never let a failed alert send break the sale itself.
    console.warn('Telegram low-stock alert failed:', err.message);
  }
}