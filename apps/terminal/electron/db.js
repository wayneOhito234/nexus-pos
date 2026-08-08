const path = require('node:path');
const { app } = require('electron');
const Database = require('better-sqlite3');

const dbPath = path.join(app.getPath('userData'), 'cache.sqlite');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY,
    sku TEXT,
    barcode TEXT,
    name TEXT,
    category TEXT,
    price REAL,
    stock_qty INTEGER
  )
`);

function getCachedProducts() {
  return db.prepare('SELECT * FROM products ORDER BY name').all();
}

const upsert = db.prepare(`
  INSERT INTO products (id, sku, barcode, name, category, price, stock_qty)
  VALUES (@id, @sku, @barcode, @name, @category, @price, @stock_qty)
  ON CONFLICT(id) DO UPDATE SET
    sku = excluded.sku,
    barcode = excluded.barcode,
    name = excluded.name,
    category = excluded.category,
    price = excluded.price,
    stock_qty = excluded.stock_qty
`);

function setCachedProducts(products) {
  const tx = db.transaction((items) => {
    for (const product of items) upsert.run(product);
  });
  tx(products);
  return true;
}

module.exports = { getCachedProducts, setCachedProducts };
