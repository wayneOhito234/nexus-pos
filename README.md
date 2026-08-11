MPESA NUMBER
254708374149
MPESA CONFIRMATION 
curl -X POST http://localhost:4000/api/mpesa/demo-confirm/

curl -X POST http://192.168.100.11:4000/api/manager/shifts/clock-out-all

# Nexus POS — Quick Start & Troubleshooting

Reference commands for running the system end to end: server, two till terminals, and common fixes.

---

## 1. Start everything (one command)

```bash
cd ~/Development/nexus-pos
./start-demo.sh
```

This starts the server under pm2, health-checks it, and tells you whether ngrok is already running.

If ngrok isn't running, in its own tab:

```bash
ngrok http 4000
```

> Confirm the forwarding URL matches `DARAJA_CALLBACK_URL` in `apps/server/.env`. If ngrok gives a new URL, update `.env` then run `pm2 restart nexus-pos-server`.

---

## 2. Open the terminals

**Terminal 1** (open a new tab):

```bash
cd ~/Development/nexus-pos/apps/terminal
npm run dev
```

Wait for Vite's "ready" message and the Electron window to open before continuing.

**Terminal 2** (only after Terminal 1's window is open, in another new tab):

```bash
cd ~/Development/nexus-pos/apps/terminal
npm run dev:terminal2
```

**For a live demo, run Terminal 1 fullscreen (kiosk mode):**

```bash
NEXUS_KIOSK=true npm run dev
```

---

## 3. Health checks

```bash
pm2 status                          # is the server online?
curl http://localhost:4000/health   # should return {"status":"ok"}
```

---

## 4. Common troubleshooting

### "Cannot POST/GET" on a route that should exist

The server hasn't picked up a recent code change — pm2 does not auto-restart on file save.

```bash
pm2 restart nexus-pos-server
```

### Terminal window won't open, or hangs on startup

Port already held by a stale process from an earlier session.

```bash
lsof -ti:5173 | xargs -r kill -9   # Vite / Terminal 1
lsof -ti:4000 | xargs -r kill -9   # server
pkill -9 electron                 # any leftover Electron windows
```

Then restart from Step 2.

### A cashier shows "on duty" but isn't really logged in

Happens if the app was force-closed (`pkill -9`) instead of using Log out — this skips the auto clock-out.

```bash
# Quick fix via curl (get the ID first):
curl http://localhost:4000/api/manager/cashiers

curl -X POST http://localhost:4000/api/manager/shifts/clock-out \
  -H "Content-Type: application/json" \
  -d '{"cashier_id": PASTE_ID_HERE}'
```

Or, faster: log in as an **admin** account → **Admin Dashboard** → **Clock out everyone**.

### Terminal 2 won't start

It depends on Terminal 1's Vite server already running. Wait for Terminal 1's window to fully open first, then run `npm run dev:terminal2`.

### Checking logs directly

```bash
pm2 logs nexus-pos-server              # live tail, Ctrl+C to stop
pm2 logs nexus-pos-server --lines 30 --nostream   # last 30 lines, no live tail
```

### Confirm the database is reachable

```bash
psql -d nexus_pos -c "\dt"             # list tables
curl http://localhost:4000/api/products | head -20
```

### Blank white/black terminal window

Already fixed via `app.disableHardwareAcceleration()` in `electron/main.js` — shouldn't recur. If it does, a full restart (kill Electron, `npm run dev` again) resolves it.

### Import / module errors right after pasting new code

The file was only partially saved, or Vite is using a stale cached build.

```bash
grep -c "functionNameYouAdded" src/path/to/file.js   # confirm the save actually took
rm -rf node_modules/.vite                             # clear Vite's cache if needed
```

---

## 5. Useful one-offs

```bash
# Confirm a specific route exists and responds
curl -X POST http://localhost:4000/api/manager/shifts/clock-out-all

# See recent sales directly in the database
psql -d nexus_pos -c "SELECT id, total, payment_method, created_at FROM sales ORDER BY created_at DESC LIMIT 5;"

# Clear test sales before a real demo (keeps products & cashiers intact)
psql -d nexus_pos -c "TRUNCATE sales, sale_items RESTART IDENTITY CASCADE;"

# Manually confirm a pending M-Pesa sandbox transaction
curl -X POST http://localhost:4000/api/mpesa/demo-confirm/<CHECKOUT_REQUEST_ID>
```

---

## 6. Shutdown checklist

- Log out of each terminal using the **Log out** button (not `pkill -9`) so shifts close cleanly
- `pm2 stop nexus-pos-server` if you want the server fully stopped rather than just idle
