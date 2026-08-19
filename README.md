### 1. Run the query
```bash
-- ═══════════════════════════════════════════════════════════════════════════
-- Nexus POS · COMPLETE database schema  (safe to run multiple times)
--
-- This is the authoritative schema. It consolidates every table, column,
-- index and constraint the application uses — including everything that had
-- previously only been applied through ad-hoc psql commands and the various
-- migrate*.js scripts.
--
-- Running it on a FRESH database creates everything.
-- Running it on an EXISTING database is a safe no-op that also fills in any
-- columns/tables that were missing (see the "UPGRADES" section near the end).
--
-- Order matters: tables that are referenced by foreign keys come first.
-- ═══════════════════════════════════════════════════════════════════════════

-- Needed for crypt()/gen_salt() used when creating the first admin.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ─── Cashiers (staff) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cashiers (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'cashier',   -- 'cashier' | 'manager' | 'admin'
  first_name    TEXT,
  last_name     TEXT,
  password_hash TEXT,
  active        BOOLEAN NOT NULL DEFAULT true
);


-- ─── Terminals (tills) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS terminals (
  id              SERIAL PRIMARY KEY,
  terminal_id     TEXT NOT NULL UNIQUE,
  label           TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  default_float   NUMERIC(12, 2) NOT NULL DEFAULT 0,
  disabled_reason TEXT,
  disabled_by     INTEGER REFERENCES cashiers(id),
  disabled_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─── Products ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  sku           TEXT NOT NULL UNIQUE,
  barcode       TEXT UNIQUE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'General',
  price         NUMERIC(10, 2) NOT NULL,
  stock_qty     INTEGER NOT NULL DEFAULT 0,      -- sellable shelf quantity
  store_qty     INTEGER NOT NULL DEFAULT 0,      -- back-room quantity
  reorder_level INTEGER NOT NULL DEFAULT 10,
  cost_price    NUMERIC(10, 2),
  active        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Structured supermarket hierarchy (category stays populated = section):
  department    TEXT,
  section       TEXT,
  brand         TEXT,
  product_type  TEXT,
  variant       TEXT,
  pack_size     NUMERIC(10, 2),
  unit          TEXT
);


-- ─── Suppliers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  address        TEXT,
  notes          TEXT,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─── Shifts ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id            SERIAL PRIMARY KEY,
  cashier_id    INTEGER NOT NULL REFERENCES cashiers(id),
  terminal_id   TEXT NOT NULL,
  clock_in      TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out     TIMESTAMPTZ,
  opening_float NUMERIC(12, 2) NOT NULL DEFAULT 0,
  counted_cash  NUMERIC(12, 2),
  expected_cash NUMERIC(12, 2),
  counted_at    TIMESTAMPTZ,
  count_notes   TEXT
);


-- ─── Sales ───────────────────────────────────────────────────────────────────
-- A split sale (cash + M-Pesa) is stored with payment_method = 'split'; the
-- cash and M-Pesa portions live in cash_amount / mpesa_amount. Totals should be
-- summed from those two columns, never by filtering on payment_method.
CREATE TABLE IF NOT EXISTS sales (
  id              SERIAL PRIMARY KEY,
  terminal_id     TEXT NOT NULL,
  total           NUMERIC(10, 2) NOT NULL,
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('cash', 'mpesa', 'split')),
  mpesa_ref       TEXT,
  amount_received NUMERIC(10, 2),
  change_given    NUMERIC(10, 2),
  cash_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0,
  mpesa_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cashier_id      INTEGER REFERENCES cashiers(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─── Sale items ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sale_items (
  id         SERIAL PRIMARY KEY,
  sale_id    INTEGER NOT NULL REFERENCES sales(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  qty        INTEGER NOT NULL,
  price      NUMERIC(10, 2) NOT NULL
);


-- ─── Sessions (auth tokens) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id           SERIAL PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  cashier_id   INTEGER NOT NULL REFERENCES cashiers(id),
  terminal_id  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─── Drawer events (every cash-drawer opening) ───────────────────────────────
CREATE TABLE IF NOT EXISTS drawer_events (
  id          SERIAL PRIMARY KEY,
  cashier_id  INTEGER REFERENCES cashiers(id),   -- nullable: a No-Sale open has no cashier
  terminal_id TEXT NOT NULL,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─── Drawer PINs (daily manager PIN to authorise drawer opens) ───────────────
CREATE TABLE IF NOT EXISTS drawer_pins (
  id          SERIAL PRIMARY KEY,
  terminal_id TEXT NOT NULL,
  pin_hash    TEXT NOT NULL,
  valid_for   DATE NOT NULL,
  set_by      INTEGER REFERENCES cashiers(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_at  TIMESTAMPTZ,
  UNIQUE (terminal_id, valid_for)
);


-- ─── Till days (one record per terminal per business date) ───────────────────
CREATE TABLE IF NOT EXISTS till_days (
  id             SERIAL PRIMARY KEY,
  terminal_id    TEXT NOT NULL,
  business_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  opening_float  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  opened_by      INTEGER REFERENCES cashiers(id) ON DELETE SET NULL,
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  closing_count  NUMERIC(12, 2),
  CONSTRAINT till_days_terminal_date_unique UNIQUE (terminal_id, business_date)
);


-- ─── Goods received (deliveries) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goods_received (
  id          SERIAL PRIMARY KEY,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  reference   TEXT,
  total_cost  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes       TEXT,
  received_by INTEGER REFERENCES cashiers(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goods_received_items (
  id                SERIAL PRIMARY KEY,
  goods_received_id INTEGER NOT NULL REFERENCES goods_received(id) ON DELETE CASCADE,
  product_id        INTEGER NOT NULL REFERENCES products(id),
  qty               INTEGER NOT NULL,
  unit_cost         NUMERIC(10, 2) NOT NULL,
  line_total        NUMERIC(12, 2) NOT NULL
);


-- ─── Stock movements (audit of every stock change) ───────────────────────────
CREATE TABLE IF NOT EXISTS stock_movements (
  id             SERIAL PRIMARY KEY,
  product_id     INTEGER NOT NULL REFERENCES products(id),
  movement_type  TEXT NOT NULL,
  location       TEXT NOT NULL,
  qty_change     INTEGER NOT NULL,
  qty_after      INTEGER NOT NULL,
  reason         TEXT,
  reference_type TEXT,
  reference_id   INTEGER,
  cashier_id     INTEGER REFERENCES cashiers(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ═══════════════════════════════════════════════════════════════════════════
-- UPGRADES · make an EXISTING database match the shape above.
-- CREATE TABLE IF NOT EXISTS above does nothing to a table that already exists,
-- so these ADD COLUMN IF NOT EXISTS statements fill in any columns added over
-- the life of the project. All are safe no-ops when the column already exists.
-- ═══════════════════════════════════════════════════════════════════════════

-- cashiers
ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS first_name    TEXT;
ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS last_name     TEXT;
ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS active        BOOLEAN NOT NULL DEFAULT true;

-- terminals
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS label           TEXT;
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS active          BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS default_float   NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS disabled_reason TEXT;
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS disabled_by     INTEGER REFERENCES cashiers(id);
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS disabled_at     TIMESTAMPTZ;
ALTER TABLE terminals ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ NOT NULL DEFAULT now();

-- products
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_qty     INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_level INTEGER NOT NULL DEFAULT 10;
ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price    NUMERIC(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS active        BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE products ADD COLUMN IF NOT EXISTS department    TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS section       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand         TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size     NUMERIC(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit          TEXT;
-- Legacy rows: mirror category into section so they aren't "uncategorised".
UPDATE products SET section = category WHERE section IS NULL AND category IS NOT NULL;

-- shifts
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS opening_float NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS counted_cash  NUMERIC(12, 2);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(12, 2);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS counted_at    TIMESTAMPTZ;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS count_notes   TEXT;

-- sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_received NUMERIC(10, 2);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS change_given    NUMERIC(10, 2);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cash_amount     NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS mpesa_amount    NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS cashier_id      INTEGER REFERENCES cashiers(id);

-- On older databases the sales CHECK only allowed ('cash','mpesa'), which
-- rejects split sales. Replace it with one that also allows 'split'.
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_payment_method_check;
ALTER TABLE sales ADD  CONSTRAINT sales_payment_method_check
  CHECK (payment_method IN ('cash', 'mpesa', 'split'));

-- suppliers / goods received / stock movements (in case an older version made
-- these tables with fewer columns)
ALTER TABLE suppliers            ADD COLUMN IF NOT EXISTS address        TEXT;
ALTER TABLE goods_received_items ADD COLUMN IF NOT EXISTS line_total     NUMERIC(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE stock_movements      ADD COLUMN IF NOT EXISTS qty_after      INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stock_movements      ADD COLUMN IF NOT EXISTS reference_type TEXT;


-- ═══════════════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_products_department      ON products(department);
CREATE INDEX IF NOT EXISTS idx_products_section         ON products(section);
CREATE INDEX IF NOT EXISTS idx_products_brand           ON products(brand);

CREATE INDEX IF NOT EXISTS idx_sales_cashier            ON sales(cashier_id);

CREATE INDEX IF NOT EXISTS idx_sessions_token           ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_cashier         ON sessions(cashier_id);

CREATE INDEX IF NOT EXISTS idx_shifts_counted           ON shifts(counted_at DESC);

CREATE INDEX IF NOT EXISTS idx_till_days_terminal_date  ON till_days(terminal_id, business_date);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product  ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created  ON stock_movements(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_goods_received_supplier  ON goods_received(supplier_id);
CREATE INDEX IF NOT EXISTS idx_goods_received_date      ON goods_received(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_gr_items_gr              ON goods_received_items(goods_received_id);
CREATE INDEX IF NOT EXISTS idx_gr_items_product         ON goods_received_items(product_id);
```
### 2.0 Do the Migration
```bash
cd apps/server && node src/migrateProductHierarchy.js
```

