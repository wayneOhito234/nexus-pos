export let SERVER_ORIGIN = 'http://localhost:4000';

// Held in memory only, never written to disk. Closing the window ends the
// session, which is the behaviour a manager terminal should have.
let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

export function clearAuthToken() {
  authToken = null;
}

export async function loadServerOrigin() {
  const config = await window.nexusConfig?.read();
  if (config?.serverOrigin) SERVER_ORIGIN = config.serverOrigin;
  return SERVER_ORIGIN;
}

async function request(path, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${SERVER_ORIGIN}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      // A 401 means the session died -- expired, revoked, or the server
      // restarted. Say so plainly rather than passing on a generic error.
      if (res.status === 401) {
        throw new Error(body.error || 'Your session ended. Sign in again.');
      }
      throw new Error(body.error || `Server responded ${res.status}`);
    }

    return body;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`No response from ${SERVER_ORIGIN}`);
    if (err instanceof TypeError) throw new Error(`Cannot reach ${SERVER_ORIGIN}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const get = (path) => request(path);
const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });
const patch = (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = (path) => request(path, { method: 'DELETE' });

// ---------- Auth ----------
export const staffLogin = (creds) => post('/api/manager/staff/login', creds);
export const signOut = () => post('/api/manager/signout', {});

// ---------- Staff ----------
export const fetchStaff = () => get('/api/manager/staff');
export const registerStaff = (data) => post('/api/manager/cashiers/register', data);
export const updateStaffRole = (id, role) => patch(`/api/manager/cashiers/${id}/role`, { role });
export const setStaffActive = (id, active) => patch(`/api/manager/cashiers/${id}/active`, { active });
export const deleteStaff = (id) => del(`/api/manager/cashiers/${id}`);
export const clockOutAll = () => post('/api/manager/shifts/clock-out-all', {});
export const clockOutStaff = (cashier_id) => post('/api/manager/shifts/clock-out', { cashier_id });

// ---------- Terminals ----------
export const fetchTerminals = () => get('/api/manager/terminals');
export const setTerminalActive = (terminalId, active, reason, default_float) =>
  patch(`/api/manager/terminals/${terminalId}`, { active, reason, default_float });

// ---------- Products ----------
export const fetchAllProducts = () => get('/api/manager/products');
export const fetchNextSku = () => get('/api/manager/products/next-sku');
export const fetchCategories = () => get('/api/manager/products/categories');
export const createProduct = (p) => post('/api/manager/products', p);
export const updateProductDetails = (id, changes) =>
  patch(`/api/manager/products/${id}/details`, changes);
export const setProductActive = (id, active) =>
  patch(`/api/manager/products/${id}/active`, { active });
export const adjustProduct = (id, changes) => patch(`/api/manager/products/${id}`, changes);

// ---------- Inventory ----------
export const fetchSuppliers = () => get('/api/inventory/suppliers');
export const createSupplier = (s) => post('/api/inventory/suppliers', s);
export const updateSupplier = (id, s) => patch(`/api/inventory/suppliers/${id}`, s);
export const fetchDeliveries = () => get('/api/inventory/goods-received');
export const fetchDelivery = (id) => get(`/api/inventory/goods-received/${id}`);
export const createDelivery = (d) => post('/api/inventory/goods-received', d);
export const recordPayment = (id, amount_paid) =>
  patch(`/api/inventory/goods-received/${id}/payment`, { amount_paid });
export const transferToShelf = (t) => post('/api/inventory/transfer', t);
export const adjustStock = (a) => post('/api/inventory/adjust', a);
export const fetchMovements = (productId) =>
  get(`/api/inventory/movements${productId ? `?product_id=${productId}` : ''}`);
export const fetchRoi = (days = 30) => get(`/api/inventory/roi?days=${days}`);

// ---------- Drawer PINs ----------
export const fetchDrawerPins = () => get('/api/manager/drawer/pins');
export const setDrawerPin = (terminal_id, pin) =>
  post('/api/manager/drawer/pin', { terminal_id, pin });
export const clearDrawerPin = (terminalId) => del(`/api/manager/drawer/pin/${terminalId}`);

// ---------- Reporting and analytics ----------
export const fetchDashboard = () => get('/api/analytics/dashboard');
export const fetchAnalyticsSummary = () => get('/api/analytics/summary');
export const fetchBreakdown = (period = 'day') => get(`/api/analytics/breakdown?period=${period}`);
export const fetchBalanceSheet = (period = 'month') =>
  get(`/api/analytics/balance-sheet?period=${period}`);
export const fetchTopProducts = (days = 30, limit = 10) =>
  get(`/api/analytics/top-products?days=${days}&limit=${limit}`);
export const fetchReceipt = (saleId) => get(`/api/analytics/receipt/${saleId}`);
export const fetchSalesHistory = () => get('/api/manager/sales/history');
export const fetchShiftHistory = () => get('/api/manager/shifts/history');
export const fetchDrawerHistory = () => get('/api/manager/drawer/history');

// ---------- Cash reconciliation ----------
export const fetchReconciliation = (days = 7) =>
  get(`/api/manager/shifts/reconciliation?days=${days}`);

// ---------- Operational insights ----------
export const fetchHourly = (days = 7) => get(`/api/analytics/hourly?days=${days}`);
export const fetchSlowMovers = (days = 60) => get(`/api/analytics/slow-movers?days=${days}`);
export const fetchStockValue = () => get('/api/analytics/stock-value');
export const fetchShrinkage = (days = 30) => get(`/api/analytics/shrinkage?days=${days}`);

// ---------- Site info ----------
// Reads the deployment's own configuration, so components can show which
// tills exist rather than having them hardcoded.
export const fetchSiteInfo = () => get('/api/site');