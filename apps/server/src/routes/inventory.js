import { Router } from 'express';
import { pool } from '../db.js';
import { managerIpGuard } from '../ipAllowlist.js';
import { checkLowStockAndAlert } from '../whatsapp.js';

export const inventoryRouter = Router();

// Everything here is manager-only.
inventoryRouter.use(managerIpGuard);

// ---------- Suppliers ----------

inventoryRouter.get('/suppliers', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.*,
           COALESCE(SUM(g.total_cost), 0)  AS total_ordered,
           COALESCE(SUM(g.amount_paid), 0) AS total_paid,
           COUNT(g.id)                     AS delivery_count
    FROM suppliers s
    LEFT JOIN goods_received g ON g.supplier_id = s.id
    GROUP BY s.id
    ORDER BY s.active DESC, s.name
  `);
  res.json(rows);
});

inventoryRouter.post('/suppliers', async (req, res) => {
  const { name, contact_person, phone, email, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Supplier name is required' });

  const { rows: clash } = await pool.query('SELECT id FROM suppliers WHERE name = $1', [name.trim()]);
  if (clash.length > 0) return res.status(409).json({ error: 'That supplier already exists' });

  const { rows } = await pool.query(
    `INSERT INTO suppliers (name, contact_person, phone, email, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name.trim(), contact_person ?? null, phone ?? null, email ?? null, notes ?? null]
  );
  res.status(201).json(rows[0]);
});

inventoryRouter.patch('/suppliers/:id', async (req, res) => {
  const { name, contact_person, phone, email, notes, active } = req.body;
  const fields = [];
  const values = [];
  let i = 1;

  const maybe = (col, val) => {
    if (val !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(val);
    }
  };

  maybe('name', name?.trim());
  maybe('contact_person', contact_person);
  maybe('phone', phone);
  maybe('email', email);
  maybe('notes', notes);
  maybe('active', active);

  if (fields.length === 0) return res.status(400).json({ error: 'nothing to update' });
  values.push(req.params.id);

  const { rows } = await pool.query(
    `UPDATE suppliers SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  if (rows.length === 0) return res.status(404).json({ error: 'supplier not found' });
  res.json(rows[0]);
});

// ---------- Goods received ----------

// POST /api/inventory/goods-received
// body: { supplier_id, reference?, amount_paid?, notes?, received_by?,
//         items: [{ product_id, qty, unit_cost }] }
//
// Stock lands in the STORE, not on the shelf. A separate transfer puts it
// out for sale, which is what makes the store-to-shelf authorisation real
// rather than decorative.
inventoryRouter.post('/goods-received', async (req, res) => {
  const { supplier_id, reference, amount_paid, notes, received_by, items } = req.body;

  if (!supplier_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'supplier_id and at least one item are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const totalCost = items.reduce((sum, it) => sum + Number(it.qty) * Number(it.unit_cost), 0);

    const { rows: grRows } = await client.query(
      `INSERT INTO goods_received (supplier_id, reference, total_cost, amount_paid, notes, received_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [supplier_id, reference ?? null, totalCost, amount_paid ?? 0, notes ?? null, received_by ?? null]
    );
    const receipt = grRows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO goods_received_items (goods_received_id, product_id, qty, unit_cost)
         VALUES ($1, $2, $3, $4)`,
        [receipt.id, item.product_id, item.qty, item.unit_cost]
      );

      await client.query('UPDATE products SET store_qty = store_qty + $1 WHERE id = $2', [
        item.qty,
        item.product_id,
      ]);

      // Keep cost_price current so margin and ROI reflect what was last paid.
      await client.query('UPDATE products SET cost_price = $1 WHERE id = $2', [
        item.unit_cost,
        item.product_id,
      ]);

      await client.query(
        `INSERT INTO stock_movements (product_id, movement_type, qty_change, location, reason, reference_id, staff_id)
         VALUES ($1, 'receipt', $2, 'store', $3, $4, $5)`,
        [item.product_id, item.qty, reference ? `Delivery ${reference}` : 'Goods received', receipt.id, received_by ?? null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ...receipt, items });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

inventoryRouter.get('/goods-received', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT g.*, s.name AS supplier_name, c.name AS received_by_name,
           (g.total_cost - g.amount_paid) AS balance_owed
    FROM goods_received g
    JOIN suppliers s ON s.id = g.supplier_id
    LEFT JOIN cashiers c ON c.id = g.received_by
    ORDER BY g.received_at DESC
    LIMIT 100
  `);
  res.json(rows);
});

inventoryRouter.get('/goods-received/:id', async (req, res) => {
  const { rows: header } = await pool.query(
    `SELECT g.*, s.name AS supplier_name
     FROM goods_received g JOIN suppliers s ON s.id = g.supplier_id
     WHERE g.id = $1`,
    [req.params.id]
  );
  if (header.length === 0) return res.status(404).json({ error: 'delivery not found' });

  const { rows: items } = await pool.query(
    `SELECT i.*, p.name AS product_name, p.sku
     FROM goods_received_items i
     JOIN products p ON p.id = i.product_id
     WHERE i.goods_received_id = $1`,
    [req.params.id]
  );

  res.json({ ...header[0], items });
});

// PATCH /api/inventory/goods-received/:id/payment
// body: { amount_paid }
// Recording a later payment against a delivery.
inventoryRouter.patch('/goods-received/:id/payment', async (req, res) => {
  const { amount_paid } = req.body;
  if (amount_paid === undefined) return res.status(400).json({ error: 'amount_paid is required' });

  const { rows } = await pool.query(
    `UPDATE goods_received SET amount_paid = $1 WHERE id = $2
     RETURNING *, (total_cost - $1) AS balance_owed`,
    [amount_paid, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'delivery not found' });
  res.json(rows[0]);
});

