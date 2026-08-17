import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { siteConfig } from '../site.config.js';
import { managerIpGuard, tillIpGuard } from '../ipAllowlist.js';
import {
  createSession,
  revokeSession,
  revokeAllForCashier,
  revokeAllSessions,
  requireAuth,
  requireRole,
} from '../auth.js';
import { checkLowStockAndAlert } from '../whatsapp.js';

export const managerRouter = Router();

// Manager and admin functions need the right machine, a valid session, and
// the right role. Each catches something the others miss: IP proves where,
// the token proves who, the role proves what they may do.
const managerOnly = [managerIpGuard, requireAuth, requireRole('manager', 'admin')];

// ============================================================
// Sign-in
//
// These routes are deliberately unauthenticated -- they have to work before
// anyone has a session.
// ============================================================

// GET /api/manager/cashiers
// The till login screen. Active cashiers only, so manager and admin accounts
// never appear on a till and a deactivated cashier disappears from it.
managerRouter.get('/cashiers', tillIpGuard, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      c.id, c.name, c.first_name, c.last_name, c.role,
      s.id AS shift_id, s.terminal_id, s.clock_in
    FROM cashiers c
    LEFT JOIN shifts s ON s.cashier_id = c.id AND s.clock_out IS NULL
    WHERE c.role = 'cashier' AND c.active = true
    ORDER BY c.name
  `);
  res.json(rows);
});

// POST /api/manager/cashiers/login
// body: { first_name, last_name, password, terminal_id }
// Refuses manager and admin accounts outright, so hiding them from the
// login screen is presentation and this is the actual rule.
managerRouter.post('/cashiers/login', tillIpGuard, async (req, res) => {
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
    return res.status(401).json({ error: 'Wrong name or password' });
  }

  const valid = await bcrypt.compare(password, cashier.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Wrong name or password' });
  }

  if (!cashier.active) {
    return res.status(403).json({ error: 'This account has been deactivated. Speak to the manager.' });
  }

  if (cashier.role !== 'cashier') {
    return res.status(403).json({
      error: 'Manager accounts sign in on the manager terminal, not a till.',
    });
  }

  // A till taken out of service cannot trade, whoever signs in on it.
  const { rows: terminal } = await pool.query(
    'SELECT active, disabled_reason FROM terminals WHERE terminal_id = $1',
    [terminal_id]
  );
  if (terminal.length > 0 && !terminal[0].active) {
    return res.status(403).json({
      error: terminal[0].disabled_reason
        ? `This till is out of service: ${terminal[0].disabled_reason}`
        : 'This till has been taken out of service.',
    });
  }

  const { rows: openShift } = await pool.query(
    'SELECT id FROM shifts WHERE cashier_id = $1 AND clock_out IS NULL',
    [cashier.id]
  );
  if (openShift.length > 0) {
    return res.status(409).json({ error: 'You are already clocked in elsewhere' });
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

  const token = await createSession(cashier.id, terminal_id);

  res.json({ id: cashier.id, name: cashier.name, role: cashier.role, token });
});

// POST /api/manager/staff/login
// body: { first_name, last_name, password }
// The manager app's sign-in. No shift is opened, because a manager isn't
// occupying a till.
managerRouter.post('/staff/login', managerIpGuard, async (req, res) => {
  const { first_name, last_name, password } = req.body;

  if (!first_name || !last_name || !password) {
    return res.status(400).json({ error: 'first_name, last_name and password are required' });
  }

  const { rows } = await pool.query(
    'SELECT * FROM cashiers WHERE first_name = $1 AND last_name = $2',
    [first_name, last_name]
  );
  const staff = rows[0];

  if (!staff || !staff.password_hash) {
    return res.status(401).json({ error: 'Wrong name or password' });
  }

  const valid = await bcrypt.compare(password, staff.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Wrong name or password' });
  }

  if (!staff.active) {
    return res.status(403).json({ error: 'This account has been deactivated.' });
  }

  if (staff.role === 'cashier') {
    return res.status(403).json({ error: 'Cashier accounts sign in at a till, not here.' });
  }

  const token = await createSession(staff.id, null);

  res.json({ id: staff.id, name: staff.name, role: staff.role, token });
});

// POST /api/manager/signout
managerRouter.post('/signout', requireAuth, async (req, res) => {
  await revokeSession(req.session.token);
  res.json({ ok: true });
});

// ============================================================
// Staff management
// ============================================================

managerRouter.get('/staff', ...managerOnly, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      c.id, c.name, c.first_name, c.last_name, c.role, c.active,
      s.id AS shift_id, s.terminal_id, s.clock_in
    FROM cashiers c
    LEFT JOIN shifts s ON s.cashier_id = c.id AND s.clock_out IS NULL
    ORDER BY
      c.active DESC,
      CASE c.role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
      c.name
  `);
  res.json(rows);
});

