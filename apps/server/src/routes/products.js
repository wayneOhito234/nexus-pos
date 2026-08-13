import { Router } from 'express';
import { pool } from '../db.js';

export const productsRouter = Router();

productsRouter.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, sku, barcode, name, category, price, stock_qty, reorder_level FROM products ORDER BY name'
  );
  res.json(rows);
});