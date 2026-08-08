import { Router } from 'express';

export const mpesaRouter = Router();

// In-memory store of pending/settled STK push requests, keyed by CheckoutRequestID.
// Fine for a single-server demo; would move to Postgres for production.
const pushes = new Map();

const DARAJA_BASE = 'https://sandbox.safaricom.co.ke';

function simulatedMpesaRef() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let ref = '';
  for (let i = 0; i < 10; i++) ref += chars[Math.floor(Math.random() * chars.length)];
  return ref;
}

async function getAccessToken() {
  const key = process.env.DARAJA_CONSUMER_KEY;
  const secret = process.env.DARAJA_CONSUMER_SECRET;
  const credentials = Buffer.from(`${key}:${secret}`).toString('base64');

  const res = await fetch(`${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!res.ok) {
    throw new Error(`Daraja auth failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

function daraTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

// POST /api/mpesa/stkpush
// body: { phone, amount, terminal_id }
// phone must be in 2547XXXXXXXX format
mpesaRouter.post('/stkpush', async (req, res) => {
  const { phone, amount, terminal_id } = req.body;

  if (!phone || !amount || !terminal_id) {
    return res.status(400).json({ error: 'phone, amount and terminal_id are required' });
  }

  try {
    const accessToken = await getAccessToken();
    const shortcode = process.env.DARAJA_SHORTCODE;
    const passkey = process.env.DARAJA_PASSKEY;
    const timestamp = daraTimestamp();
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    const stkRes = await fetch(`${DARAJA_BASE}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(amount),
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: process.env.DARAJA_CALLBACK_URL,
        AccountReference: 'Nexus POS',
        TransactionDesc: 'Exit Mart purchase',
      }),
    });

    const stkData = await stkRes.json();

    if (!stkRes.ok || stkData.ResponseCode !== '0') {
      return res.status(502).json({ error: 'STK push failed', detail: stkData });
    }

    pushes.set(stkData.CheckoutRequestID, {
      status: 'pending',
      terminal_id,
      amount,
      phone,
      createdAt: Date.now(),
    });

    res.status(202).json({
      checkoutRequestId: stkData.CheckoutRequestID,
      merchantRequestId: stkData.MerchantRequestID,
      status: 'pending',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mpesa/status/:checkoutRequestId
// Terminal polls this while showing "waiting for confirmation". Reflects
// whatever the callback, /query, or /demo-confirm last set it to.
mpesaRouter.get('/status/:checkoutRequestId', (req, res) => {
  const entry = pushes.get(req.params.checkoutRequestId);
  if (!entry) {
    return res.status(404).json({ error: 'unknown checkoutRequestId' });
  }
  res.json({ checkoutRequestId: req.params.checkoutRequestId, ...entry });
});

// GET /api/mpesa/query/:checkoutRequestId
// Actively asks Safaricom for the current status. Useful for confirming
// the real Daraja integration is wired correctly, separate from the demo
// tools below.
mpesaRouter.get('/query/:checkoutRequestId', async (req, res) => {
  const { checkoutRequestId } = req.params;

  try {
    const accessToken = await getAccessToken();
    const shortcode = process.env.DARAJA_SHORTCODE;
    const passkey = process.env.DARAJA_PASSKEY;
    const timestamp = daraTimestamp();
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    const queryRes = await fetch(`${DARAJA_BASE}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    });

    const data = await queryRes.json();

    const entry = pushes.get(checkoutRequestId);
    if (entry && data.ResultCode !== undefined) {
      entry.status = data.ResultCode === '0' || data.ResultCode === 0 ? 'confirmed' : 'failed';
      entry.resultDesc = data.ResultDesc;
      pushes.set(checkoutRequestId, entry);
    }

    res.json({ checkoutRequestId, ...data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mpesa/callback
// Safaricom calls this once a real payment resolves. Kept in place for
// when this moves past the sandbox to a live shortcode.
mpesaRouter.post('/callback', (req, res) => {
  const callback = req.body?.Body?.stkCallback;

  if (!callback) {
    return res.status(400).json({ error: 'malformed callback payload' });
  }

  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;
  const entry = pushes.get(CheckoutRequestID);

  if (!entry) {
    console.warn(`callback for unknown CheckoutRequestID: ${CheckoutRequestID}`);
    return res.status(200).json({ received: true });
  }

  if (ResultCode === 0) {
    const items = CallbackMetadata?.Item || [];
    const get = (name) => items.find((i) => i.Name === name)?.Value;

    entry.status = 'confirmed';
    entry.mpesaRef = get('MpesaReceiptNumber');
    entry.amountPaid = get('Amount');
  } else {
    entry.status = 'failed';
    entry.resultDesc = ResultDesc;
  }

  pushes.set(CheckoutRequestID, entry);

  const io = req.app.get('io');
  io.emit('mpesa:updated', { checkoutRequestId: CheckoutRequestID, ...entry });

  res.status(200).json({ received: true });
});

// POST /api/mpesa/demo-confirm/:checkoutRequestId
// Manually marks a transaction as confirmed, overriding whatever Safaricom's
// sandbox reported. The sandbox test number has no real phone to approve
// the prompt, so it reliably times out or fails on its own -- this route
// exists purely so a live demo can move forward on command rather than
// depending on that unreliable sandbox outcome.
mpesaRouter.post('/demo-confirm/:checkoutRequestId', (req, res) => {
  const { checkoutRequestId } = req.params;
  const entry = pushes.get(checkoutRequestId);

  if (!entry) {
    return res.status(404).json({ error: 'unknown checkoutRequestId' });
  }

  entry.status = 'confirmed';
  entry.mpesaRef = simulatedMpesaRef();
  entry.simulated = true;
  pushes.set(checkoutRequestId, entry);

  const io = req.app.get('io');
  io.emit('mpesa:updated', { checkoutRequestId, ...entry });

  res.json({ checkoutRequestId, ...entry });
});