// POST /api/manager/cashiers/register
// body: { first_name, last_name, password, role? }
managerRouter.post('/cashiers/register', ...managerOnly, async (req, res) => {
  const { first_name, last_name, password, role } = req.body;

  if (!first_name || !last_name || !password) {
    return res.status(400).json({ error: 'first_name, last_name and password are required' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }

  const fullName = `${first_name} ${last_name}`.trim();

  const { rows: existing } = await pool.query(
    'SELECT id FROM cashiers WHERE first_name = $1 AND last_name = $2',
    [first_name, last_name]
  );
  if (existing.length > 0) {
    return res.status(409).json({ error: 'Someone with that name already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { rows } = await pool.query(
    `INSERT INTO cashiers (name, first_name, last_name, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, first_name, last_name, role, active`,
    [fullName, first_name, last_name, passwordHash, role || 'cashier']
  );

  res.status(201).json(rows[0]);
});

// PATCH /api/manager/cashiers/:id/active
// body: { active }
//
// Deactivation is the usual way to remove someone -- shift history and sales
// attribution survive, which deletion sacrifices. Admin accounts cannot be
// deactivated here, for the same reason admin cannot be granted here.
managerRouter.patch('/cashiers/:id/active', ...managerOnly, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;

  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be true or false' });
  }
  if (Number(id) === req.session.cashierId) {
    return res.status(409).json({ error: 'You cannot deactivate your own account.' });
  }

  const { rows: target } = await pool.query('SELECT role FROM cashiers WHERE id = $1', [id]);
  if (target.length === 0) return res.status(404).json({ error: 'Account not found' });
  if (target[0].role === 'admin') {
    return res.status(403).json({ error: 'Admin accounts cannot be deactivated from here.' });
  }

  const { rows } = await pool.query(
    'UPDATE cashiers SET active = $1 WHERE id = $2 RETURNING id, name, role, active',
    [active, id]
  );

  if (!active) {
    // End any open shift and revoke access, otherwise they carry on working
    // until they happen to sign out.
    await pool.query(
      'UPDATE shifts SET clock_out = now() WHERE cashier_id = $1 AND clock_out IS NULL',
      [id]
    );
    await revokeAllForCashier(id);
  }

  res.json(rows[0]);
});

// DELETE /api/manager/cashiers/:id
//
// A real, permanent delete. Sessions and shifts are cleared explicitly first
// since those rows shouldn't outlive the account. Everything else that
// references this cashier is set to ON DELETE SET NULL at the database
// level, so old records keep existing for reporting but lose the name.
//
// Deactivating is almost always the better choice -- this exists for
// genuine mistakes, like an account created in error.
managerRouter.delete('/cashiers/:id', ...managerOnly, async (req, res) => {
  const { id } = req.params;

  if (Number(id) === req.session.cashierId) {
    return res.status(409).json({ error: 'You cannot delete your own account.' });
  }

  const { rows: openShift } = await pool.query(
    'SELECT id FROM shifts WHERE cashier_id = $1 AND clock_out IS NULL',
    [id]
  );
  if (openShift.length > 0) {
    return res.status(409).json({ error: 'Clock them out before deleting the account' });
  }

  await revokeAllForCashier(id);
  await pool.query('DELETE FROM sessions WHERE cashier_id = $1', [id]);
  await pool.query('DELETE FROM shifts WHERE cashier_id = $1', [id]);

  try {
    const { rows } = await pool.query('DELETE FROM cashiers WHERE id = $1 RETURNING id, name', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Account not found' });
    }
    res.json({ deleted: rows[0] });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(409).json({
        error: `This account still has related records blocking deletion (${err.constraint || 'unknown constraint'}). Deactivate them instead, or run the cashier foreign-key migration.`,
      });
    }
    throw err;
  }
});

// PATCH /api/manager/cashiers/:id/role
// The 'admin' role is intentionally never assignable here.
managerRouter.patch('/cashiers/:id/role', ...managerOnly, async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!['cashier', 'manager'].includes(role)) {
    return res.status(400).json({ error: "Role must be 'cashier' or 'manager'" });
  }

  const { rows: target } = await pool.query('SELECT role FROM cashiers WHERE id = $1', [id]);
  if (target.length === 0) return res.status(404).json({ error: 'Account not found' });
  if (target[0].role === 'admin') {
    return res.status(403).json({ error: 'An admin account cannot be demoted from here.' });
  }

  const { rows } = await pool.query(
    'UPDATE cashiers SET role = $1 WHERE id = $2 RETURNING id, name, role, active',
    [role, id]
  );

  // Their old session carries the old role, so end it. They sign in again
  // with whatever access the new role actually grants.
  await revokeAllForCashier(id);

  res.json(rows[0]);
});

