import { useEffect, useState } from 'react';
import { TrendingUp, ShoppingBag, Receipt, X } from 'lucide-react';
import { fetchAnalyticsSummary } from '../api/managerClient.js';

const formatKes = (value) =>
  `KES ${Number(value).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

export function AnalyticsPanel({ onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const summary = await fetchAnalyticsSummary();
      setData(summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const maxTrend = data ? Math.max(...data.trend.map((d) => d.total), 1) : 1;
  const maxProduct = data && data.topProducts.length ? Math.max(...data.topProducts.map((p) => p.qty), 1) : 1;

  return (
    <div className="manager-panel-overlay">
      <div className="analytics-panel">
        <div className="manager-panel__header">
          <h2>Analytics</h2>
          <button className="manager-panel__exit" onClick={onClose}>
            <X size={16} />
            Close
          </button>
        </div>

        {loading && <p className="manager-panel__message">Loading analytics...</p>}
        {error && <p className="manager-panel__message manager-panel__message--error">{error}</p>}

        {data && !loading && (
          <>
            <div className="analytics-kpis">
              <div className="analytics-kpi">
                <Receipt size={20} className="analytics-kpi__icon" />
                <div>
                  <span className="analytics-kpi__value">{formatKes(data.todaySales)}</span>
                  <span className="analytics-kpi__label">Today's sales</span>
                </div>
              </div>
              <div className="analytics-kpi">
                <ShoppingBag size={20} className="analytics-kpi__icon" />
                <div>
                  <span className="analytics-kpi__value">{data.transactionCount}</span>
                  <span className="analytics-kpi__label">Transactions today</span>
                </div>
              </div>
              <div className="analytics-kpi">
                <TrendingUp size={20} className="analytics-kpi__icon" />
                <div>
                  <span className="analytics-kpi__value">
                    {data.transactionCount > 0
                      ? formatKes(data.todaySales / data.transactionCount)
                      : formatKes(0)}
                  </span>
                  <span className="analytics-kpi__label">Average sale</span>
                </div>
              </div>
            </div>

            <div className="analytics-section">
              <h3 className="analytics-section__title">Last 7 days</h3>
              <div className="analytics-bars">
                {data.trend.map((d) => (
                  <div key={d.label} className="analytics-bar-col">
                    <div
                      className="analytics-bar"
                      style={{ height: `${Math.max((d.total / maxTrend) * 100, 4)}%` }}
                      title={formatKes(d.total)}
                    />
                    <span className="analytics-bar-label">{d.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="analytics-section">
              <h3 className="analytics-section__title">Top sellers today</h3>
              {data.topProducts.length === 0 && (
                <p className="analytics-section__empty">No sales yet today.</p>
              )}
              {data.topProducts.map((p) => (
                <div key={p.name} className="analytics-product-row">
                  <span className="analytics-product-row__name">{p.name}</span>
                  <div className="analytics-product-row__bar-track">
                    <div
                      className="analytics-product-row__bar"
                      style={{ width: `${(p.qty / maxProduct) * 100}%` }}
                    />
                  </div>
                  <span className="analytics-product-row__qty">{p.qty}</span>
                </div>
              ))}
            </div>

            <div className="analytics-section">
              <h3 className="analytics-section__title">Payment methods today</h3>
              {data.paymentBreakdown.length === 0 && (
                <p className="analytics-section__empty">No sales yet today.</p>
              )}
              {data.paymentBreakdown.map((p) => (
                <div key={p.method} className="analytics-payment-row">
                  <span className="analytics-payment-row__method">{p.method}</span>
                  <span className="analytics-payment-row__count">{p.count} sales</span>
                  <span className="analytics-payment-row__total">{formatKes(p.total)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}