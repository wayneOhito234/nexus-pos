import 'dotenv/config';

const RELAY_URL = process.env.MPESA_RELAY_URL;
const RELAY_SECRET = process.env.MPESA_RELAY_SECRET;
const INTERVAL_MS = 2000;
const REQUEST_TIMEOUT_MS = 5000;

let running = false;
let consecutiveFailures = 0;

// The shop has no public address, so Safaricom can't reach it. The relay on
// cPanel catches callbacks and holds them; this collects them by polling.
//
// Polling rather than being pushed to, because every request here is
// outbound. That needs no port forwarding, no static IP, and no change to
// the shop's router -- from the router's point of view it looks the same as
// someone browsing the web.
export function startMpesaPoller(handleCallback) {
  if (!RELAY_URL || !RELAY_SECRET) {
    console.warn(
      'M-Pesa relay not configured (MPESA_RELAY_URL / MPESA_RELAY_SECRET). ' +
      'Payment confirmations will not arrive.'
    );
    return;
  }

  if (running) return;
  running = true;

  console.log(`Polling ${RELAY_URL} for M-Pesa callbacks`);

  setInterval(async () => {
    try {
      const res = await fetch(`${RELAY_URL}/pending`, {
        headers: { Authorization: `Bearer ${RELAY_SECRET}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (res.status === 401) {
        // Worth calling out separately. A mismatched secret looks like a
        // dead connection otherwise, and someone would spend an hour
        // checking the network before checking the .env files.
        throw new Error('relay rejected the secret -- check MPESA_RELAY_SECRET matches RELAY_SECRET on cPanel');
      }
      if (!res.ok) {
        throw new Error(`relay responded ${res.status}`);
      }

      const { callbacks } = await res.json();

      if (consecutiveFailures > 0) {
        console.log(`Relay reachable again after ${consecutiveFailures} failed attempts`);
        consecutiveFailures = 0;
      }

      for (const item of callbacks) {
        try {
          await handleCallback(item.body);
        } catch (err) {
          // One bad callback shouldn't stop the rest being processed. The
          // relay has already cleared it, so it won't come round again --
          // recovery is /query on that checkout ID.
          console.error(
            `Failed to process callback ${item.checkoutRequestId}:`,
            err.message
          );
        }
      }
    } catch (err) {
      consecutiveFailures++;

      // Only complain occasionally. A dropped connection would otherwise
      // write a line every two seconds and bury everything else in the log.
      if (consecutiveFailures === 1 || consecutiveFailures % 30 === 0) {
        console.warn(
          `Relay unreachable (${consecutiveFailures} attempt${consecutiveFailures === 1 ? '' : 's'}): ${err.message}`
        );
      }
    }
  }, INTERVAL_MS);
}