// ============================================================
// Terminals
//
// site.config.js decides which machines are tills. This decides whether each
// is currently allowed to trade, which needs to survive a restart and be
// changeable without editing a file and redeploying.
// ============================================================

managerRouter.get('/terminals', ...managerOnly, async (req, res) => {
  const configured = siteConfig.tillIps.map((ip, i) => ({
    terminal_id: `till-${i + 1}`,
    ip,
  }));

  const { rows } = await pool.query(`
    SELECT t.terminal_id, t.label, t.active, t.disabled_reason, t.disabled_at,
           c.name AS disabled_by_name
    FROM terminals t
    LEFT JOIN cashiers c ON c.id = t.disabled_by
  `);
  const state = new Map(rows.map((r) => [r.terminal_id, r]));

  const { rows: onDuty } = await pool.query(`
    SELECT s.terminal_id, c.name AS cashier_name
    FROM shifts s JOIN cashiers c ON c.id = s.cashier_id
    WHERE s.clock_out IS NULL
  `);
  const busy = new Map(onDuty.map((r) => [r.terminal_id, r.cashier_name]));

  res.json(
    configured.map((t) => ({
      ...t,
      ...(state.get(t.terminal_id) || { active: true, label: null }),
      current_cashier: busy.get(t.terminal_id) || null,
    }))
  );
});

// PATCH /api/manager/terminals/:terminalId
// body: { active, reason?, label? }
managerRouter.patch('/terminals/:terminalId', ...managerOnly, async (req, res) => {
  const { terminalId } = req.params;
  const { active, reason, label } = req.body;

  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be true or false' });
  }

  const { rows } = await pool.query(
    `INSERT INTO terminals (terminal_id, label, active, disabled_reason, disabled_by, disabled_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (terminal_id) DO UPDATE SET
       label = COALESCE(EXCLUDED.label, terminals.label),
       active = EXCLUDED.active,
       disabled_reason = EXCLUDED.disabled_reason,
       disabled_by = EXCLUDED.disabled_by,
       disabled_at = EXCLUDED.disabled_at
     RETURNING *`,
    [
      terminalId,
      label ?? null,
      active,
      active ? null : (reason?.trim() || null),
      active ? null : req.session.cashierId,
      active ? null : new Date(),
    ]
  );

  if (!active) {
    // Clear the till, so nobody is left mid-shift on a machine that can no
    // longer sell.
    const { rows: ended } = await pool.query(
      `UPDATE shifts SET clock_out = now()
       WHERE terminal_id = $1 AND clock_out IS NULL
       RETURNING cashier_id`,
      [terminalId]
    );
    for (const shift of ended) await revokeAllForCashier(shift.cashier_id);
  }

  res.json(rows[0]);
});

