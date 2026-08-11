import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { checkLowStockAndAlert } from '../whatsapp.js';

export const managerRouter = Router();

// GET /api/manager/cashiers
// List all cashiers, with their current shift (if clocked in) included.
managerRouter.get('/cashiers', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      c.id, c.name, c.first_name, c.last_name, c.role,
      s.id AS shift_id, s.terminal_id, s.clock_in
    FROM cashiers c
    LEFT JOIN shifts s ON s.cashier_id = c.id AND s.clock_out IS NULL
    ORDER BY c.name
  `);
  res.json(rows);
});

// POST /api/manager/cashiers/register
// body: { first_name, last_name, password, role? }
managerRouter.post('/cashiers/register', async (req, res) => {
  const { first_name, last_name, password, role } = req.body;

  if (!first_name || !last_name || !password) {
    return res.status(400).json({ error: 'first_name, last_name and password are required' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'password must be at least 4 characters' });
  }

  const fullName = `${first_name} ${last_name}`.trim();

  const { rows: existing } = await pool.query(
    'SELECT id FROM cashiers WHERE first_name = $1 AND last_name = $2',
    [first_name, last_name]
  );
  if (existing.length > 0) {
    return res.status(409).json({ error: 'a cashier with this name already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { rows } = await pool.query(
    `INSERT INTO cashiers (name, first_name, last_name, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, first_name, last_name, role`,
    [fullName, first_name, last_name, passwordHash, role || 'cashier']
  );

  res.status(201).json(rows[0]);
});

// POST /api/manager/cashiers/login
// body: { first_name, last_name, password, terminal_id }
managerRouter.post('/cashiers/login', async (req, res) => {
  const { first_name, last_name, password, terminal_id } = req.body;

  if (!first_name || !last_name || !password || !terminal_id) {
    return res.status(400).json({ error: 'first_name, last_name, password and terminal_id are required' });
  }

  const { rows } = await pool.query(
    'SELECT * FROM cashiers WHERE first_name = $1 AND last_name = $2',
    [first_name, last_name]
  );
  const cashier = rows[0];

  if (!cashier || !cashier.password_hash) {
    return res.status(401).json({ error: 'invalid name or password' });
  }

  const valid = await bcrypt.compare(password, cashier.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'invalid name or password' });
  }

  const { rows: openShift } = await pool.query(
    'SELECT id FROM shifts WHERE cashier_id = $1 AND clock_out IS NULL',
    [cashier.id]
  );
  if (openShift.length > 0) {
    return res.status(409).json({ error: 'you are already clocked in elsewhere' });
  }

  const { rows: terminalOccupied } = await pool.query(
    'SELECT c.name FROM shifts s JOIN cashiers c ON c.id = s.cashier_id WHERE s.terminal_id = $1 AND s.clock_out IS NULL',
    [terminal_id]
  );
  if (terminalOccupied.length > 0) {
    return res.status(409).json({ error: `${terminalOccupied[0].name} is already clocked in on this terminal` });
  }

  await pool.query('INSERT INTO shifts (cashier_id, terminal_id) VALUES ($1, $2)', [
    cashier.id,
    terminal_id,
  ]);

  res.json({ id: cashier.id, name: cashier.name, role: cashier.role });
});

// DELETE /api/manager/cashiers/:id
managerRouter.delete('/cashiers/:id', async (req, res) => {
  const { id } = req.params;

  const { rows: openShift } = await pool.query(
    'SELECT id FROM shifts WHERE cashier_id = $1 AND clock_out IS NULL',
    [id]
  );
  if (openShift.length > 0) {
    return res.status(409).json({ error: 'cannot delete a cashier who is currently clocked in' });
  }

  await pool.query('DELETE FROM shifts WHERE cashier_id = $1', [id]);
  const { rows } = await pool.query('DELETE FROM cashiers WHERE id = $1 RETURNING id, name', [id]);

  if (rows.length === 0) {
    return res.status(404).json({ error: 'cashier not found' });
  }

  res.json({ deleted: rows[0] });
});

// PATCH /api/manager/cashiers/:id/role
// The 'admin' role is intentionally never assignable through this endpoint.
managerRouter.patch('/cashiers/:id/role', async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!['cashier', 'manager'].includes(role)) {
    return res.status(400).json({ error: "role must be 'cashier' or 'manager'" });
  }

  const { rows } = await pool.query(
    'UPDATE cashiers SET role = $1 WHERE id = $2 RETURNING id, name, role',
    [role, id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'cashier not found' });
  }

  res.json(rows[0]);
});

// POST /api/manager/shifts/clock-in
managerRouter.post('/shifts/clock-in', async (req, res) => {
  const { cashier_id, terminal_id } = req.body;
  if (!cashier_id || !terminal_id) {
    return res.status(400).json({ error: 'cashier_id and terminal_id are required' });
  }

  const { rows: openShift } = await pool.query(
    'SELECT id FROM shifts WHERE cashier_id = $1 AND clock_out IS NULL',
    [cashier_id]
  );
  if (openShift.length > 0) {
    return res.status(409).json({ error: 'cashier is already clocked in' });
  }

  const { rows: terminalOccupied } = await pool.query(
    'SELECT c.name FROM shifts s JOIN cashiers c ON c.id = s.cashier_id WHERE s.terminal_id = $1 AND s.clock_out IS NULL',
    [terminal_id]
  );
  if (terminalOccupied.length > 0) {
    return res.status(409).json({ error: `${terminalOccupied[0].name} is already clocked in on this terminal` });
  }

  const { rows } = await pool.query(
    'INSERT INTO shifts (cashier_id, terminal_id) VALUES ($1, $2) RETURNING *',
    [cashier_id, terminal_id]
  );
  res.status(201).json(rows[0]);
});

// POST /api/manager/shifts/clock-out
managerRouter.post('/shifts/clock-out', async (req, res) => {
  const { cashier_id } = req.body;
  if (!cashier_id) {
    return res.status(400).json({ error: 'cashier_id is required' });
  }

  const { rows } = await pool.query(
    `UPDATE shifts SET clock_out = now()
     WHERE cashier_id = $1 AND clock_out IS NULL
     RETURNING *`,
    [cashier_id]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'no open shift found for this cashier' });
  }
  res.json(rows[0]);
});

// POST /api/manager/shifts/clock-out-all
// Emergency reset: clocks out every currently-active shift at once.
managerRouter.post('/shifts/clock-out-all', async (req, res) => {
  const { rows } = await pool.query(`
    UPDATE shifts SET clock_out = now()
    WHERE clock_out IS NULL
    RETURNING id, cashier_id
  `);
  res.json({ clockedOut: rows.length });
});

// GET /api/manager/shifts/history
managerRouter.get('/shifts/history', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.id, c.name, c.role, s.terminal_id, s.clock_in, s.clock_out
    FROM shifts s
    JOIN cashiers c ON c.id = s.cashier_id
    ORDER BY s.clock_in DESC
    LIMIT 100
  `);
  res.json(rows);
});

