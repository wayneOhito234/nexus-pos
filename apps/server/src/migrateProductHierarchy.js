import 'dotenv/config';
import { pool } from './db.js';

// Adds the structured supermarket hierarchy to products. Every column is
// nullable so existing products keep working untouched; the till still groups
// by `category`, which imported products set to their Section. Safe to run
// multiple times.
const sql = `
ALTER TABLE products ADD COLUMN IF NOT EXISTS department    TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS section       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand         TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS pack_size     NUMERIC(10, 2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit          TEXT;

-- Helpful for the manager's hierarchy filters.
CREATE INDEX IF NOT EXISTS idx_products_department ON products(department);
CREATE INDEX IF NOT EXISTS idx_products_section    ON products(section);
CREATE INDEX IF NOT EXISTS idx_products_brand      ON products(brand);

-- Backfill: existing rows already have a category; mirror it into section so
-- they don't look "uncategorised" in the new hierarchy views. Department is
-- left null for legacy rows and can be tidied later.
UPDATE products SET section = category WHERE section IS NULL AND category IS NOT NULL;
`;

async function run() {
  try {
    await pool.query(sql);
    console.log('Product hierarchy columns ready.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();