import { Router } from 'express';
import { pool } from '../db.js';
import { managerIpGuard } from '../ipAllowlist.js';
import { requireAuth } from '../auth.js';

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
analyticsRouter.get('/breakdown', managerIpGuard, requireAuth, async (req, res) => {
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
analyticsRouter.get('/receipt/:saleId', managerIpGuard, requireAuth, async (req, res) => {
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

// GET /api/analytics/balance-sheet?period=day|week|month|year
// Revenue, cost of goods sold, gross profit and margin, with a comparison
// against the previous equivalent period.
//
// Note the deliberate asymmetry: revenue comes from the sales table alone,
// while cost of goods only counts products that have a cost_price. Margin
// is therefore understated until every product has a cost recorded, which
// is honest -- inferring a cost would be worse than showing a gap.
analyticsRouter.get('/balance-sheet', managerIpGuard, requireAuth, async (req, res) => {
  const period = ['day', 'week', 'month', 'year'].includes(req.query.period)
    ? req.query.period
    : 'month';

  const since = {
    day:   "date_trunc('day',   now())",
    week:  "date_trunc('week',  now())",
    month: "date_trunc('month', now())",
    year:  "date_trunc('year',  now())",
  }[period];

  const prevSince = {
    day:   "date_trunc('day',   now()) - INTERVAL '1 day'",
    week:  "date_trunc('week',  now()) - INTERVAL '1 week'",
    month: "date_trunc('month', now()) - INTERVAL '1 month'",
    year:  "date_trunc('year',  now()) - INTERVAL '1 year'",
  }[period];

  const prevUntil = since;

  const { rows: current } = await pool.query(`
    SELECT
      COUNT(DISTINCT s.id)                                    AS sale_count,
      COALESCE(SUM(si.qty * si.price), 0)                     AS costed_revenue,
      COALESCE(SUM(si.qty * p.cost_price), 0)                 AS cogs,
      COALESCE(SUM(si.qty * (si.price - p.cost_price)), 0)    AS gross_profit
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.id
    JOIN products   p  ON p.id = si.product_id
    WHERE s.created_at >= ${since}
      AND p.cost_price IS NOT NULL
  `);

  const { rows: previous } = await pool.query(`
    SELECT
      COALESCE(SUM(si.qty * si.price), 0)                     AS costed_revenue,
      COALESCE(SUM(si.qty * p.cost_price), 0)                 AS cogs,
      COALESCE(SUM(si.qty * (si.price - p.cost_price)), 0)    AS gross_profit
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.id
    JOIN products   p  ON p.id = si.product_id
    WHERE s.created_at >= ${prevSince}
      AND s.created_at <  ${prevUntil}
      AND p.cost_price IS NOT NULL
  `);

  // Total revenue across every sale, whether the product has a cost or not.
  const { rows: totalRevenue } = await pool.query(`
    SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS sale_count
    FROM sales
    WHERE created_at >= ${since}
  `);

  const { rows: prevRevenue } = await pool.query(`
    SELECT COALESCE(SUM(total), 0) AS revenue
    FROM sales
    WHERE created_at >= ${prevSince} AND created_at < ${prevUntil}
  `);

  const { rows: byMethod } = await pool.query(`
    SELECT payment_method,
           COUNT(*)                AS sale_count,
           COALESCE(SUM(total), 0) AS revenue
    FROM sales
    WHERE created_at >= ${since}
    GROUP BY payment_method
    ORDER BY revenue DESC
  `);

  const { rows: byCategory } = await pool.query(`
    SELECT
      p.category,
      SUM(si.qty)                                              AS units_sold,
      COALESCE(SUM(si.qty * si.price), 0)                     AS revenue,
      COALESCE(SUM(si.qty * p.cost_price), 0)                 AS cogs,
      COALESCE(SUM(si.qty * (si.price - p.cost_price)), 0)    AS gross_profit
    FROM sale_items si
    JOIN products p  ON p.id = si.product_id
    JOIN sales    s  ON s.id = si.sale_id
    WHERE s.created_at >= ${since}
      AND p.cost_price IS NOT NULL
    GROUP BY p.category
    ORDER BY gross_profit DESC
  `);

  // How much of the revenue we can actually calculate margin on. If this is
  // well below 100%, the profit figures are incomplete rather than wrong.
  const { rows: coverage } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE cost_price IS NOT NULL) AS costed,
      COUNT(*)                                       AS total
    FROM products WHERE active = true
  `);

  const cur = current[0];
  const prev = previous[0];
  const rev = totalRevenue[0];

  const pct = (now, before) =>
    Number(before) > 0 ? ((Number(now) - Number(before)) / Number(before)) * 100 : null;

  res.json({
    period,
    current: {
      revenue:        Number(rev.revenue),
      sale_count:     Number(rev.sale_count),
      costed_revenue: Number(cur.costed_revenue),
      cogs:           Number(cur.cogs),
      gross_profit:   Number(cur.gross_profit),
      // Margin against costed revenue, not total -- dividing profit by
      // revenue that includes uncosted items would understate it.
      margin_pct: Number(cur.costed_revenue) > 0
        ? (Number(cur.gross_profit) / Number(cur.costed_revenue)) * 100
        : 0,
    },
    previous: {
      revenue:      Number(prevRevenue[0].revenue),
      cogs:         Number(prev.cogs),
      gross_profit: Number(prev.gross_profit),
    },
    changes: {
      revenue_pct: pct(rev.revenue, prevRevenue[0].revenue),
      profit_pct:  pct(cur.gross_profit, prev.gross_profit),
    },
    coverage: {
      products_with_cost: Number(coverage[0].costed),
      products_total:     Number(coverage[0].total),
    },
    byMethod: byMethod.map((r) => ({
      method:     r.payment_method,
      sale_count: Number(r.sale_count),
      revenue:    Number(r.revenue),
    })),
    byCategory: byCategory.map((r) => ({
      category:     r.category,
      units_sold:   Number(r.units_sold),
      revenue:      Number(r.revenue),
      cogs:         Number(r.cogs),
      gross_profit: Number(r.gross_profit),
      margin_pct: Number(r.revenue) > 0
        ? (Number(r.gross_profit) / Number(r.revenue)) * 100
        : 0,
    })),
  });
});

// GET /api/analytics/top-products?days=30&limit=10
// Best and worst performers by gross profit, in one call.
analyticsRouter.get('/top-products', managerIpGuard, requireAuth, async (req, res) => {
  const days  = Math.min(Math.max(parseInt(req.query.days  || '30', 10), 1), 365);
  const limit = Math.min(Math.max(parseInt(req.query.limit || '10', 10), 1), 50);

  const { rows } = await pool.query(`
    SELECT
      p.id, p.name, p.sku, p.category,
      p.price      AS selling_price,
      p.cost_price,
      SUM(si.qty)                                              AS units_sold,
      COALESCE(SUM(si.qty * si.price), 0)                     AS revenue,
      COALESCE(SUM(si.qty * p.cost_price), 0)                 AS cogs,
      COALESCE(SUM(si.qty * (si.price - p.cost_price)), 0)    AS gross_profit
    FROM products p
    JOIN sale_items si ON si.product_id = p.id
    JOIN sales      s  ON s.id = si.sale_id
    WHERE s.created_at >= now() - ($1 || ' days')::INTERVAL
      AND p.cost_price IS NOT NULL
    GROUP BY p.id, p.name, p.sku, p.category, p.price, p.cost_price
    ORDER BY gross_profit DESC
  `, [String(days)]);

  const all = rows.map((r) => ({
    id:            Number(r.id),
    name:          r.name,
    sku:           r.sku,
    category:      r.category,
    selling_price: Number(r.selling_price),
    cost_price:    Number(r.cost_price),
    units_sold:    Number(r.units_sold),
    revenue:       Number(r.revenue),
    cogs:          Number(r.cogs),
    gross_profit:  Number(r.gross_profit),
    margin_pct: Number(r.revenue) > 0
      ? (Number(r.gross_profit) / Number(r.revenue)) * 100
      : 0,
  }));

  res.json({
    days,
    top:    all.slice(0, limit),
    bottom: [...all].sort((a, b) => a.gross_profit - b.gross_profit).slice(0, limit),
  });
});

// GET /api/analytics/dashboard
// The owner's one screen: how the day went, and anything worth looking at.
// Assembled from several small queries rather than one large join, since
// each answers a different question.
analyticsRouter.get('/dashboard', managerIpGuard, requireAuth, async (req, res) => {
  const q = (sql) => pool.query(sql);

  const [today, week, month, byTerminal, byMethod, lowStock, owed, negative, drawer, noPin] =
    await Promise.all([
      q(`
        SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS sale_count,
               COALESCE(AVG(total),0) AS average_sale
        FROM sales WHERE created_at >= date_trunc('day', now())
      `),
      q(`
        SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS sale_count
        FROM sales WHERE created_at >= date_trunc('week', now())
      `),
      q(`
        SELECT COALESCE(SUM(total),0) AS revenue, COUNT(*) AS sale_count
        FROM sales WHERE created_at >= date_trunc('month', now())
      `),
      q(`
        SELECT terminal_id, COUNT(*) AS sale_count, COALESCE(SUM(total),0) AS revenue
        FROM sales WHERE created_at >= date_trunc('day', now())
        GROUP BY terminal_id ORDER BY terminal_id
      `),
      q(`
        SELECT payment_method, COALESCE(SUM(total),0) AS revenue
        FROM sales WHERE created_at >= date_trunc('day', now())
        GROUP BY payment_method
      `),
      q(`
        SELECT id, name, sku, stock_qty, store_qty, reorder_level
        FROM products
        WHERE active = true AND stock_qty <= reorder_level
        ORDER BY stock_qty ASC LIMIT 10
      `),
      q(`
        SELECT COALESCE(SUM(total_cost - amount_paid),0) AS balance
        FROM goods_received WHERE total_cost > amount_paid
      `),
      q(`
        SELECT id, name, sku, stock_qty, store_qty FROM products
        WHERE stock_qty < 0 OR store_qty < 0
      `),
      q(`
        SELECT COUNT(*) AS count FROM drawer_events
        WHERE created_at >= date_trunc('day', now())
      `),
      q(`
        SELECT t.terminal_id FROM (
          SELECT DISTINCT terminal_id FROM sales
          UNION SELECT DISTINCT terminal_id FROM shifts
        ) t
        WHERE NOT EXISTS (
          SELECT 1 FROM drawer_pins d
          WHERE d.terminal_id = t.terminal_id
            AND d.valid_for = CURRENT_DATE AND d.cleared_at IS NULL
        )
      `),
    ]);

  const cash = Number(byMethod.rows.find((r) => r.payment_method === 'cash')?.revenue || 0);
  const mpesa = Number(byMethod.rows.find((r) => r.payment_method !== 'cash')?.revenue || 0);

  res.json({
    today: { ...today.rows[0], cash, mpesa },
    week: week.rows[0],
    month: month.rows[0],
    byTerminal: byTerminal.rows,
    lowStock: lowStock.rows,
    supplierBalance: Number(owed.rows[0].balance),
    exceptions: {
      negativeStock: negative.rows,
      drawerOpensToday: Number(drawer.rows[0].count),
      tillsWithoutPin: noPin.rows.map((r) => r.terminal_id),
    },
  });
});