// ---------- Store to shelf ----------

// POST /api/inventory/transfer
// body: { product_id, qty, staff_id? }
inventoryRouter.post('/transfer', async (req, res) => {
  const { product_id, qty, staff_id } = req.body;
  const amount = Number(qty);

  if (!product_id || !amount || amount <= 0) {
    return res.status(400).json({ error: 'product_id and a positive qty are required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: check } = await client.query(
      'SELECT name, store_qty FROM products WHERE id = $1 FOR UPDATE',
      [product_id]
    );
    if (check.length === 0) throw Object.assign(new Error('product not found'), { status: 404 });

    if (check[0].store_qty < amount) {
      throw Object.assign(
        new Error(`Only ${check[0].store_qty} of ${check[0].name} in the store`),
        { status: 409 }
      );
    }

    const { rows } = await client.query(
      `UPDATE products SET store_qty = store_qty - $1, stock_qty = stock_qty + $1
       WHERE id = $2
       RETURNING id, sku, barcode, name, category, price, stock_qty, store_qty, reorder_level`,
      [amount, product_id]
    );

    // Two rows, because stock left one place and arrived in another.
    await client.query(
      `INSERT INTO stock_movements (product_id, movement_type, qty_change, location, reason, staff_id)
       VALUES ($1, 'transfer', $2, 'store', 'Moved to shelf', $3),
              ($1, 'transfer', $4, 'shelf', 'Received from store', $3)`,
      [product_id, -amount, staff_id ?? null, amount]
    );

    await client.query('COMMIT');

    const io = req.app.get('io');
    io.emit('stock:updated', [rows[0]]);

    res.json(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(err.status || 500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ---------- Adjustments ----------

// POST /api/inventory/adjust
// body: { product_id, location, qty_change, reason, staff_id? }
// For damage, expiry, theft, and recount corrections. A reason is required,
// because an unexplained stock change is the thing this table exists to stop.
inventoryRouter.post('/adjust', async (req, res) => {
  const { product_id, location, qty_change, reason, staff_id } = req.body;
  const change = Number(qty_change);

  if (!product_id || !change || !reason?.trim()) {
    return res.status(400).json({ error: 'product_id, qty_change and a reason are required' });
  }
  if (!['store', 'shelf'].includes(location)) {
    return res.status(400).json({ error: "location must be 'store' or 'shelf'" });
  }

  const column = location === 'store' ? 'store_qty' : 'stock_qty';

  const { rows } = await pool.query(
    `UPDATE products SET ${column} = ${column} + $1 WHERE id = $2
     RETURNING id, sku, barcode, name, category, price, stock_qty, store_qty, reorder_level`,
    [change, product_id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'product not found' });

  await pool.query(
    `INSERT INTO stock_movements (product_id, movement_type, qty_change, location, reason, staff_id)
     VALUES ($1, 'adjustment', $2, $3, $4, $5)`,
    [product_id, change, location, reason.trim(), staff_id ?? null]
  );

  const io = req.app.get('io');
  io.emit('stock:updated', [rows[0]]);
  checkLowStockAndAlert([rows[0]]).catch(() => {});

  res.json(rows[0]);
});

// ---------- Movement history ----------

inventoryRouter.get('/movements', async (req, res) => {
  const { product_id, limit } = req.query;

  const where = product_id ? 'WHERE m.product_id = $1' : '';
  const params = product_id ? [product_id] : [];

  const { rows } = await pool.query(
    `SELECT m.*, p.name AS product_name, p.sku, c.name AS staff_name
     FROM stock_movements m
     JOIN products p ON p.id = m.product_id
     LEFT JOIN cashiers c ON c.id = m.staff_id
     ${where}
     ORDER BY m.created_at DESC
     LIMIT ${Math.min(Number(limit) || 200, 500)}`,
    params
  );
  res.json(rows);
});

// ---------- ROI ----------

// GET /api/inventory/roi?days=30
// Revenue, cost and margin per product over a window. Only counts products
// with a cost price, since margin is meaningless without one.
inventoryRouter.get('/roi', async (req, res) => {
  const days = Math.min(Number(req.query.days) || 30, 365);

  const { rows } = await pool.query(
    `SELECT
       p.id, p.name, p.sku, p.category, p.price, p.cost_price,
       COALESCE(SUM(si.qty), 0)                                AS units_sold,
       COALESCE(SUM(si.qty * si.price), 0)                     AS revenue,
       COALESCE(SUM(si.qty * p.cost_price), 0)                 AS cost_of_goods,
       COALESCE(SUM(si.qty * (si.price - p.cost_price)), 0)    AS gross_profit
     FROM products p
     LEFT JOIN sale_items si ON si.product_id = p.id
     LEFT JOIN sales s ON s.id = si.sale_id AND s.created_at >= now() - ($1 || ' days')::interval
     WHERE p.cost_price IS NOT NULL
     GROUP BY p.id
     HAVING COALESCE(SUM(si.qty), 0) > 0
     ORDER BY gross_profit DESC`,
    [String(days)]
  );

  res.json(rows.map((r) => ({
    ...r,
    margin_pct: Number(r.revenue) > 0
      ? (Number(r.gross_profit) / Number(r.revenue)) * 100
      : 0,
  })));
});