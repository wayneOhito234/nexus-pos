import { Router } from 'express';
import { pool } from '../db.js';
import { VAT_RATE, SOCKET_EVENTS } from '@nexus-pos/shared';
import { tillIpGuard } from '../ipAllowlist.js';
import { requireAuth } from '../auth.js';
import { checkLowStockAndAlert } from '../whatsapp.js';

export const salesRouter = Router();

// Selling needs a till machine and a signed-in cashier. The IP guard is
// what makes "the manager cannot sell" true at the server rather than by
// hiding a button.
salesRouter.post('/', tillIpGuard, requireAuth, async (req, res) => {
  const { terminal_id, payment_method, mpesa_ref, items, amount_received } = req.body;

  // Identity comes from the verified session, never the request body. A
  // till could otherwise attribute a sale to any cashier it named, which
  // would make every report and shift reconciliation meaningless.
  const cashierId = req.session.cashierId;

  if (!terminal_id || !payment_method || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'terminal_id, payment_method and items are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let subtotal = 0;
    const lineItems = [];

    for (const { product_id, qty } of items) {
      const { rows } = await client.query(
        'SELECT id, name, price, stock_qty FROM products WHERE id = $1 FOR UPDATE',
        [product_id]
      );
      const product = rows[0];

      if (!product) {
        throw Object.assign(new Error(`Product ${product_id} not found`), { status: 400 });
      }
      if (product.stock_qty < qty) {
        throw Object.assign(
          new Error(`Only ${product.stock_qty} of ${product.name} left on the shelf`),
          { status: 409 }
        );
      }

      subtotal += Number(product.price) * qty;
      lineItems.push({ product_id, qty, price: product.price });
    }

    const vat = subtotal * VAT_RATE;
    const total = subtotal + vat;

    let changeGiven = null;
    if (payment_method === 'cash' && amount_received !== undefined) {
      if (Number(amount_received) < total) {
        throw Object.assign(new Error('Amount received is less than the total due'), { status: 400 });
      }
      changeGiven = Number(amount_received) - total;
    }

    const { rows: saleRows } = await client.query(
      `INSERT INTO sales
         (terminal_id, cashier_id, total, payment_method, mpesa_ref, amount_received, change_given)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, terminal_id, cashier_id, total, payment_method, mpesa_ref,
                 amount_received, change_given, created_at`,
      [
        terminal_id,
        cashierId,
        total,
        payment_method,
        mpesa_ref || null,
        amount_received || null,
        changeGiven,
      ]
    );
    const sale = saleRows[0];

    for (const item of lineItems) {
      await client.query(
        'INSERT INTO sale_items (sale_id, product_id, qty, price) VALUES ($1, $2, $3, $4)',
        [sale.id, item.product_id, item.qty, item.price]
      );

      await client.query(
        'UPDATE products SET stock_qty = stock_qty - $1 WHERE id = $2',
        [item.qty, item.product_id]
      );

      // A sale is a stock movement like any other. Without this row the
      // ledger would record deliveries and adjustments but silently omit
      // the largest source of stock leaving the shelf.
      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, qty_change, location, reason, reference_id, staff_id)
         VALUES ($1, 'sale', $2, 'shelf', $3, $4, $5)`,
        [item.product_id, -item.qty, `Sale #${sale.id} on ${terminal_id}`, sale.id, cashierId]
      );
    }

    await client.query('COMMIT');

    const { rows: updatedProducts } = await pool.query(
      `SELECT id, sku, barcode, name, category, price, stock_qty, store_qty, reorder_level
       FROM products WHERE id = ANY($1)`,
      [lineItems.map((item) => item.product_id)]
    );

    const io = req.app.get('io');
    io.emit(SOCKET_EVENTS.STOCK_UPDATED, updatedProducts);

    checkLowStockAndAlert(updatedProducts).catch(() => {});

    res.status(201).json({ ...sale, subtotal, vat, items: lineItems });
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.status || 500;
    if (status === 500) console.error(err);
    res.status(status).json({ error: err.message });
  } finally {
    client.release();
  }
});