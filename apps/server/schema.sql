-- Nexus POS  ·  complete schema (safe to run multiple times)
-- Fixes: reorder_level, cashiers, shifts, drawer_events, amount_received/change_given in sales

-- ─── Products ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id            SERIAL PRIMARY KEY,
  sku           TEXT NOT NULL UNIQUE,
  barcode       TEXT UNIQUE,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'General',
  price         NUMERIC(10, 2) NOT NULL,
  stock_qty     INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 5   -- was missing from original schema
);

-- ─── Cashiers ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cashiers (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'cashier',
  first_name    TEXT,
  last_name     TEXT,
  password_hash TEXT
);

-- ─── Shifts ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shifts (
  id          SERIAL PRIMARY KEY,
  cashier_id  INTEGER NOT NULL REFERENCES cashiers(id),
  terminal_id TEXT NOT NULL,
  clock_in    TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out   TIMESTAMPTZ
);

-- ─── Sales ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id              SERIAL PRIMARY KEY,
  terminal_id     TEXT NOT NULL,
  total           NUMERIC(10, 2) NOT NULL,
  payment_method  TEXT NOT NULL CHECK (payment_method IN ('cash', 'mpesa')),
  mpesa_ref       TEXT,
  amount_received NUMERIC(10, 2),   -- was missing from original schema
  change_given    NUMERIC(10, 2),   -- was missing from original schema
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

-- ─── Drawer events ───────────────────────────────────────────────────────────
-- A log of every cash drawer opening (sales and No-Sale opens)
CREATE TABLE IF NOT EXISTS drawer_events (
  id          SERIAL PRIMARY KEY,
  cashier_id  INTEGER REFERENCES cashiers(id),   -- nullable: No-Sale doesn't need a cashier
  terminal_id TEXT NOT NULL,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Add columns to existing tables if upgrading from partial install ─────────
-- These are safe no-ops if columns already exist.
DO $$ BEGIN
  ALTER TABLE products ADD COLUMN reorder_level INTEGER NOT NULL DEFAULT 5;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cashiers ADD COLUMN first_name TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cashiers ADD COLUMN last_name TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE cashiers ADD COLUMN password_hash TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE sales ADD COLUMN amount_received NUMERIC(10, 2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE sales ADD COLUMN change_given NUMERIC(10, 2);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;