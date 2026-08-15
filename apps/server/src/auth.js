import crypto from 'node:crypto';
import { pool } from './db.js';

// Sessions last a long shift plus slack, then die on their own. A till left
// signed in overnight shouldn't still be authenticated in the morning.
const SESSION_HOURS = 16;

// Stored as a SHA-256 hash so a database leak doesn't hand over live
// sessions. Not bcrypt -- that salts each hash, which would make lookup by
// token impossible without scanning every row.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createSession(cashierId, terminalId = null) {
  const token = crypto.randomBytes(32).toString('base64url');

  await pool.query(
    `INSERT INTO sessions (token_hash, cashier_id, terminal_id, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' hours')::interval)`,
    [hashToken(token), cashierId, terminalId, String(SESSION_HOURS)]
  );

  return token;
}

export async function revokeSession(token) {
  if (!token) return;
  await pool.query(
    'UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashToken(token)]
  );
}

export async function revokeAllForCashier(cashierId) {
  await pool.query(
    'UPDATE sessions SET revoked_at = now() WHERE cashier_id = $1 AND revoked_at IS NULL',
    [cashierId]
  );
}

export async function revokeAllSessions() {
  const { rowCount } = await pool.query(
    'UPDATE sessions SET revoked_at = now() WHERE revoked_at IS NULL'
  );
  return rowCount;
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

// Attaches req.session = { cashierId, name, role, terminalId, token }.
// Everything downstream reads identity from here, never from the request
// body -- a client can claim anything, a session row cannot.
export async function requireAuth(req, res, next) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Not signed in' });
  }

  const { rows } = await pool.query(
    `SELECT s.id, s.cashier_id, s.terminal_id, s.expires_at, s.revoked_at,
            c.name, c.role
     FROM sessions s
     JOIN cashiers c ON c.id = s.cashier_id
     WHERE s.token_hash = $1`,
    [hashToken(token)]
  );

  const session = rows[0];

  if (!session) {
    return res.status(401).json({ error: 'Session not recognised. Sign in again.' });
  }
  if (session.revoked_at) {
    return res.status(401).json({ error: 'Session ended. Sign in again.' });
  }
  if (new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Session expired. Sign in again.' });
  }

  req.session = {
    cashierId: session.cashier_id,
    name: session.name,
    role: session.role,
    terminalId: session.terminal_id,
    token,
  };

  // Fire and forget -- a failed timestamp update shouldn't block the request.
  pool.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [session.id]).catch(() => {});

  next();
}

export function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.session) return res.status(401).json({ error: 'Not signed in' });
    if (!allowed.includes(req.session.role)) {
      return res.status(403).json({ error: 'Your account cannot do that.' });
    }
    next();
  };
}