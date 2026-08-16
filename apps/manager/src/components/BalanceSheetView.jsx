// apps/manager/src/components/BalanceSheetView.jsx
import { useEffect, useState, useRef } from 'react';
import { Printer, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { fetchBalanceSheet } from '../api/client.js';

const kes = (v) =>
  `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

const pct = (v) => (v == null ? 'N/A' : `${Number(v).toFixed(1)}%`);

const PERIODS = [
  { id: 'day',   label: 'Today' },
  { id: 'week',  label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'year',  label: 'This year' },
];

function Change({ value }) {
  if (value == null) return <span className="bs-change bs-change--neutral"><Minus size={11} /> N/A</span>;
  const positive = value >= 0;
  return (
    <span className={`bs-change ${positive ? 'bs-change--up' : 'bs-change--down'}`}>
      {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {Math.abs(value).toFixed(1)}% vs prev
    </span>
  );
}

export function BalanceSheetView({ onNotify }) {
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef(null);

  useEffect(() => {
    setLoading(true);
    fetchBalanceSheet(period)
      .then(setData)
      .catch((e) => onNotify(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [period]);

  function handlePrint() {
    window.print();
  }

  if (loading) return <p className="panel__note">Loading balance sheet…</p>;
  if (!data) return null;

  const { current, previous, changes, byMethod, byCategory } = data;
  const isProfit = current.gross_profit >= 0;

  return (
    <div className="bs" ref={printRef}>
      {/* Controls — hidden when printing */}
      <div className="bs__controls no-print">
        <div className="segmented">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              className={period === p.id ? 'is-active' : ''}
              onClick={() => setPeriod(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button className="primary small" onClick={handlePrint}>
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>

      {/* Print header — shown only when printing */}
      <div className="bs__print-header print-only">
        <h1>Nexus POS — Balance Sheet</h1>
        <p>Period: {PERIODS.find((p) => p.id === period)?.label}</p>
        <p>Generated: {new Date().toLocaleString('en-KE')}</p>
      </div>

      {/* Top-line summary */}
      <div className="bs__summary">
        <div className="bs__headline">
          <span className="bs__headline-label">Total Revenue</span>
          <span className="bs__headline-value">{kes(current.revenue)}</span>
          <Change value={changes.revenue_pct} />
        </div>

        <div className="bs__rows">
          <div className="bs__row">
            <span>Sales count</span>
            <span>{current.sale_count.toLocaleString()}</span>
          </div>
          <div className="bs__row">
            <span>Cost of goods sold (COGS)</span>
            <span className="bs__row--cost">{kes(current.cogs)}</span>
          </div>
          <div className="bs__divider" />
          <div className="bs__row bs__row--total">
            <span>Gross profit</span>
            <span className={isProfit ? 'bs__row--profit' : 'bs__row--loss'}>
              {kes(current.gross_profit)}
            </span>
          </div>
          <div className="bs__row">
            <span>Gross margin</span>
            <span className={isProfit ? 'bs__row--profit' : 'bs__row--loss'}>
              {pct(current.margin_pct)}
            </span>
          </div>
        </div>

        {!isProfit && (
          <div className="bs__alert">
            Revenue is below cost of goods for this period. Check cost prices
            are set correctly on all products, and review loss-making items in
            the Top Performers tab.
          </div>
        )}
      </div>

      <div className="bs__split">
        {/* Payment breakdown */}
        <div className="panel">
          <h3>Revenue by payment method</h3>
          {byMethod.length === 0 && (
            <p className="panel__note">No sales in this period.</p>
          )}
          {byMethod.map((m) => (
            <div className="record" key={m.method}>
              <div className="record__main">
                <strong>{m.method === 'cash' ? 'Cash' : 'M-Pesa'}</strong>
                <span>{m.sale_count} transactions</span>
              </div>
              <div className="record__figures">
                <span>{kes(m.revenue)}</span>
                <span className="muted">
                  {current.revenue > 0
                    ? `${((m.revenue / current.revenue) * 100).toFixed(0)}%`
                    : '0%'}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Previous period comparison */}
        <div className="panel">
          <h3>Period-over-period</h3>
          <div className="bs__compare">
            {[
              { label: 'Revenue',      cur: current.revenue,      prev: previous.revenue      },
              { label: 'COGS',         cur: current.cogs,         prev: previous.cogs         },
              { label: 'Gross profit', cur: current.gross_profit, prev: previous.gross_profit },
            ].map(({ label, cur, prev }) => (
              <div className="bs__compare-row" key={label}>
                <span className="bs__compare-label">{label}</span>
                <span>{kes(cur)}</span>
                <span className="muted">{kes(prev)}</span>
              </div>
            ))}
          </div>
          <p className="panel__note" style={{ marginTop: 10 }}>
            Left: current period. Right: previous period.
          </p>
        </div>
      </div>

      {/* Category breakdown */}
      {byCategory.length > 0 && (
        <div className="panel panel--wide" style={{ marginTop: 16 }}>
          <h3>By product category</h3>
          <div className="ledger">
            <div className="ledger__row ledger__row--head ledger__row--bs">
              <span>Category</span>
              <span>Units sold</span>
              <span>Revenue</span>
              <span>COGS</span>
              <span>Gross profit</span>
              <span>Margin</span>
            </div>
            {byCategory.map((c) => (
              <div className="ledger__row ledger__row--bs" key={c.category}>
                <span className="ledger__product">
                  <strong>{c.category}</strong>
                  <em>{c.units_sold} units</em>
                </span>
                <span>{Number(c.units_sold).toLocaleString()}</span>
                <span>{kes(c.revenue)}</span>
                <span className="muted">{kes(c.cogs)}</span>
                <span className={c.gross_profit >= 0 ? 'is-good' : 'is-bad'}>
                  {kes(c.gross_profit)}
                </span>
                <span className={c.margin_pct >= 0 ? 'is-good' : 'is-bad'}>
                  {pct(c.margin_pct)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