// GET /api/manager/sales/history
managerRouter.get('/sales/history', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT id, terminal_id, payment_method, total, mpesa_ref, created_at
    FROM sales
    ORDER BY created_at DESC
    LIMIT 100
  `);
  res.json(rows);
});

// POST /api/manager/drawer/open
// Logs a drawer opening that isn't tied to a sale (a "No Sale" open).
managerRouter.post('/drawer/open', async (req, res) => {
  const { cashier_id, terminal_id, reason } = req.body;
  if (!terminal_id || !reason) {
    return res.status(400).json({ error: 'terminal_id and reason are required' });
  }

  const { rows } = await pool.query(
    `INSERT INTO drawer_events (cashier_id, terminal_id, reason)
     VALUES ($1, $2, $3) RETURNING *`,
    [cashier_id || null, terminal_id, reason]
  );
  res.status(201).json(rows[0]);
});

// GET /api/manager/drawer/history
managerRouter.get('/drawer/history', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT d.id, d.terminal_id, d.reason, d.created_at, c.name AS cashier_name
    FROM drawer_events d
    LEFT JOIN cashiers c ON c.id = d.cashier_id
    ORDER BY d.created_at DESC
    LIMIT 100
  `);
  res.json(rows);
});

// ============================================================
// Product management
// ============================================================

// GET /api/manager/products
// Full catalogue including inactive items, which the till never sees.
managerRouter.get('/products', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT id, sku, barcode, name, category, price, cost_price, stock_qty,
           reorder_level, active, created_at
    FROM products
    ORDER BY active DESC, name
  `);
  res.json(rows);
});

// GET /api/manager/products/next-sku
// Suggests the next SKU so the form can prefill it. The manager can still
// overwrite it before saving.
managerRouter.get('/products/next-sku', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT sku FROM products
    WHERE sku ~ '^PRD-[0-9]+$'
    ORDER BY CAST(SUBSTRING(sku FROM 5) AS INTEGER) DESC
    LIMIT 1
  `);

  const lastNumber = rows.length > 0 ? parseInt(rows[0].sku.slice(4), 10) : 0;
  res.json({ sku: `PRD-${String(lastNumber + 1).padStart(4, '0')}` });
});

// GET /api/manager/products/categories
// Existing categories, so the form can offer them rather than relying on
// the manager to retype them consistently.
managerRouter.get('/products/categories', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category'
  );
  res.json(rows.map((r) => r.category));
});