// ============================================================
// Shifts
// ============================================================

managerRouter.post('/shifts/clock-in', requireAuth, async (req, res) => {
  const { cashier_id, terminal_id } = req.body;
  if (!cashier_id || !terminal_id) {
    return res.status(400).json({ error: 'cashier_id and terminal_id are required' });
  }

  const { rows: openShift } = await pool.query(
    'SELECT id FROM shifts WHERE cashier_id = $1 AND clock_out IS NULL',
    [cashier_id]
  );
  if (openShift.length > 0) {
    return res.status(409).json({ error: 'Already clocked in' });
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

// Ending a shift ends access too, rather than just closing a row.
managerRouter.post('/shifts/clock-out', requireAuth, async (req, res) => {
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
    return res.status(404).json({ error: 'No open shift for that person' });
  }

  await revokeAllForCashier(cashier_id);

  res.json(rows[0]);
});

// POST /api/manager/shifts/clock-out-all
// Emergency reset. Ends every shift and every session at once.
managerRouter.post('/shifts/clock-out-all', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    UPDATE shifts SET clock_out = now()
    WHERE clock_out IS NULL
    RETURNING id, cashier_id
  `);

  const sessionsEnded = await revokeAllSessions();

  res.json({ clockedOut: rows.length, sessionsEnded });
});

managerRouter.get('/shifts/history', ...managerOnly, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.id, c.name, c.role, s.terminal_id, s.clock_in, s.clock_out
    FROM shifts s
    JOIN cashiers c ON c.id = s.cashier_id
    ORDER BY s.clock_in DESC
    LIMIT 100
  `);
  res.json(rows);
});

// ============================================================
// Sales history
// ============================================================

managerRouter.get('/sales/history', ...managerOnly, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.id, s.terminal_id, s.payment_method, s.total, s.mpesa_ref, s.created_at,
           c.name AS cashier_name
    FROM sales s
    LEFT JOIN cashiers c ON c.id = s.cashier_id
    ORDER BY s.created_at DESC
    LIMIT 100
  `);
  res.json(rows);
});

// ============================================================
// Drawer PINs
//
// Set fresh each morning by the manager, one per till. A PIN is tied to a
// date, so yesterday's stops working on its own rather than relying on
// anyone remembering to clear it.
// ============================================================

// Failed attempts per till, held in memory. A 4-digit PIN is trivially
// brute-forced without this -- rate limiting matters more here than the
// hashing does, since 10,000 combinations fall in seconds otherwise.
const pinAttempts = new Map();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 5 * 60 * 1000;

function attemptState(terminalId) {
  const now = Date.now();
  const entry = pinAttempts.get(terminalId);
  if (!entry) return { count: 0, lockedUntil: 0 };
  if (entry.lockedUntil && entry.lockedUntil < now) {
    pinAttempts.delete(terminalId);
    return { count: 0, lockedUntil: 0 };
  }
  return entry;
}

// GET /api/manager/drawer/pins
// Which tills have a PIN today. The PIN itself is never returned -- if the
// manager forgets it, they set a new one.
managerRouter.get('/drawer/pins', ...managerOnly, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT d.terminal_id, d.created_at, c.name AS set_by_name
    FROM drawer_pins d
    LEFT JOIN cashiers c ON c.id = d.set_by
    WHERE d.valid_for = CURRENT_DATE AND d.cleared_at IS NULL
    ORDER BY d.terminal_id
  `);
  res.json(rows);
});

