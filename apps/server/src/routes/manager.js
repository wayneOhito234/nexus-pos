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
// Manager creates a new cashier account with a password.
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
// Verifies password, then clocks the cashier in (reuses the same
// terminal-occupied and already-clocked-in checks as /shifts/clock-in).
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
// Removes a cashier account entirely. Blocked if they're currently
// clocked in -- they must be clocked out first.
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
// body: { role } -- only 'cashier' or 'manager' allowed here.
// The 'admin' role is intentionally never assignable through this
// endpoint -- it's set directly in the database, so nobody can
// escalate their own or another account to admin through the UI.
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
// body: { cashier_id, terminal_id }
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
// body: { cashier_id }
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
// All shifts, most recent first -- who worked when, on which terminal.
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
// All sales, most recent first.
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
// body: { cashier_id, terminal_id, reason }
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

// PATCH /api/manager/products/:id
// body: { stock_qty?, price?, reorder_level? }
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