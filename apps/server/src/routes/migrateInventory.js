import 'dotenv/config';
import { pool } from './db.js';

const sql = `
-- Stock now lives in two places. stock_qty stays as the sellable shelf
-- quantity so nothing that already reads it needs changing; store_qty is
-- the back room.
ALTER TABLE products ADD COLUMN IF NOT EXISTS store_qty INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One delivery from one supplier. amount_paid is tracked separately from
-- total_cost so partial payments and credit terms are visible.
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
  unit_cost NUMERIC(10,2) NOT NULL,
  line_total NUMERIC(12,2) NOT NULL
);

-- Every stock change, whatever caused it. This is the answer to "why is
-- this number different from yesterday".
CREATE TABLE IF NOT EXISTS stock_movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  movement_type TEXT NOT NULL,
  location TEXT NOT NULL,
  qty_change INTEGER NOT NULL,
  qty_after INTEGER NOT NULL,
  reason TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  cashier_id INTEGER REFERENCES cashiers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON stock_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_goods_received_supplier ON goods_received(supplier_id);
CREATE INDEX IF NOT EXISTS idx_goods_received_date ON goods_received(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_gr_items_gr ON goods_received_items(goods_received_id);
CREATE INDEX IF NOT EXISTS idx_gr_items_product ON goods_received_items(product_id);
`;

async function run() {
  try {
    await pool.query(sql);
    console.log('Inventory tables ready.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();