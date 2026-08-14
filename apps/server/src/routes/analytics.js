import { Router } from 'express';
import { pool } from '../db.js';
import { managerIpGuard } from '../ipAllowlist.js';

export const analyticsRouter = Router();

// GET /api/analytics/summary
// Today's totals, a 7-day trend, top products, and a payment method
// breakdown -- everything the analytics panel needs in one call.
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

// GET /api/analytics/breakdown?period=day|week|month
// Totals split by till, payment method and cashier -- what a manager
// actually reconciles against at close.
//
// `since` is interpolated rather than parameterised because Postgres won't
// accept date_trunc's unit as a bound parameter. Safe here since `period`
// is validated against a fixed list first, so nothing user-supplied ever
// reaches the SQL.
analyticsRouter.get('/breakdown', managerIpGuard, async (req, res) => {
  const period = ['day', 'week', 'month'].includes(req.query.period) ? req.query.period : 'day';

  const since = {
    day: "date_trunc('day', now())",
    week: "date_trunc('week', now())",
    month: "date_trunc('month', now())",
  }[period];

  const { rows: byTerminal } = await pool.query(`
    SELECT terminal_id,
           COUNT(*)                AS sale_count,
           COALESCE(SUM(total), 0) AS revenue
    FROM sales
    WHERE created_at >= ${since}
    GROUP BY terminal_id
    ORDER BY terminal_id
  `);

  const { rows: byMethod } = await pool.query(`
    SELECT payment_method,
           COUNT(*)                AS sale_count,
           COALESCE(SUM(total), 0) AS revenue
    FROM sales
    WHERE created_at >= ${since}
    GROUP BY payment_method
  `);

  const { rows: byCashier } = await pool.query(`
    SELECT c.name AS cashier_name,
           COUNT(*)                  AS sale_count,
           COALESCE(SUM(s.total), 0) AS revenue
    FROM sales s
    JOIN cashiers c ON c.id = s.cashier_id
    WHERE s.created_at >= ${since}
    GROUP BY c.name
    ORDER BY revenue DESC
  `);

  const { rows: totals } = await pool.query(`
    SELECT COUNT(*)                AS sale_count,
           COALESCE(SUM(total), 0) AS revenue,
           COALESCE(AVG(total), 0) AS average_sale
    FROM sales
    WHERE created_at >= ${since}
  `);

  res.json({ period, totals: totals[0], byTerminal, byMethod, byCashier });
});

// GET /api/analytics/receipt/:saleId
// The full line detail behind one sale, so a manager can pull up a
// customer's receipt without walking to the till.
analyticsRouter.get('/receipt/:saleId', managerIpGuard, async (req, res) => {
  const { rows: sale } = await pool.query(
    `SELECT s.*, c.name AS cashier_name
     FROM sales s
     LEFT JOIN cashiers c ON c.id = s.cashier_id
     WHERE s.id = $1`,
    [req.params.saleId]
  );

  if (sale.length === 0) return res.status(404).json({ error: 'Sale not found' });

  const { rows: items } = await pool.query(
    `SELECT si.qty, si.price, p.name, p.sku, (si.qty * si.price) AS line_total
     FROM sale_items si
     JOIN products p ON p.id = si.product_id
     WHERE si.sale_id = $1
     ORDER BY si.id`,
    [req.params.saleId]
  );

  res.json({ ...sale[0], items });
});