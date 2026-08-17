import { SERVER_ORIGIN, fetchWithTimeout } from './client.js';

export async function fetchCashiers() {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/cashiers`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server responded ${res.status} from ${SERVER_ORIGIN}`);
  }
  return res.json();
}

export async function loginCashier({ first_name, last_name, password, terminal_id }) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/cashiers/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name, last_name, password, terminal_id }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Login failed');
  return body;
}

// Kept as a fallback for a shift that can't be closed normally. The usual
// path is closeShift below, which also records the cash count.
export async function clockOut(cashier_id) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/shifts/clock-out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cashier_id }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Clock-out failed');
  return body;
}

// ---------- Shift close and cash count ----------

export async function fetchShiftSummary() {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/shifts/current-summary`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Could not load the shift summary');
  return body;
}

export async function closeShift({ counted_cash, notes }) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/shifts/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ counted_cash, notes }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Could not close the shift');
  return body;
}

// ---------- Drawer ----------

// cashier_id is deliberately not sent. The server takes it from the session,
// so a till cannot log a drawer opening against someone else.
export async function verifyDrawerPin({ terminal_id, pin, reason }) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/drawer/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ terminal_id, pin, reason }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Could not verify the PIN');
  return body;
}