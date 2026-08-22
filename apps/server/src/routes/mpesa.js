import { Router } from 'express';

export const mpesaRouter = Router();

// In-memory store of pending/settled STK push requests, keyed by
// CheckoutRequestID. Fine for a single-server shop; would move to Postgres
// if this ever ran across multiple instances.
const pushes = new Map();

// Switches based on DARAJA_ENV so the same code works against sandbox during
// development and the production shortcode once live.
const DARAJA_BASE =
  process.env.DARAJA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

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

// Asks Safaricom directly what the real status of a transaction is. Used by
// the /query route and by the callback handler, so a callback's claims are
// never taken at face value.
async function queryDaraja(checkoutRequestId) {
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

  return queryRes.json();
}

// ============================================================
// Callback handling
//
// Extracted from the route so the relay poller can call it too. Safaricom
// posts to the relay on cPanel, the shop collects from there, and both paths
// end up here.
//
// The body is treated as a NOTIFICATION, never as proof. Anyone who learns
// the URL could POST a fake "payment confirmed" message, so before marking
// anything paid we ask Safaricom directly whether the transaction actually
// succeeded. Only Safaricom's own answer is trusted.
// ============================================================

export async function processMpesaCallback(body, io) {
  const callback = body?.Body?.stkCallback;
  if (!callback) {
    console.warn('Malformed callback payload, ignoring');
    return;
  }

  const { CheckoutRequestID } = callback;
  const entry = pushes.get(CheckoutRequestID);

  if (!entry) {
    console.warn(`Callback for unknown CheckoutRequestID: ${CheckoutRequestID}`);
    return;
  }

  // Don't re-process something already settled.
  if (entry.status === 'confirmed' || entry.status === 'failed') {
    return;
  }

  try {
    const verified = await queryDaraja(CheckoutRequestID);
    const resultCode = String(verified.ResultCode);

    if (resultCode === '0') {
      // Take the receipt number from the callback metadata if present, since
      // the query response doesn't always include it.
      const items = callback.CallbackMetadata?.Item || [];
      const get = (name) => items.find((i) => i.Name === name)?.Value;

      entry.status = 'confirmed';
      entry.mpesaRef = get('MpesaReceiptNumber') || verified.MpesaReceiptNumber || null;
      entry.amountPaid = get('Amount') ?? null;
      entry.verified = true;

      console.log(`Payment confirmed: ${CheckoutRequestID}, ref ${entry.mpesaRef}`);
    } else {
      entry.status = 'failed';
      entry.resultDesc = verified.ResultDesc || callback.ResultDesc;
      entry.verified = true;

      console.log(`Payment failed: ${CheckoutRequestID}, ${entry.resultDesc}`);
    }
  } catch (err) {
    // Verification itself failed -- network, auth, Safaricom down. Leave the
    // transaction pending rather than trusting the unverified callback. The
    // terminal's polling keeps checking and /query can be called manually.
    // Better a stuck pending sale than a falsely confirmed one.
    console.error(`Callback verification failed for ${CheckoutRequestID}:`, err.message);
    entry.verificationError = err.message;
  }

  pushes.set(CheckoutRequestID, entry);
  io?.emit('mpesa:updated', { checkoutRequestId: CheckoutRequestID, ...entry });
}

// ============================================================
// Routes
// ============================================================

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
        AccountReference: 'Zummart',
        TransactionDesc: 'Zummart Supermarket purchase',
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
// The till polls this while showing "waiting for confirmation". Reflects
// whatever the callback, /query or /demo-confirm last set it to.
mpesaRouter.get('/status/:checkoutRequestId', (req, res) => {
  const entry = pushes.get(req.params.checkoutRequestId);
  if (!entry) {
    return res.status(404).json({ error: 'unknown checkoutRequestId' });
  }
  res.json({ checkoutRequestId: req.params.checkoutRequestId, ...entry });
});

// GET /api/mpesa/query/:checkoutRequestId
// Actively asks Safaricom for the current status. Useful when a callback
// never arrives and a sale is stuck pending.
mpesaRouter.get('/query/:checkoutRequestId', async (req, res) => {
  const { checkoutRequestId } = req.params;

  try {
    const data = await queryDaraja(checkoutRequestId);

    const entry = pushes.get(checkoutRequestId);
    if (entry && data.ResultCode !== undefined) {
      entry.status = String(data.ResultCode) === '0' ? 'confirmed' : 'failed';
      entry.resultDesc = data.ResultDesc;
      pushes.set(checkoutRequestId, entry);

      const io = req.app.get('io');
      io?.emit('mpesa:updated', { checkoutRequestId, ...entry });
    }

    res.json({ checkoutRequestId, ...data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/mpesa/callback
// Kept for the case where Safaricom reaches the shop directly. The usual
// path now is the relay on cPanel, which the poller collects from.
mpesaRouter.post('/callback', async (req, res) => {
  // Acknowledge immediately -- Safaricom retries on any non-200, and retries
  // mean duplicate confirmations to untangle.
  res.status(200).json({ received: true });
  await processMpesaCallback(req.body, req.app.get('io'));
});

// POST /api/mpesa/demo-confirm/:checkoutRequestId
// Manually marks a transaction as confirmed. The sandbox test number has no
// real phone to approve the prompt, so it reliably times out -- this exists
// so a demo can move forward rather than depending on that.
//
// Hard-blocked in production: it would otherwise let anyone fake a paid sale
// against a real shortcode with no money moving.
mpesaRouter.post('/demo-confirm/:checkoutRequestId', (req, res) => {
  if (process.env.DARAJA_ENV === 'production') {
    return res.status(403).json({ error: 'demo confirmation is permanently disabled in production' });
  }

  if (process.env.MPESA_ALLOW_DEMO_CONFIRM !== 'true') {
    return res.status(403).json({ error: 'demo confirmation is disabled' });
  }

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
  io?.emit('mpesa:updated', { checkoutRequestId, ...entry });

  res.json({ checkoutRequestId, ...entry });
});