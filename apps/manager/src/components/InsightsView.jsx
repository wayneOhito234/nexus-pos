import { useEffect, useState } from 'react';
import { Clock, PackageX, Warehouse, TrendingDown } from 'lucide-react';
import { fetchHourly, fetchSlowMovers, fetchStockValue, fetchShrinkage } from '../api/client.js';

const kes = (v) => `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;
const hourLabel = (h) => `${String(h).padStart(2, '0')}:00`;
const when = (iso) => new Date(iso).toLocaleDateString('en-KE', { dateStyle: 'medium' });

const TABS = [
  { id: 'hourly', label: 'By hour', icon: Clock },
  { id: 'slow', label: 'Slow movers', icon: PackageX },
  { id: 'value', label: 'Stock value', icon: Warehouse },
  { id: 'shrink', label: 'Shrinkage', icon: TrendingDown },
];

export function InsightsView({ onNotify }) {
  const [tab, setTab] = useState('hourly');

  return (
    <div className="view">
      <header className="view__head">
        <h2>Insights</h2>
        <div className="tabs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`tab ${tab === id ? 'is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'hourly' && <Hourly onNotify={onNotify} />}
      {tab === 'slow' && <SlowMovers onNotify={onNotify} />}
      {tab === 'value' && <StockValue onNotify={onNotify} />}
      {tab === 'shrink' && <Shrinkage onNotify={onNotify} />}
    </div>
  );
}

function Hourly({ onNotify }) {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetchHourly(days).then(setData).catch((e) => onNotify(e.message, 'error'));
  }, [days]);

  if (!data) return <p className="panel__note">Loading...</p>;

  // Trading hours only. A 24-row table where 18 rows are zero hides the
  // shape of the day.
  const trading = data.hours.filter((h) => h.revenue > 0);
  const peak = Math.max(...trading.map((h) => h.revenue), 1);

  return (
    <div className="panel panel--wide">
      <div className="panel__head-row">
        <h3>Takings by hour</h3>
        <div className="segmented">
          {[7, 30].map((d) => (
            <button key={d} className={days === d ? 'is-active' : ''} onClick={() => setDays(d)}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      <p className="panel__note">
        {data.busiest_hour !== null
          ? `Busiest hour is ${hourLabel(data.busiest_hour)}. Averages are per day across the period.`
          : 'No sales in this period.'}
      </p>

      <div className="hourbars">
        {trading.map((h) => (
          <div className="hourbar" key={h.hour}>
            <span className="hourbar__label">{hourLabel(h.hour)}</span>
            <div className="hourbar__track">
              <div className="hourbar__fill" style={{ width: `${(h.revenue / peak) * 100}%` }} />
            </div>
            <span className="hourbar__value">{kes(h.average_per_day)}/day</span>
            <span className="hourbar__count">{h.sale_count} sales</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SlowMovers({ onNotify }) {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(60);

  useEffect(() => {
    fetchSlowMovers(days).then(setData).catch((e) => onNotify(e.message, 'error'));
  }, [days]);

  if (!data) return <p className="panel__note">Loading...</p>;

  return (
    <div className="panel panel--wide">
      <div className="panel__head-row">
        <h3>Not selling</h3>
        <div className="segmented">
          {[30, 60, 90].map((d) => (
            <button key={d} className={days === d ? 'is-active' : ''} onClick={() => setDays(d)}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      <p className="panel__note">
        {data.products.length} product{data.products.length === 1 ? '' : 's'} in stock with no
        sale in {days} days, holding {kes(data.total_tied_up)} at cost.
      </p>

      {data.products.map((p) => (
        <div className="record" key={p.id}>
          <div className="record__main">
            <strong>{p.name}</strong>
            <span>
              {p.sku} &middot; {p.category} &middot;{' '}
              {p.never_sold ? 'never sold' : `last sold ${when(p.last_sold)}`}
            </span>
          </div>
          <div className="record__figures">
            <span>{p.total_units} units</span>
            <span className="muted">{kes(p.tied_up_value)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StockValue({ onNotify }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchStockValue().then(setData).catch((e) => onNotify(e.message, 'error'));
  }, []);

  if (!data) return <p className="panel__note">Loading...</p>;

  return (
    <>
      <div className="kpis kpis--four">
        <div className="kpi">
          <span>Stock at cost</span>
          <strong>{kes(data.cost_value)}</strong>
          <em>{data.total_units} units</em>
        </div>
        <div className="kpi">
          <span>At retail</span>
          <strong>{kes(data.retail_value)}</strong>
        </div>
        <div className="kpi">
          <span>Potential profit</span>
          <strong>{kes(data.potential_profit)}</strong>
          <em>if it all sells</em>
        </div>
        <div className="kpi">
          <span>Products</span>
          <strong>{data.active_products}</strong>
        </div>
      </div>

      {data.products_missing_cost > 0 && (
        <div className="alerts">
          <div className="alert alert--warn">
            {data.products_missing_cost} product
            {data.products_missing_cost === 1 ? ' has' : 's have'} no cost price, so these figures
            are an undercount. Add costs when receiving stock.
          </div>
        </div>
      )}

      <div className="split">
        <div className="panel">
          <h3>Where it sits</h3>
          <div className="record">
            <div className="record__main"><strong>On the shelf</strong></div>
            <div className="record__figures"><span>{kes(data.shelf_value)}</span></div>
          </div>
          <div className="record">
            <div className="record__main"><strong>In the store</strong></div>
            <div className="record__figures"><span>{kes(data.store_value)}</span></div>
          </div>
        </div>

        <div className="panel">
          <h3>By category</h3>
          {data.byCategory.map((c) => (
            <div className="record" key={c.category}>
              <div className="record__main">
                <strong>{c.category}</strong>
                <span>{c.units} units</span>
              </div>
              <div className="record__figures"><span>{kes(c.cost_value)}</span></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Shrinkage({ onNotify }) {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchShrinkage(days).then(setData).catch((e) => onNotify(e.message, 'error'));
  }, [days]);

  if (!data) return <p className="panel__note">Loading...</p>;

  return (
    <>
      <div className="panel__head-row" style={{ marginBottom: 14 }}>
        <div className="kpis" style={{ margin: 0, flex: 1 }}>
          <div className="kpi">
            <span>Written off</span>
            <strong className={data.total_value_lost > 0 ? 'is-bad' : ''}>
              {kes(data.total_value_lost)}
            </strong>
            <em>{data.total_units_lost} units over {days} days</em>
          </div>
        </div>
        <div className="segmented">
          {[7, 30, 90].map((d) => (
            <button key={d} className={days === d ? 'is-active' : ''} onClick={() => setDays(d)}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      <div className="split">
        <div className="panel">
          <h3>By reason</h3>
          {data.byReason.length === 0 && <p className="panel__note">Nothing written off.</p>}
          {data.byReason.map((r) => (
            <div className="record" key={r.reason}>
              <div className="record__main">
                <strong>{r.reason}</strong>
                <span>{r.event_count} times &middot; {r.units_lost} units</span>
              </div>
              <div className="record__figures"><span>{kes(r.value_lost)}</span></div>
            </div>
          ))}
        </div>

        <div className="panel">
          <h3>Worst affected</h3>
          {data.byProduct.map((p) => (
            <div className="record" key={p.id}>
              <div className="record__main">
                <strong>{p.name}</strong>
                <span>{p.sku} &middot; {p.units_lost} units</span>
              </div>
              <div className="record__figures"><span>{kes(p.value_lost)}</span></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}