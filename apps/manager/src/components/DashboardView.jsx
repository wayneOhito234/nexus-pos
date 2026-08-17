import { useEffect, useState } from 'react';
import { AlertTriangle, TrendingUp, Wallet, Store } from 'lucide-react';
import { fetchDashboard } from '../api/client.js';

const kes = (v) => `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

export function DashboardView({ staff, onNotify }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    // Refresh while it sits open, so an owner watching the screen sees the
    // day build rather than a frozen snapshot.
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, []);

  async function load() {
    try {
      setData(await fetchDashboard());
    } catch (err) {
      onNotify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="view"><p className="panel__note">Loading...</p></div>;
  if (!data) return <div className="view"><p className="panel__note">Nothing to show.</p></div>;

  const { today, week, month, byTerminal, lowStock, supplierBalance, exceptions } = data;

  const alerts = [
    exceptions.tillsWithoutPin.length > 0 && {
      kind: 'warn',
      text: `${exceptions.tillsWithoutPin.join(', ')} has no drawer PIN today. Cash sales needing change are blocked there.`,
    },
    exceptions.negativeStock.length > 0 && {
      kind: 'bad',
      text: `${exceptions.negativeStock.length} product${exceptions.negativeStock.length === 1 ? '' : 's'} showing negative stock. Someone sold more than the system thought existed.`,
    },
    lowStock.length > 0 && {
      kind: 'warn',
      text: `${lowStock.length} product${lowStock.length === 1 ? '' : 's'} at or below reorder level.`,
    },
    supplierBalance > 0 && {
      kind: 'info',
      text: `${kes(supplierBalance)} still owed to suppliers.`,
    },
  ].filter(Boolean);

  return (
    <div className="view">
      <header className="view__head">
        <h2>Good {greeting()}, {staff.name.split(' ')[0]}</h2>
        <p className="panel__note">Where the business stands right now.</p>
      </header>

      <div className="kpis kpis--four">
        <div className="kpi">
          <span>Today</span>
          <strong>{kes(today.revenue)}</strong>
          <em>{today.sale_count} sales &middot; {kes(today.average_sale)} average</em>
        </div>
        <div className="kpi">
          <span>This week</span>
          <strong>{kes(week.revenue)}</strong>
          <em>{week.sale_count} sales</em>
        </div>
        <div className="kpi">
          <span>This month</span>
          <strong>{kes(month.revenue)}</strong>
          <em>{month.sale_count} sales</em>
        </div>
        <div className="kpi">
          <span>Owed to suppliers</span>
          <strong className={supplierBalance > 0 ? 'is-owed' : ''}>{kes(supplierBalance)}</strong>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="alerts">
          {alerts.map((a, i) => (
            <div className={`alert alert--${a.kind}`} key={i}>
              <AlertTriangle size={14} />
              {a.text}
            </div>
          ))}
        </div>
      )}

      <div className="split">
        <div className="panel">
          <h3><Wallet size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Today's cash position</h3>
          <div className="record">
            <div className="record__main"><strong>Cash</strong></div>
            <div className="record__figures"><span>{kes(today.cash)}</span></div>
          </div>
          <div className="record">
            <div className="record__main"><strong>M-Pesa</strong></div>
            <div className="record__figures"><span>{kes(today.mpesa)}</span></div>
          </div>
          <p className="panel__note">
            {exceptions.drawerOpensToday} drawer opening
            {exceptions.drawerOpensToday === 1 ? '' : 's'} outside a sale today.
          </p>
        </div>

        <div className="panel">
          <h3><Store size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} /> By till, today</h3>
          {byTerminal.length === 0 && <p className="panel__note">No sales yet today.</p>}
          {byTerminal.map((t) => (
            <div className="record" key={t.terminal_id}>
              <div className="record__main">
                <strong>{t.terminal_id}</strong>
                <span>{t.sale_count} sales</span>
              </div>
              <div className="record__figures"><span>{kes(t.revenue)}</span></div>
            </div>
          ))}
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="panel panel--wide">
          <h3><TrendingUp size={15} style={{ verticalAlign: '-2px', marginRight: 6 }} /> Needs reordering</h3>
          {lowStock.map((p) => (
            <div className="record" key={p.id}>
              <div className="record__main">
                <strong>{p.name}</strong>
                <span>{p.sku} &middot; reorder at {p.reorder_level}</span>
              </div>
              <div className="record__figures">
                <span className={p.stock_qty <= 0 ? 'is-bad' : ''}>{p.stock_qty} on shelf</span>
                <span className="muted">{p.store_qty} in store</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}