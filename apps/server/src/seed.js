import 'dotenv/config';
import { pool } from './db.js';

const products = [
  ['UNG-001', '6161000000011', 'Unga wa Ngano 2kg', 'Pantry', 250, 40],
  ['UNG-002', '6161000000028', 'Unga wa Sembe 2kg', 'Pantry', 180, 50],
  ['SUG-001', '6161000000035', 'Sugar 2kg', 'Pantry', 320, 35],
  ['SUG-002', '6161000000042', 'Mumias Sugar 1kg', 'Pantry', 170, 40],
  ['TEA-001', '6161000000059', 'Ketepa Tea Leaves 500g', 'Beverages', 250, 30],
  ['MLK-001', '6161000000066', 'Brookside Fresh Milk 500ml', 'Dairy', 60, 60],
  ['MLK-002', '6161000000073', 'Blue Band Margarine 250g', 'Dairy', 150, 25],
  ['OIL-001', '6161000000080', 'Kimbo Cooking Fat 2kg', 'Pantry', 480, 20],
  ['OIL-002', '6161000000097', 'Elianto Cooking Oil 2L', 'Pantry', 550, 25],
  ['BEV-001', '6161000000103', 'Coca-Cola 500ml', 'Beverages', 70, 80],
  ['BEV-002', '6161000000110', 'Keringet Water 1L', 'Beverages', 50, 100],
  ['BAK-001', '6161000000127', 'Supa Loaf White Bread 400g', 'Bakery', 65, 40],
  ['SNK-001', '6161000000134', 'Britania Digestive Biscuits', 'Snacks', 90, 45],
  ['SNK-002', '6161000000141', 'Indomie Noodles 70g', 'Snacks', 35, 100],
  ['HHD-001', '6161000000158', 'Omo Washing Powder 1kg', 'Household', 250, 30],
  ['PSC-001', '6161000000165', 'Colgate Toothpaste 100ml', 'Personal Care', 150, 35],
  ['PRD-001', '6161000000172', 'Tomatoes 1kg', 'Produce', 80, 50],
  ['PRD-002', '6161000000189', 'Onions 1kg', 'Produce', 100, 50],
  ['MLK-003', '6161000000196', 'Eggs Tray (30pc)', 'Dairy', 420, 20],
  ['PAN-001', '6161000000202', 'Royco Mchuzi Mix 100g', 'Pantry', 45, 60],
];

async function seed() {
  for (const [sku, barcode, name, category, price, stock_qty] of products) {
    await pool.query(
      `INSERT INTO products (sku, barcode, name, category, price, stock_qty)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (sku) DO UPDATE SET
         barcode = EXCLUDED.barcode,
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         price = EXCLUDED.price,
         stock_qty = EXCLUDED.stock_qty`,
      [sku, barcode, name, category, price, stock_qty]
    );
  }
  console.log(`Seeded ${products.length} products.`);
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
