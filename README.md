psql -U postgres -d nexus_pos

```bash
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tc.table_name, tc.constraint_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'cashiers'
      AND ccu.column_name = 'id'
      AND tc.table_name NOT IN ('sessions', 'shifts')
  LOOP
    EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', r.table_name, r.constraint_name);
    EXECUTE format(
      'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES cashiers(id) ON DELETE SET NULL',
      r.table_name, r.constraint_name, r.column_name
    );
  END LOOP;
END $$;
```
### Latest Changes
```bash
psql -U postgres -d nexus_pos -c "ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_level INTEGER NOT NULL DEFAULT 10, ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true, ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2), ADD COLUMN IF NOT EXISTS store_qty INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();"

psql -U postgres -d nexus_pos -c "ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_received NUMERIC, ADD COLUMN IF NOT EXISTS change_given NUMERIC, ADD COLUMN IF NOT EXISTS cashier_id INTEGER REFERENCES cashiers(id);"

psql -U postgres -d nexus_pos -c "CREATE TABLE IF NOT EXISTS drawer_events (id SERIAL PRIMARY KEY, cashier_id INTEGER REFERENCES cashiers(id), terminal_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());"

psql -U postgres -d nexus_pos -c "CREATE TABLE IF NOT EXISTS drawer_pins (id SERIAL PRIMARY KEY, terminal_id TEXT NOT NULL, pin_hash TEXT NOT NULL, valid_for DATE NOT NULL, set_by INTEGER REFERENCES cashiers(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), cleared_at TIMESTAMPTZ, UNIQUE (terminal_id, valid_for));"

psql -U postgres -d nexus_pos -c "CREATE TABLE IF NOT EXISTS suppliers (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, contact_person TEXT, phone TEXT, email TEXT, notes TEXT, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());"

psql -U postgres -d nexus_pos -c "CREATE TABLE IF NOT EXISTS goods_received (id SERIAL PRIMARY KEY, supplier_id INTEGER NOT NULL REFERENCES suppliers(id), reference TEXT, total_cost NUMERIC(12,2) NOT NULL DEFAULT 0, amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0, notes TEXT, received_by INTEGER REFERENCES cashiers(id), received_at TIMESTAMPTZ NOT NULL DEFAULT now());"

psql -U postgres -d nexus_pos -c "CREATE TABLE IF NOT EXISTS goods_received_items (id SERIAL PRIMARY KEY, goods_received_id INTEGER NOT NULL REFERENCES goods_received(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id), qty INTEGER NOT NULL, unit_cost NUMERIC(10,2) NOT NULL);"

psql -U postgres -d nexus_pos -c "CREATE TABLE IF NOT EXISTS stock_movements (id SERIAL PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), movement_type TEXT NOT NULL, qty_change INTEGER NOT NULL, location TEXT NOT NULL, reason TEXT, reference_id INTEGER, staff_id INTEGER REFERENCES cashiers(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now());"

psql -U postgres -d nexus_pos -c "CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id); CREATE INDEX IF NOT EXISTS idx_movements_created ON stock_movements(created_at DESC); CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);"
```
```bash
psql -U postgres -d nexus_pos -c "CREATE TABLE IF NOT EXISTS sessions (id SERIAL PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, cashier_id INTEGER NOT NULL REFERENCES cashiers(id), terminal_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, revoked_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now());"
```
psql -U postgres -d nexus_pos -c "CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash); CREATE INDEX IF NOT EXISTS idx_sessions_cashier ON sessions(cashier_id);"
```bash
psql -U postgres -d nexus_pos -c "ALTER TABLE sales ADD COLUMN IF NOT EXISTS cashier_id INTEGER REFERENCES cashiers(id);"

psql -U postgres -d nexus_pos -c "CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id);"

psql -U postgres -d nexus_pos -c "CREATE TABLE IF NOT EXISTS drawer_pins (id SERIAL PRIMARY KEY, terminal_id TEXT NOT NULL, pin_hash TEXT NOT NULL, valid_for DATE NOT NULL, set_by INTEGER REFERENCES cashiers(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), cleared_at TIMESTAMPTZ, UNIQUE (terminal_id, valid_for));"

psql -U postgres -d nexus_pos -c "CREATE TABLE IF NOT EXISTS drawer_pins (id SERIAL PRIMARY KEY, terminal_id TEXT NOT NULL, pin_hash TEXT NOT NULL, valid_for DATE NOT NULL, set_by INTEGER REFERENCES cashiers(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now(), cleared_at TIMESTAMPTZ, UNIQUE (terminal_id, valid_for));"
```
```bash
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
```

```bash
MPESA NUMBER
254708374149
MPESA CONFIRMATION 
curl -X POST http://localhost:4000/api/mpesa/demo-confirm/
curl.exe -X POST http://192.168.100.11:4000/api/manager/shifts/clock-out-all
```

```bash
$file = "C:\nexus-pos\apps\server\src\ipAllowlist.js"
$lines = Get-Content $file
$fixed = $lines | Where-Object { $_ -ne "export const tillIpGuard = ipAllowlist;" }
$fixed + "export const tillIpGuard = ipAllowlist;" | Set-Content $file
```

### Confirmation Code Of till IPs and Manager Ips
```bash
Set-Content "C:\nexus-pos\apps\server\site.config.js" $config
```

## Server Side Dependencies And Configuration  cd nexus-pos/apps/server
### Adding the Firewall Port

1. Open In PowerShell As An Adminisrator
```bash
netsh advfirewall firewall add rule name="Nexus POS" dir=in action=allow protocol=tcp localport=4000
```

2. Run the following commands in cd nexus-pos/apps/server
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

```bash
cd C:\nexus-pos\apps\server
node src/index.js
```
it should show "Nexus POS server listening on port 4000"

### AfterDoing Any Changes On The Server Side Code
```bash 
npx pm2 restart nexus-pos-server
npx pm2 status
```

### Do this when the src/seed.js is listening on another port- Open a a new cmd

```bash
pm2 start src/index.js --name nexus-pos-server
```

```bash
pm2 save
```

### Delete a duplicate PM2 session
```bash 
pm2 delete nexus-server
pm2 save
```

### 3. Database Updates and when making changes on the database make sure you run
```bash
pm2 restart nexus-pos-server
```
### 3.1 TERMINAL SIDE COMMANDS
```bash
cd nexus-pos
npm install
```
```bash
cd nexus-pos/apps/terminal/
npm install
npm run build
$env:NODE_ENV="production"
npm start
```

### 3.2 MANAGER SIDE COMMANDS
```bash
cd nexus-pos
npm install
```
```bash
cd nexus-pos/apps/manager/
npm install
npm run build
$env:NODE_ENV="production"
npm start
```

### Confirmation Code Of till IPs and Manager Ips
```bash
Set-Content "C:\nexus-pos\apps\server\site.config.js" $config
```











