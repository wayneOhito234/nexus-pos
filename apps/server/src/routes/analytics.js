import { Router } from 'express';
import { pool } from '../db.js';

export const analyticsRouter = Router();

// GET /api/analytics/summary
// Returns today's totals, a 7-day trend, top products, and a payment
// method breakdown -- everything the analytics panel needs in one call.
analyticsRouter.get('/summary', async (req, res) => {
  const { rows: todayRows } = await pool.query(`
    SELECT COALESCE(SUM(total), 0) AS total_sales, COUNT(*) AS transaction_count
    FROM sales
    WHERE created_at::date = CURRENT_DATE
  `);

  const { rows: trendRows } = await pool.query(`
    SELECT
      to_char(gs.day, 'Dy') AS label,
      COALESCE(s.total, 0) AS total
    FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS gs(day)
    LEFT JOIN (
      SELECT created_at::date AS sale_day, SUM(total) AS total
      FROM sales
      GROUP BY created_at::date
    ) s ON s.sale_day = gs.day::date
    ORDER BY gs.day
  `);

  const { rows: topProducts } = await pool.query(`
    SELECT p.name, SUM(si.qty) AS qty_sold
    FROM sale_items si
    JOIN products p ON p.id = si.product_id
    JOIN sales s ON s.id = si.sale_id
    WHERE s.created_at::date = CURRENT_DATE
    GROUP BY p.name
    ORDER BY qty_sold DESC
    LIMIT 5
  `);

  const { rows: paymentBreakdown } = await pool.query(`
    SELECT payment_method, COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
    FROM sales
    WHERE created_at::date = CURRENT_DATE
    GROUP BY payment_method
  `);

  res.json({
    todaySales: Number(todayRows[0].total_sales),
    transactionCount: Number(todayRows[0].transaction_count),
    trend: trendRows.map((r) => ({ label: r.label.trim(), total: Number(r.total) })),
    topProducts: topProducts.map((r) => ({ name: r.name, qty: Number(r.qty_sold) })),
    paymentBreakdown: paymentBreakdown.map((r) => ({
      method: r.payment_method,
      count: Number(r.count),
      total: Number(r.total),
    })),
  });
});