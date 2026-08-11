import { SERVER_ORIGIN, fetchWithTimeout } from './client.js';

export async function fetchCashiers() {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/cashiers`);
  if (!res.ok) throw new Error(`Server responded ${res.status} from ${SERVER_ORIGIN}`);
  return res.json();
}

export async function clockIn(cashier_id, terminal_id) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/shifts/clock-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cashier_id, terminal_id }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'clock-in failed');
  return body;
}

export async function clockOut(cashier_id) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/shifts/clock-out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cashier_id }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'clock-out failed');
  return body;
}

export async function adjustProduct(productId, { stock_qty, price, reorder_level }) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/products/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stock_qty, price, reorder_level }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'adjustment failed');
  return body;
}

export async function registerCashier({ first_name, last_name, password, role }) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/cashiers/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name, last_name, password, role }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'registration failed');
  return body;
}

export async function loginCashier({ first_name, last_name, password, terminal_id }) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/cashiers/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ first_name, last_name, password, terminal_id }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'login failed');
  return body;
}

export async function fetchAnalyticsSummary() {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/analytics/summary`);
  if (!res.ok) throw new Error('failed to fetch analytics');
  return res.json();
}

export async function deleteCashier(cashierId) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/cashiers/${cashierId}`, {
    method: 'DELETE',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'failed to delete cashier');
  return body;
}

export async function fetchShiftHistory() {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/shifts/history`);
  if (!res.ok) throw new Error('failed to fetch shift history');
  return res.json();
}

export async function fetchSalesHistory() {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/sales/history`);
  if (!res.ok) throw new Error('failed to fetch sales history');
  return res.json();
}

export async function updateCashierRole(cashierId, role) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/cashiers/${cashierId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'failed to update role');
  return body;
}

export async function clockOutAll() {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/shifts/clock-out-all`, {
    method: 'POST',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'failed to clock out all');
  return body;
}

export async function openDrawer({ cashier_id, terminal_id, reason }) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/drawer/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cashier_id, terminal_id, reason }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'failed to log drawer open');
  return body;
}

export async function fetchDrawerHistory() {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/drawer/history`);
  if (!res.ok) throw new Error('failed to fetch drawer history');
  return res.json();
}

// ---------- Product catalogue ----------

export async function fetchAllProducts() {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/products`);
  if (!res.ok) throw new Error('Could not load the product list');
  return res.json();
}

export async function fetchNextSku() {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/products/next-sku`);
  if (!res.ok) throw new Error('Could not generate a SKU');
  return res.json();
}

export async function fetchCategories() {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/products/categories`);
  if (!res.ok) throw new Error('Could not load categories');
  return res.json();
}

export async function createProduct(product) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Could not save the product');
  return body;
}

export async function updateProductDetails(productId, changes) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/products/${productId}/details`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Could not save the changes');
  return body;
}

export async function setProductActive(productId, active) {
  const res = await fetchWithTimeout(`${SERVER_ORIGIN}/api/manager/products/${productId}/active`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Could not change the product status');
  return body;
}