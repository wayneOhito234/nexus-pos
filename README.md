psql -U postgres -d nexus_pos -c "ALTER TABLE sales ADD COLUMN IF NOT EXISTS cashier_id INTEGER REFERENCES cashiers(id);"
psql -U postgres -d nexus_pos -c "CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);"
psql -U postgres -d nexus_pos -c "CREATE TABLE IF NOT EXISTS drawer_pins (id SERIAL PRIMARY KEY, terminal_id TEXT NOT NULL, pin_hash TEXT NOT NULL, valid_for DATE NOT NULL, set_by INTEGER REFERENCES cashiers(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), cleared_at TIMESTAMPTZ, UNIQUE (terminal_id, valid_for));"
psql -U postgres -d nexus_pos -c "CREATE TABLE IF NOT EXISTS drawer_pins (id SERIAL PRIMARY KEY, terminal_id TEXT NOT NULL, pin_hash TEXT NOT NULL, valid_for DATE NOT NULL, set_by INTEGER REFERENCES cashiers(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), cleared_at TIMESTAMPTZ, UNIQUE (terminal_id, valid_for));"


curl.exe http://localhost:4000/api/analytics/breakdown?period=day
2
cd C:\nexus-pos\apps\terminal\src\components
Remove-Item ManagerPanel.jsx, AdminPanel.jsx, AnalyticsPanel.jsx


Run this commands 
curl.exe -X POST http://192.168.100.11:4000/api/inventory/suppliers -H "Content-Type: application/json" -d "{\"name\":\"Brookside Dairy\",\"phone\":\"0722000000\"}"

psql -U postgres -d nexus_pos -f - <<'SQL'
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_qty INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goods_received (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  reference TEXT,
  total_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  received_by INTEGER REFERENCES cashiers(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goods_received_items (
  id SERIAL PRIMARY KEY,
  goods_received_id INTEGER NOT NULL REFERENCES goods_received(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty INTEGER NOT NULL,
  unit_cost NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  movement_type TEXT NOT NULL,
  qty_change INTEGER NOT NULL,
  location TEXT NOT NULL,
  reason TEXT,
  reference_id INTEGER,
  staff_id INTEGER REFERENCES cashiers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_received_supplier ON goods_received(supplier_id);
SQL

curl.exe http://192.168.100.11:4000/api/inventory/suppliers
Test-Path .\apps\server\src\managerIpGuard.js

psql -U postgres -d nexus_pos -c "ALTER TABLE products ADD COLUMN IF NOT EXISTS store_qty INTEGER NOT NULL DEFAULT 0;"


MPESA NUMBER
254708374149
MPESA CONFIRMATION 
curl -X POST http://localhost:4000/api/mpesa/demo-confirm/

curl.exe -X POST http://192.168.100.11:4000/api/manager/shifts/clock-out-all

## Server Side Dependencies And Configuration  cd nexus-pos/apps/server
 Run the following commands in cd nexus-pos/apps/server
```bash
npm install 
```
```bash
npm install -g pm2 pm2-windows-startup
```
```bash
pm2-startup install
```

```bash
node src/seed.js
```

```bash
pm2 start ecosystem.config.cjs
```

```bash
pm2 save
```

it should show "Nexus POS server listening on port 4000"



### Adding the Firewall Port
Open In PowerShell As An Adminisrator
```bash
netsh advfirewall firewall add rule name="Nexus POS" dir=in action=allow protocol=tcp localport=4000
```

### Create The Admin Cashier
```bash
curl -X POST http://localhost:4000/api/manager/cashiers/register -H "Content-Type: application/json" -d "{\"first_name\":\"Admin\",\"last_name\":\"NoorCom\",\"password\":\"admin1234\",\"role\":\"admin\"}"
```
Do this when the src/seed.js is listening on another port- Open a a new cmd

```bash
pm2 start src/index.js --name nexus-server
```
```bash
pm2 save
```

when making changes on the database make sure you run
```bash
pm2 restart nexus-server
```
### production code
```bash
npm run build
$env:NODE_ENV="production"
npm start
```
### create a new user
```bash 
curl.exe -X POST http://localhost:4000/api/manager/cashiers/register -H "Content-Type: application/json" -d "{\"first_name\":\"Admin\",\"Noorcom\":\"Ohito\",\"password\":\"admin1234\",\"role\":\"manager\"}"
```



### Testing The Connection
http://192.168.1.100:4000/api/products
Based on the IP



## Setting Up The Tills
1. I


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