```bash
Get-Content C:\nexus-pos\packages\shared\src\index.js
```

```bash
psql -U postgres -d nexus_pos -c "ALTER TABLE sales ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS mpesa_amount NUMERIC(12,2) NOT NULL DEFAULT 0;"

psql -U postgres -d nexus_pos -c "UPDATE sales SET cash_amount = total WHERE payment_method = 'cash' AND cash_amount = 0; UPDATE sales SET mpesa_amount = total WHERE payment_method <> 'cash' AND mpesa_amount = 0;"
````

```bash
Select-String -Path C:\nexus-pos\apps\terminal\src\styles.css -Pattern "app > \*|#root > \*"
```
```bash
Get-Printer | Select-Object Name, DriverName, PortName
```



```bash
psql -U postgres -d nexus_pos -c "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS opening_float NUMERIC(12,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS counted_cash NUMERIC(12,2), ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(12,2), ADD COLUMN IF NOT EXISTS counted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS count_notes TEXT;"
```

psql -U postgres -d nexus_pos -c "ALTER TABLE terminals ADD COLUMN IF NOT EXISTS default_float NUMERIC(12,2) NOT NULL DEFAULT 0;"

psql -U postgres -d nexus_pos -c "CREATE INDEX IF NOT EXISTS idx_shifts_counted ON shifts(counted_at DESC);"


```bash
psql -U postgres -d nexus_pos -c "ALTER TABLE shifts ADD COLUMN IF NOT EXISTS opening_float NUMERIC(12,2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS counted_cash NUMERIC(12,2), ADD COLUMN IF NOT EXISTS expected_cash NUMERIC(12,2), ADD COLUMN IF NOT EXISTS counted_at TIMESTAMPTZ, ADD COLUMN IF NOT EXISTS count_notes TEXT;"

