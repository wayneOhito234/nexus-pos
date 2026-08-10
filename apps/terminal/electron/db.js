const path = require('node:path');
const fs = require('node:fs');
const { app } = require('electron');
const initSqlJs = require('sql.js');

const dbPath = path.join(app.getPath('userData'), 'cache.sqlite');

let db = null;

// sql.js keeps the database in memory, so every write is followed by an
// explicit save to disk. That's the one real difference from better-sqlite3.
function persist() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

async function initDb() {
  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: (file) => path.join(__dirname, '..', '..', '..', 'node_modules', 'sql.js', 'dist', file),
  });

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      sku TEXT,
      barcode TEXT,
      name TEXT,
      category TEXT,
      price REAL,
      stock_qty INTEGER
    );

    CREATE TABLE IF NOT EXISTS local_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_ref TEXT UNIQUE NOT NULL,
      terminal_id TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      subtotal_cents INTEGER NOT NULL,
      vat_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      amount_received_cents INTEGER,
      change_given_cents INTEGER,
      mpesa_ref TEXT,
      synced INTEGER NOT NULL DEFAULT 0,
      server_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS local_sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_sale_id INTEGER NOT NULL REFERENCES local_sales(id),
      product_id INTEGER NOT NULL,
      qty INTEGER NOT NULL,
      price_cents INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_meta (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_local_sales_synced ON local_sales(synced);
    CREATE INDEX IF NOT EXISTS idx_local_sale_items_sale_id ON local_sale_items(local_sale_id);
    CREATE INDEX IF NOT EXISTS idx_local_sale_items_product_id ON local_sale_items(product_id);
  `);

  persist();
  return db;
}

const toCents = (value) => (value === null || value === undefined ? null : Math.round(Number(value) * 100));
const fromCents = (cents) => (cents === null || cents === undefined ? null : cents / 100);

// Helper: run a query and return rows as plain objects.
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows[0] || null;
}

function getCachedProducts() {
  if (!db) return [];
  return queryAll('SELECT * FROM products ORDER BY name');
}

function setCachedProducts(products) {
  if (!db) return false;
  db.run('BEGIN TRANSACTION');
  try {
    for (const p of products) {
      db.run(
        `INSERT INTO products (id, sku, barcode, name, category, price, stock_qty)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           sku = excluded.sku,
           barcode = excluded.barcode,
           name = excluded.name,
           category = excluded.category,
           price = excluded.price,
           stock_qty = excluded.stock_qty`,
        [p.id, p.sku, p.barcode, p.name, p.category, p.price, p.stock_qty]
      );
    }
    db.run('COMMIT');
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
  persist();
  return true;
}

function nextLocalRef(terminalId) {
  const key = `ref_counter_${terminalId}`;
  const row = queryOne('SELECT value FROM local_meta WHERE key = ?', [key]);
  const next = (row?.value || 0) + 1;

  db.run(
    `INSERT INTO local_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, next]
  );

  return `${terminalId.toUpperCase()}-${String(next).padStart(6, '0')}`;
}

function saveSaleLocally({ terminal_id, payment_method, items, subtotal, vat, total, amount_received, change_given, mpesa_ref }) {
  if (!db) throw new Error('local database not ready');

  db.run('BEGIN TRANSACTION');
  try {
    const localRef = nextLocalRef(terminal_id);

    db.run(
      `INSERT INTO local_sales
        (local_ref, terminal_id, payment_method, subtotal_cents, vat_cents, total_cents, amount_received_cents, change_given_cents, mpesa_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        localRef,
        terminal_id,
        payment_method,
        toCents(subtotal),
        toCents(vat),
        toCents(total),
        toCents(amount_received),
        toCents(change_given),
        mpesa_ref ?? null,
      ]
    );

    const idRow = queryOne('SELECT last_insert_rowid() AS id');
    const localSaleId = idRow.id;

    for (const item of items) {
      db.run(
        `INSERT INTO local_sale_items (local_sale_id, product_id, qty, price_cents)
         VALUES (?, ?, ?, ?)`,
        [localSaleId, item.product_id, item.qty, toCents(item.price)]
      );
      db.run('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?', [item.qty, item.product_id]);
    }

    db.run('COMMIT');
    persist();

    return {
      id: localSaleId,
      local_ref: localRef,
      terminal_id,
      payment_method,
      subtotal,
      vat,
      total,
      amount_received,
      change_given,
      mpesa_ref,
      items,
    };
  } catch (err) {
    db.run('ROLLBACK');
    throw err;
  }
}

function getPendingSales() {
  if (!db) return [];
  const sales = queryAll('SELECT * FROM local_sales WHERE synced = 0 ORDER BY created_at ASC');

  return sales.map((sale) => ({
    id: sale.id,
    local_ref: sale.local_ref,
    terminal_id: sale.terminal_id,
    payment_method: sale.payment_method,
    subtotal: fromCents(sale.subtotal_cents),
    vat: fromCents(sale.vat_cents),
    total: fromCents(sale.total_cents),
    amount_received: fromCents(sale.amount_received_cents),
    change_given: fromCents(sale.change_given_cents),
    mpesa_ref: sale.mpesa_ref,
    synced: sale.synced,
    server_id: sale.server_id,
    created_at: sale.created_at,
    items: queryAll(
      'SELECT product_id, qty, price_cents FROM local_sale_items WHERE local_sale_id = ?',
      [sale.id]
    ).map((i) => ({
      product_id: i.product_id,
      qty: i.qty,
      price: fromCents(i.price_cents),
    })),
  }));
}

function markSaleSynced(localSaleId, serverId) {
  if (!db) return;
  db.run('UPDATE local_sales SET synced = 1, server_id = ? WHERE id = ?', [serverId, localSaleId]);
  persist();
}

function getPendingSyncCount() {
  if (!db) return 0;
  const row = queryOne('SELECT COUNT(*) AS count FROM local_sales WHERE synced = 0');
  return row?.count || 0;
}

module.exports = {
  initDb,
  getCachedProducts,
  setCachedProducts,
  saveSaleLocally,
  getPendingSales,
  markSaleSynced,
  getPendingSyncCount,
};