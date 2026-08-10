export let SERVER_ORIGIN = 'http://localhost:4000'; // overwritten once config loads

export async function loadServerOrigin() {
  const config = await window.nexusConfig?.read();
  if (config?.serverOrigin) {
    SERVER_ORIGIN = config.serverOrigin;
  }
  return SERVER_ORIGIN;
}

export async function fetchProducts() {
  const res = await fetch(`${SERVER_ORIGIN}/api/products`);
  if (!res.ok) throw new Error('failed to fetch products');
  return res.json();
}

export async function postSale(payload) {
  const res = await fetch(`${SERVER_ORIGIN}/api/sales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'failed to post sale');
  return body;
}

export async function initiateStkPush({ phone, amount, terminal_id }) {
  const res = await fetch(`${SERVER_ORIGIN}/api/mpesa/stkpush`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, amount, terminal_id }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'STK push failed');
  return body;
}

export async function checkPaymentStatus(checkoutRequestId) {
  const res = await fetch(`${SERVER_ORIGIN}/api/mpesa/status/${checkoutRequestId}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'status check failed');
  return body;
}