// POST /api/manager/drawer/pin
// body: { terminal_id, pin }
managerRouter.post('/drawer/pin', ...managerOnly, async (req, res) => {
  const { terminal_id, pin } = req.body;

  if (!terminal_id || !pin) {
    return res.status(400).json({ error: 'terminal_id and pin are required' });
  }
  if (!/^\d{4,8}$/.test(String(pin))) {
    return res.status(400).json({ error: 'The PIN must be 4 to 8 digits' });
  }

  const pinHash = await bcrypt.hash(String(pin), 10);

  const { rows } = await pool.query(
    `INSERT INTO drawer_pins (terminal_id, pin_hash, valid_for, set_by)
     VALUES ($1, $2, CURRENT_DATE, $3)
     ON CONFLICT (terminal_id, valid_for)
     DO UPDATE SET pin_hash = EXCLUDED.pin_hash,
                   set_by = EXCLUDED.set_by,
                   created_at = now(),
                   cleared_at = NULL
     RETURNING terminal_id, created_at`,
    [terminal_id, pinHash, req.session.cashierId]
  );

  // Setting a new PIN clears any lockout, so a manager fixing a forgotten
  // PIN doesn't leave the till still locked out.
  pinAttempts.delete(terminal_id);

  res.status(201).json(rows[0]);
});

// DELETE /api/manager/drawer/pin/:terminalId
// Ends drawer access for that till until a new PIN is set.
managerRouter.delete('/drawer/pin/:terminalId', ...managerOnly, async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE drawer_pins SET cleared_at = now()
     WHERE terminal_id = $1 AND valid_for = CURRENT_DATE AND cleared_at IS NULL
     RETURNING terminal_id`,
    [req.params.terminalId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'No active PIN for that till today' });
  }

  pinAttempts.delete(req.params.terminalId);
  res.json({ cleared: rows[0].terminal_id });
});

// POST /api/manager/drawer/verify
// body: { terminal_id, pin, reason }
//
// Verification and logging happen together on purpose. Separating them
// would let a till log a drawer open without ever passing the check.
managerRouter.post('/drawer/verify', tillIpGuard, requireAuth, async (req, res) => {
  const { terminal_id, pin, reason } = req.body;

  if (!terminal_id || !pin || !reason) {
    return res.status(400).json({ error: 'terminal_id, pin and reason are required' });
  }

  const state = attemptState(terminal_id);
  if (state.lockedUntil > Date.now()) {
    const mins = Math.ceil((state.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({
      error: `Too many wrong PINs. Try again in ${mins} minute${mins === 1 ? '' : 's'}, or ask the manager to set a new one.`,
    });
  }

  const { rows } = await pool.query(
    `SELECT pin_hash FROM drawer_pins
     WHERE terminal_id = $1 AND valid_for = CURRENT_DATE AND cleared_at IS NULL`,
    [terminal_id]
  );

  if (rows.length === 0) {
    return res.status(403).json({
      error: 'No drawer PIN has been set for this till today. Ask the manager.',
    });
  }

  const valid = await bcrypt.compare(String(pin), rows[0].pin_hash);

  if (!valid) {
    const count = state.count + 1;
    const locked = count >= MAX_ATTEMPTS;
    pinAttempts.set(terminal_id, {
      count,
      lockedUntil: locked ? Date.now() + LOCKOUT_MS : 0,
    });

    console.warn(`Wrong drawer PIN on ${terminal_id} (${count}/${MAX_ATTEMPTS})`);

    return res.status(401).json({
      error: locked
        ? 'Too many wrong PINs. The drawer is locked for 5 minutes.'
        : `Wrong PIN. ${MAX_ATTEMPTS - count} attempt${MAX_ATTEMPTS - count === 1 ? '' : 's'} left.`,
    });
  }

  pinAttempts.delete(terminal_id);

  // The cashier comes from the session, not the request body.
  const { rows: event } = await pool.query(
    `INSERT INTO drawer_events (cashier_id, terminal_id, reason)
     VALUES ($1, $2, $3) RETURNING *`,
    [req.session.cashierId, terminal_id, reason]
  );

  res.json({ ok: true, event: event[0] });
});

// GET /api/manager/drawer/history
managerRouter.get('/drawer/history', ...managerOnly, async (req, res) => {
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

managerRouter.get('/products', ...managerOnly, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT id, sku, barcode, name, category, price, cost_price, stock_qty,
           store_qty, reorder_level, active, created_at
    FROM products
    ORDER BY active DESC, name
  `);
  res.json(rows);
});

