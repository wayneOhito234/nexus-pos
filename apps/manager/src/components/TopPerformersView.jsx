// apps/manager/src/components/TopPerformersView.jsx
import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { fetchTopProducts } from '../api/client.js';

const kes = (v) =>
  `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

const DAYS = [7, 14, 30, 90];

function ProfitBar({ value, max, isLoss }) {
  const width = max > 0 ? Math.min((Math.abs(value) / max) * 100, 100) : 0;
  return (
    <div className="perf__bar-track">
      <div
        className={`perf__bar ${isLoss ? 'perf__bar--loss' : 'perf__bar--profit'}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function ProductTable({ rows, showLoss }) {
  const maxProfit = Math.max(...rows.map((r) => Math.abs(r.gross_profit)), 1);

  if (rows.length === 0) {
    return (
      <p className="panel__note">
        No products with cost prices found for this period.
        Set cost prices on products to see performance data.
      </p>
    );
  }

  return (
    <div className="ledger">
      <div className="ledger__row ledger__row--head ledger__row--perf">
        <span>Product</span>
        <span>Units</span>
        <span>Revenue</span>
        <span>COGS</span>
        <span>Gross profit</span>
        <span>Margin</span>
        <span>Trend</span>
      </div>
      {rows.map((r, i) => {
        const isLoss = r.gross_profit < 0;
        return (
          <div
            className={`ledger__row ledger__row--perf ${isLoss ? 'ledger__row--loss-bg' : ''}`}
            key={r.id}
          >
            <span className="ledger__product">
              <strong>
                <span className="perf__rank">{i + 1}</span>
                {r.name}
              </strong>
              <em>{r.sku} · {r.category}</em>
            </span>
            <span>{Number(r.units_sold).toLocaleString()}</span>
            <span>{kes(r.revenue)}</span>
            <span className="muted">{kes(r.cogs)}</span>
            <span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span className={isLoss ? 'is-bad' : 'is-good'}>{kes(r.gross_profit)}</span>
                <ProfitBar value={r.gross_profit} max={maxProfit} isLoss={isLoss} />
              </div>
            </span>
            <span className={isLoss ? 'is-bad' : 'is-good'}>
              {Number(r.margin_pct).toFixed(1)}%
            </span>
            <span>
              {isLoss
                ? <TrendingDown size={15} style={{ color: 'var(--bad)' }} />
                : <TrendingUp   size={15} style={{ color: 'var(--good)' }} />
              }
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TopPerformersView({ onNotify }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('top');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchTopProducts(days, 10)
      .then(setData)
      .catch((e) => onNotify(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return <p className="panel__note">Loading performance data…</p>;
  if (!data) return null;

  const rows = tab === 'top' ? data.top : data.bottom;
  const profitableCount  = data.top.filter((r) => r.gross_profit >= 0).length;
  const lossCount        = data.top.filter((r) => r.gross_profit <  0).length;
  const totalProfit      = data.top.reduce((s, r) => s + r.gross_profit, 0);

  return (
    <div className="view__body">
      {/* Controls */}
      <div className="perf__controls no-print">
        <div className="segmented">
          {DAYS.map((d) => (
            <button
              key={d}
              className={days === d ? 'is-active' : ''}
              onClick={() => setDays(d)}
            >
              {d} days
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
        <div className="kpi">
          <span>Profitable products</span>
          <strong style={{ color: 'var(--good)' }}>{profitableCount}</strong>
        </div>
        <div className="kpi">
          <span>Loss-making products</span>
          <strong style={{ color: lossCount > 0 ? 'var(--bad)' : 'var(--text)' }}>
            {lossCount}
          </strong>
        </div>
        <div className="kpi">
          <span>Net gross profit</span>
          <strong style={{ color: totalProfit >= 0 ? 'var(--good)' : 'var(--bad)' }}>
            KES {Number(totalProfit).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
          </strong>
        </div>
      </div>

      {/* Tab toggle */}
      <div className="perf__tabs no-print">
        <button
          className={`perf__tab ${tab === 'top' ? 'is-active' : ''}`}
          onClick={() => setTab('top')}
        >
          <TrendingUp size={14} /> Best performers
        </button>
        <button
          className={`perf__tab ${tab === 'bottom' ? 'is-active is-bad-tab' : ''}`}
          onClick={() => setTab('bottom')}
        >
          <TrendingDown size={14} /> Loss makers
        </button>
      </div>

      <div className="panel panel--wide">
        <div className="panel__head-row">
          <h3>{tab === 'top' ? 'Top performing products' : 'Loss-making products'}</h3>
          <p className="panel__note" style={{ margin: 0 }}>
            {tab === 'top'
              ? 'Ranked by gross profit descending. Only products with a cost price are shown.'
              : 'Products where cost of goods exceeds revenue. Review pricing or cost entries.'
            }
          </p>
        </div>
        <ProductTable rows={rows} showLoss={tab === 'bottom'} />
      </div>
    </div>
  );
}