// POST /api/manager/products
// body: { sku, barcode, name, category, price, cost_price?, stock_qty?, reorder_level? }
managerRouter.post('/products', async (req, res) => {
  const { sku, barcode, name, category, price, cost_price, stock_qty, reorder_level } = req.body;

  if (!sku || !barcode || !name || !category || price === undefined) {
    return res.status(400).json({ error: 'sku, barcode, name, category and price are required' });
  }
  if (Number(price) < 0) {
    return res.status(400).json({ error: 'price cannot be negative' });
  }

  const { rows: clash } = await pool.query(
    'SELECT id, sku, barcode FROM products WHERE sku = $1 OR barcode = $2',
    [sku.trim(), barcode.trim()]
  );
  if (clash.length > 0) {
    const which = clash[0].sku === sku.trim() ? 'SKU' : 'barcode';
    return res.status(409).json({ error: `That ${which} is already in use` });
  }

  const { rows } = await pool.query(
    `INSERT INTO products (sku, barcode, name, category, price, cost_price, stock_qty, reorder_level)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, sku, barcode, name, category, price, cost_price, stock_qty, reorder_level, active, created_at`,
    [
      sku.trim(),
      barcode.trim(),
      name.trim(),
      category.trim(),
      price,
      cost_price ?? null,
      stock_qty ?? 0,
      reorder_level ?? 10,
    ]
  );

  const io = req.app.get('io');
  io.emit('stock:updated', [rows[0]]);

  res.status(201).json(rows[0]);
});

// PATCH /api/manager/products/:id/details
// Editing the descriptive fields. Stock and price quick-edits stay on the
// plain PATCH route below.
managerRouter.patch('/products/:id/details', async (req, res) => {
  const { id } = req.params;
  const { sku, barcode, name, category, price, cost_price, reorder_level } = req.body;

  const fields = [];
  const values = [];
  let i = 1;

  const maybe = (column, value) => {
    if (value !== undefined) {
      fields.push(`${column} = $${i++}`);
      values.push(value);
    }
  };

  maybe('sku', sku?.trim());
  maybe('barcode', barcode?.trim());
  maybe('name', name?.trim());
  maybe('category', category?.trim());
  maybe('price', price);
  maybe('cost_price', cost_price);
  maybe('reorder_level', reorder_level);

  if (fields.length === 0) {
    return res.status(400).json({ error: 'nothing to update' });
  }

  if (sku || barcode) {
    const { rows: clash } = await pool.query(
      'SELECT id FROM products WHERE (sku = $1 OR barcode = $2) AND id <> $3',
      [sku?.trim() ?? null, barcode?.trim() ?? null, id]
    );
    if (clash.length > 0) {
      return res.status(409).json({ error: 'That SKU or barcode belongs to another product' });
    }
  }

  values.push(id);

  const { rows } = await pool.query(
    `UPDATE products SET ${fields.join(', ')} WHERE id = $${i}
     RETURNING id, sku, barcode, name, category, price, cost_price, stock_qty, reorder_level, active`,
    values
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'product not found' });
  }

  const io = req.app.get('io');
  io.emit('stock:updated', [rows[0]]);

  res.json(rows[0]);
});

// PATCH /api/manager/products/:id/active
// body: { active }
// Soft delete. The product vanishes from the till but stays intact in sales
// history, so old receipts and reports don't break.
managerRouter.patch('/products/:id/active', async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;

  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be true or false' });
  }

  const { rows } = await pool.query(
    `UPDATE products SET active = $1 WHERE id = $2
     RETURNING id, sku, barcode, name, category, price, stock_qty, reorder_level, active`,
    [active, id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'product not found' });
  }

  const io = req.app.get('io');
  io.emit('stock:updated', [rows[0]]);

  res.json(rows[0]);
});

// PATCH /api/manager/products/:id
// body: { stock_qty?, price?, reorder_level? }
// Quick inline edits from the stock table.
managerRouter.patch('/products/:id', async (req, res) => {
  const { id } = req.params;
  const { stock_qty, price, reorder_level } = req.body;

  if (stock_qty === undefined && price === undefined && reorder_level === undefined) {
    return res.status(400).json({ error: 'provide stock_qty, price and/or reorder_level to update' });
  }

  const fields = [];
  const values = [];
  let i = 1;

  if (stock_qty !== undefined) {
    fields.push(`stock_qty = $${i++}`);
    values.push(stock_qty);
  }
  if (price !== undefined) {
    fields.push(`price = $${i++}`);
    values.push(price);
  }
  if (reorder_level !== undefined) {
    fields.push(`reorder_level = $${i++}`);
    values.push(reorder_level);
  }
  values.push(id);

  const { rows } = await pool.query(
    `UPDATE products SET ${fields.join(', ')} WHERE id = $${i}
     RETURNING id, sku, barcode, name, category, price, stock_qty, reorder_level`,
    values
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'product not found' });
  }

  const io = req.app.get('io');
  io.emit('stock:updated', [rows[0]]);

  checkLowStockAndAlert([rows[0]]).catch(() => {});

  res.json(rows[0]);
});