managerRouter.get('/products/next-sku', ...managerOnly, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT sku FROM products
    WHERE sku ~ '^PRD-[0-9]+$'
    ORDER BY CAST(SUBSTRING(sku FROM 5) AS INTEGER) DESC
    LIMIT 1
  `);

  const lastNumber = rows.length > 0 ? parseInt(rows[0].sku.slice(4), 10) : 0;
  res.json({ sku: `PRD-${String(lastNumber + 1).padStart(4, '0')}` });
});

managerRouter.get('/products/categories', ...managerOnly, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT DISTINCT category FROM products WHERE category IS NOT NULL ORDER BY category'
  );
  res.json(rows.map((r) => r.category));
});

// POST /api/manager/products
// body: { sku, barcode, name, category, price, cost_price?, stock_qty?, reorder_level? }
managerRouter.post('/products', ...managerOnly, async (req, res) => {
  const { sku, barcode, name, category, price, cost_price, stock_qty, reorder_level } = req.body;

  if (!sku || !barcode || !name || !category || price === undefined) {
    return res.status(400).json({ error: 'sku, barcode, name, category and price are required' });
  }
  if (Number(price) < 0) {
    return res.status(400).json({ error: 'Price cannot be negative' });
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
     RETURNING id, sku, barcode, name, category, price, cost_price, stock_qty, store_qty, reorder_level, active, created_at`,
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

managerRouter.patch('/products/:id/details', ...managerOnly, async (req, res) => {
  const { id } = req.params;
  const { sku, barcode, name, category, price, cost_price, reorder_level } = req.body;

  const fields = [];
  const values = [];
  let i = 1;

  const maybe = (col, val) => {
    if (val !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(val);
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
    return res.status(400).json({ error: 'Nothing to update' });
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
     RETURNING id, sku, barcode, name, category, price, cost_price, stock_qty, store_qty, reorder_level, active`,
    values
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const io = req.app.get('io');
  io.emit('stock:updated', [rows[0]]);

  res.json(rows[0]);
});

// PATCH /api/manager/products/:id/active
// Soft delete. The product vanishes from the till but stays intact in sales
// history, so old receipts and reports don't break.
managerRouter.patch('/products/:id/active', ...managerOnly, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;

  if (typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be true or false' });
  }

  const { rows } = await pool.query(
    `UPDATE products SET active = $1 WHERE id = $2
     RETURNING id, sku, barcode, name, category, price, stock_qty, store_qty, reorder_level, active`,
    [active, id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const io = req.app.get('io');
  io.emit('stock:updated', [rows[0]]);

  res.json(rows[0]);
});

// PATCH /api/manager/products/:id
// Quick inline edits from the catalogue table.
managerRouter.patch('/products/:id', ...managerOnly, async (req, res) => {
  const { id } = req.params;
  const { stock_qty, price, reorder_level } = req.body;

  if (stock_qty === undefined && price === undefined && reorder_level === undefined) {
    return res.status(400).json({ error: 'Provide stock_qty, price and/or reorder_level' });
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
     RETURNING id, sku, barcode, name, category, price, stock_qty, store_qty, reorder_level`,
    values
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const io = req.app.get('io');
  io.emit('stock:updated', [rows[0]]);

  checkLowStockAndAlert([rows[0]]).catch(() => {});

  res.json(rows[0]);
});