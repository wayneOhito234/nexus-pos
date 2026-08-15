export let SERVER_ORIGIN = 'http://localhost:4000'; // overwritten once config loads

// Held in memory only, never written to disk. Closing the window ends the
// session, which is exactly the behaviour a shared till should have.
let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

export function clearAuthToken() {
  authToken = null;
}

export async function loadServerOrigin() {
  const config = await window.nexusConfig?.read();
  if (config?.serverOrigin) {
    SERVER_ORIGIN = config.serverOrigin;
  }
  return SERVER_ORIGIN;
}

// Wraps fetch with a timeout so a wrong or unreachable server address fails
// with a clear message instead of hanging the UI indefinitely. Also attaches
// the session token, so individual calls don't each have to remember to.
export async function fetchWithTimeout(url, options = {}, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    ...(options.headers || {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };

  try {
    return await fetch(url, { ...options, headers, signal: controller.signal });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`No response from ${SERVER_ORIGIN} after ${timeoutMs / 1000}s`);
    }
    throw new Error(`Cannot reach ${SERVER_ORIGIN}`);
  } finally {
    clearTimeout(timer);
  }
}

// Quick reachability check, used by the setup screen before saving an address.
export async function testServerConnection(origin, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${origin}/health`, { signal: controller.signal });
    if (!res.ok) return { ok: false, message: `Server responded ${res.status}` };
    return { ok: true };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { ok: false, message: `No response after ${timeoutMs / 1000}s` };
    }
    return { ok: false, message: 'Could not connect' };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchProducts() {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/products`);
  if (!res.ok) throw new Error(`Server responded ${res.status} when fetching products`);
  return res.json();
}

export async function postSale(payload) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Could not complete the sale');
  return body;
}

export async function initiateStkPush({ phone, amount, terminal_id }) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/mpesa/stkpush`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, amount, terminal_id }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'STK push failed');
  return body;
}

export async function checkPaymentStatus(checkoutRequestId) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/mpesa/status/${checkoutRequestId}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Status check failed');
  return body;
}