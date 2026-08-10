/**
 * windows-setup.js  ·  NoorCom Nexus POS
 * ─────────────────────────────────────────────────────────────────────────────
 * Run this ONCE from the server PC to set everything up:
 *
 *   cd C:\NexusPOS\nexus-pos\apps\server
 *   node ..\..\windows-setup.js
 *
 * What it does:
 *   1. Checks your .env is correct for Windows
 *   2. Tests the PostgreSQL connection
 *   3. Creates / updates all tables (safe to run again)
 *   4. Seeds 20 supermarket products
 *   5. Registers Admin, Cashier One, Cashier Two
 *   6. Prints the LAN IP the tills should connect to
 * ─────────────────────────────────────────────────────────────────────────────
 */

import 'dotenv/config';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

// ── Helpers ──────────────────────────────────────────────────────────────────

function heading(text) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${text}`);
  console.log('─'.repeat(60));
}

function ok(msg)   { console.log(`  ✅  ${msg}`); }
function warn(msg) { console.log(`  ⚠️   ${msg}`); }
function fail(msg) { console.log(`  ❌  ${msg}`); }
function info(msg) { console.log(`  ℹ️   ${msg}`); }

function getLanIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push({ name, address: iface.address });
      }
    }
  }
  return ips;
}

// ── Step 1 — .env validation ─────────────────────────────────────────────────

function checkEnv() {
  heading('Step 1 · Checking .env file');

  const needed = ['PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PORT'];
  let allPresent = true;

  for (const key of needed) {
    if (!process.env[key]) {
      fail(`Missing ${key} in .env`);
      allPresent = false;
    }
  }

  if (!allPresent) {
    console.log(`
  ACTION REQUIRED:
  Create the file  apps/server/.env  with this content:

    PGHOST=localhost
    PGPORT=5432
    PGDATABASE=nexus_pos
    PGUSER=postgres
    PGPASSWORD=your_postgres_password
    PORT=4000

  Then run this script again.
`);
    process.exit(1);
  }

  const pghost = process.env.PGHOST;
  if (pghost.startsWith('/')) {
    fail(`PGHOST is set to "${pghost}" — that is a Linux Unix socket path.`);
    console.log(`
  On Windows, PostgreSQL uses TCP.
  Change your .env to:   PGHOST=localhost
  Then run this script again.
`);
    process.exit(1);
  }

  ok(`PGHOST = ${pghost}`);
  ok(`PGDATABASE = ${process.env.PGDATABASE}`);
  ok(`PGUSER = ${process.env.PGUSER}`);
  ok(`PORT = ${process.env.PORT}`);
  if (!process.env.PGPASSWORD) {
    warn('PGPASSWORD is empty — will rely on trust auth (may fail)');
  }
}

// ── Step 2 — PostgreSQL connection ────────────────────────────────────────────

async function connectDb() {
  heading('Step 2 · Connecting to PostgreSQL');

  const pool = new Pool({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT) || 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD || undefined,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await pool.connect();
    const { rows } = await client.query('SELECT version()');
    ok('Connected to PostgreSQL');
    info(rows[0].version.split(' ').slice(0, 2).join(' '));
    client.release();
  } catch (err) {
    fail(`Cannot connect to PostgreSQL: ${err.message}`);
    console.log(`
  Common fixes:
  • Make sure PostgreSQL is installed and running
    → Open Services (Win+R → services.msc) → find "postgresql-x64-xx" → Start
  • Check PGUSER and PGPASSWORD match what you set during PostgreSQL install
  • PGUSER is usually "postgres" (the default superuser)
  • If you forgot the password, you can reset it in pgAdmin
