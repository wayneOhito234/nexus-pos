export let SERVER_ORIGIN = 'http://localhost:4000';

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
      headers: { 'Content-Type': 'application/json' },
      ...options,
      signal: controller.signal,
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Server responded ${res.status}`);
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

// ---------- Auth and staff ----------
export const staffLogin = (creds) => post('/api/manager/staff/login', creds);
export const fetchStaff = () => get('/api/manager/staff');
export const registerStaff = (data) => post('/api/manager/cashiers/register', data);
export const updateStaffRole = (id, role) => patch(`/api/manager/cashiers/${id}/role`, { role });
export const deleteStaff = (id) => del(`/api/manager/cashiers/${id}`);
export const clockOutAll = () => post('/api/manager/shifts/clock-out-all', {});
export const clockOutStaff = (cashier_id) => post('/api/manager/shifts/clock-out', { cashier_id });

// ---------- Products ----------
export const fetchAllProducts = () => get('/api/manager/products');
export const fetchNextSku = () => get('/api/manager/products/next-sku');
export const fetchCategories = () => get('/api/manager/products/categories');
export const createProduct = (p) => post('/api/manager/products', p);
export const updateProductDetails = (id, changes) => patch(`/api/manager/products/${id}/details`, changes);
export const setProductActive = (id, active) => patch(`/api/manager/products/${id}/active`, { active });
export const adjustProduct = (id, changes) => patch(`/api/manager/products/${id}`, changes);

// ---------- Inventory ----------
export const fetchSuppliers = () => get('/api/inventory/suppliers');
export const createSupplier = (s) => post('/api/inventory/suppliers', s);
export const updateSupplier = (id, s) => patch(`/api/inventory/suppliers/${id}`, s);
export const fetchDeliveries = () => get('/api/inventory/goods-received');
export const fetchDelivery = (id) => get(`/api/inventory/goods-received/${id}`);
export const createDelivery = (d) => post('/api/inventory/goods-received', d);
export const recordPayment = (id, amount_paid) => patch(`/api/inventory/goods-received/${id}/payment`, { amount_paid });
export const transferToShelf = (t) => post('/api/inventory/transfer', t);
export const adjustStock = (a) => post('/api/inventory/adjust', a);
export const fetchMovements = (productId) =>
  get(`/api/inventory/movements${productId ? `?product_id=${productId}` : ''}`);
export const fetchRoi = (days = 30) => get(`/api/inventory/roi?days=${days}`);

// ---------- Reporting ----------
export const fetchAnalyticsSummary = () => get('/api/analytics/summary');
export const fetchSalesHistory = () => get('/api/manager/sales/history');
export const fetchShiftHistory = () => get('/api/manager/shifts/history');
export const fetchDrawerHistory = () => get('/api/manager/drawer/history');