psql -U postgres -d nexus_pos -c "ALTER TABLE terminals ADD COLUMN IF NOT EXISTS default_float NUMERIC(12,2) NOT NULL DEFAULT 0;"

psql -U postgres -d nexus_pos -c "CREATE INDEX IF NOT EXISTS idx_shifts_counted ON shifts(counted_at DESC);"
```

### 1.0 Creating a new admin
#### 1.1  On The Manager PC or Server Machine
```bash
Invoke-RestMethod -Uri "http://localhost:4000/api/manager/cashiers/register" -Method Post -ContentType "application/json" -Body (@{
  first_name = "Wayne"
  last_name  = "Ohito"
  password   = "<a real password>"
  role       = "manager"
} | ConvertTo-Json)
```
#### 1.2 Very First Time Admin Account Creation
```bash
psql -U postgres -d nexus_pos
```
In psql
```bash
INSERT INTO cashiers (name, first_name, last_name, password_hash, role, active)
VALUES ('Wayne Ohito', 'Wayne', 'Ohito',
        crypt('yourpassword', gen_salt('bf', 10)), 'admin', true);
```
That needs the pgcrypto extension:
```bash
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```
A caveat: pgcrypto's bcrypt and bcryptjs produce compatible hashes, so this works — but if it doesn't, hash it in Node instead:
```bash
cd C:\nexus-pos\apps\server
node -e "import('bcryptjs').then(b => console.log(b.default.hashSync('yourpassword', 10)))"
```
PROMOTE TO ADMIN

```bash
psql -U postgres -d nexus_pos -c "UPDATE cashiers SET role = 'admin' WHERE first_name = 'Wayne' AND last_name = 'Ohito';"
```
CONFIRM
```bash
psql -U postgres -d nexus_pos -c "SELECT id, name, role, active FROM cashiers;"
```



psql -U postgres -d nexus_pos

```bash
psql -U postgres -d nexus_pos -c "ALTER TABLE cashiers ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;"

psql -U postgres -d nexus_pos -c "CREATE TABLE IF NOT EXISTS terminals (id SERIAL PRIMARY KEY, terminal_id TEXT NOT NULL UNIQUE, label TEXT, active BOOLEAN NOT NULL DEFAULT true, disabled_reason TEXT, disabled_by INTEGER REFERENCES cashiers(id), disabled_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now());"
```

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