`);
    await pool.end();
    process.exit(1);
  }

  return pool;
}

// ── Step 3 — Schema ───────────────────────────────────────────────────────────

async function applySchema(pool) {
  heading('Step 3 · Applying database schema');

  const schema = `
    CREATE TABLE IF NOT EXISTS products (
      id            SERIAL PRIMARY KEY,
      sku           TEXT NOT NULL UNIQUE,
      barcode       TEXT UNIQUE,
      name          TEXT NOT NULL,
      category      TEXT NOT NULL DEFAULT 'General',
      price         NUMERIC(10, 2) NOT NULL,
      stock_qty     INTEGER NOT NULL DEFAULT 0,
      reorder_level INTEGER NOT NULL DEFAULT 5
    );

    CREATE TABLE IF NOT EXISTS cashiers (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'cashier',
      first_name    TEXT,
      last_name     TEXT,
      password_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id          SERIAL PRIMARY KEY,
      cashier_id  INTEGER NOT NULL REFERENCES cashiers(id),
      terminal_id TEXT NOT NULL,
      clock_in    TIMESTAMPTZ NOT NULL DEFAULT now(),
      clock_out   TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS sales (
      id              SERIAL PRIMARY KEY,
      terminal_id     TEXT NOT NULL,
      total           NUMERIC(10, 2) NOT NULL,
      payment_method  TEXT NOT NULL CHECK (payment_method IN ('cash', 'mpesa')),
      mpesa_ref       TEXT,
      amount_received NUMERIC(10, 2),
      change_given    NUMERIC(10, 2),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id         SERIAL PRIMARY KEY,
      sale_id    INTEGER NOT NULL REFERENCES sales(id),
      product_id INTEGER NOT NULL REFERENCES products(id),
      qty        INTEGER NOT NULL,
      price      NUMERIC(10, 2) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drawer_events (
      id          SERIAL PRIMARY KEY,
      cashier_id  INTEGER REFERENCES cashiers(id),
      terminal_id TEXT NOT NULL,
      reason      TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;

  // Column additions safe to run on an existing partial install
  const alterations = [
    `DO $$ BEGIN ALTER TABLE products ADD COLUMN reorder_level INTEGER NOT NULL DEFAULT 5; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cashiers ADD COLUMN first_name TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cashiers ADD COLUMN last_name TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE cashiers ADD COLUMN password_hash TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE sales ADD COLUMN amount_received NUMERIC(10,2); EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
    `DO $$ BEGIN ALTER TABLE sales ADD COLUMN change_given NUMERIC(10,2); EXCEPTION WHEN duplicate_column THEN NULL; END $$`,
  ];

  try {
    await pool.query(schema);
    for (const sql of alterations) {
      await pool.query(sql);
    }
    ok('All tables and columns are in place');
  } catch (err) {
    fail(`Schema error: ${err.message}`);
    throw err;
  }
}

// ── Step 4 — Seed products ───────────────────────────────────────────────────

async function seedProducts(pool) {
  heading('Step 4 · Seeding products');

  const products = [
    ['UNG-001', '6161000000011', 'Unga wa Ngano 2kg',        'Pantry',        250, 40],
    ['UNG-002', '6161000000028', 'Unga wa Sembe 2kg',        'Pantry',        180, 50],
    ['SUG-001', '6161000000035', 'Sugar 2kg',                'Pantry',        320, 35],
    ['SUG-002', '6161000000042', 'Mumias Sugar 1kg',         'Pantry',        170, 40],
    ['TEA-001', '6161000000059', 'Ketepa Tea Leaves 500g',   'Beverages',     250, 30],
    ['MLK-001', '6161000000066', 'Brookside Fresh Milk 500ml','Dairy',         60, 60],
    ['MLK-002', '6161000000073', 'Blue Band Margarine 250g', 'Dairy',         150, 25],
    ['OIL-001', '6161000000080', 'Kimbo Cooking Fat 2kg',    'Pantry',        480, 20],
    ['OIL-002', '6161000000097', 'Elianto Cooking Oil 2L',   'Pantry',        550, 25],
    ['BEV-001', '6161000000103', 'Coca-Cola 500ml',          'Beverages',      70, 80],
    ['BEV-002', '6161000000110', 'Keringet Water 1L',        'Beverages',      50,100],
    ['BAK-001', '6161000000127', 'Supa Loaf White Bread 400g','Bakery',        65, 40],
    ['SNK-001', '6161000000134', 'Britania Digestive Biscuits','Snacks',       90, 45],
    ['SNK-002', '6161000000141', 'Indomie Noodles 70g',      'Snacks',         35,100],
    ['HHD-001', '6161000000158', 'Omo Washing Powder 1kg',   'Household',     250, 30],
    ['PSC-001', '6161000000165', 'Colgate Toothpaste 100ml', 'Personal Care', 150, 35],
    ['PRD-001', '6161000000172', 'Tomatoes 1kg',             'Produce',        80, 50],
    ['PRD-002', '6161000000189', 'Onions 1kg',               'Produce',       100, 50],
    ['MLK-003', '6161000000196', 'Eggs Tray (30pc)',         'Dairy',         420, 20],
    ['PAN-001', '6161000000202', 'Royco Mchuzi Mix 100g',    'Pantry',         45, 60],
  ];

  let inserted = 0, updated = 0;
  for (const [sku, barcode, name, category, price, stock_qty] of products) {
    const { rowCount, rows } = await pool.query(
      `INSERT INTO products (sku, barcode, name, category, price, stock_qty)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (sku) DO UPDATE SET
         barcode   = EXCLUDED.barcode,
         name      = EXCLUDED.name,
         category  = EXCLUDED.category,
         price     = EXCLUDED.price,
         stock_qty = EXCLUDED.stock_qty
       RETURNING (xmax = 0) AS inserted`,
      [sku, barcode, name, category, price, stock_qty]
    );
    if (rows[0]?.inserted) inserted++; else updated++;
  }

  ok(`${inserted} products added, ${updated} already existed (updated)`);
}

// ── Step 5 — Register cashiers ───────────────────────────────────────────────

async function registerCashiers(pool) {
  heading('Step 5 · Registering cashiers');

  const accounts = [
    { first_name: 'Admin',   last_name: 'NoorCom', password: 'admin1234', role: 'admin'   },
    { first_name: 'Cashier', last_name: 'One',     password: 'till1234',  role: 'cashier' },
    { first_name: 'Cashier', last_name: 'Two',     password: 'till5678',  role: 'cashier' },
  ];

  for (const a of accounts) {
    const fullName = `${a.first_name} ${a.last_name}`;

    const { rows: existing } = await pool.query(
      'SELECT id FROM cashiers WHERE first_name = $1 AND last_name = $2',
      [a.first_name, a.last_name]
    );

    if (existing.length > 0) {
      info(`Already exists: ${fullName} — skipping`);
      continue;
    }

    const hash = await bcrypt.hash(a.password, 10);
    await pool.query(
      `INSERT INTO cashiers (name, first_name, last_name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)`,
      [fullName, a.first_name, a.last_name, hash, a.role]
    );
    ok(`Created ${a.role.padEnd(8)} : ${fullName}  (password: ${a.password})`);
  }

  // Final listing
  const { rows } = await pool.query(
    'SELECT id, name, role FROM cashiers ORDER BY id'
  );
  console.log(`\n  Cashiers in database (${rows.length} total):`);
  rows.forEach(r => console.log(`    [${r.id}] ${r.name.padEnd(20)} ${r.role}`));
}

// ── Step 6 — Check server is running, print LAN IP ───────────────────────────

async function finalReport() {
  heading('Step 6 · Final check');

  const port = Number(process.env.PORT) || 4000;

  // Ping the running server
  const serverUp = await new Promise((resolve) => {
    const req = http.get({ hostname: 'localhost', port, path: '/health' }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });

  const ips = getLanIPs();

  if (serverUp) {
    ok(`Nexus server is running on port ${port}`);
  } else {
    warn(`Server is NOT running yet on port ${port}`);
    console.log(`\n  Start it now with:\n    cd apps\\server && npx pm2 start ecosystem.config.cjs`);
    console.log(`  Then check: npx pm2 status`);
  }

  if (ips.length > 0) {
    console.log('\n  ─── LAN IP Addresses (give these to the till PCs) ───');
    ips.forEach(i => {
      console.log(`    ${i.name.padEnd(24)} ${i.address}`);
      if (serverUp) {
        console.log(`    Test URL: http://${i.address}:${port}/api/products`);
      }
    });
  } else {
    warn('No non-loopback network adapters found — is WiFi connected?');
  }

  console.log(`
  ─── Login credentials ───────────────────────────────────────
    Admin NoorCom   →  password: admin1234  (role: admin)
    Cashier One     →  password: till1234   (role: cashier)
    Cashier Two     →  password: till5678   (role: cashier)
  ─────────────────────────────────────────────────────────────
  `);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║      NoorCom Nexus POS  ·  Windows Setup Script         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  checkEnv();

  const pool = await connectDb();

  try {
    await applySchema(pool);
    await seedProducts(pool);
    await registerCashiers(pool);
    await finalReport();
  } finally {
    await pool.end();
  }

  console.log('Setup complete.\n');
}

main().catch((err) => {
  console.error('\n❌  Fatal error:', err.message);
  process.exit(1);
});
