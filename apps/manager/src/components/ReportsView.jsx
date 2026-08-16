import { useEffect, useState } from 'react';
import {
  Receipt as ReceiptIcon, TrendingUp, BarChart2, Award, FileText, DollarSign,
} from 'lucide-react';
import {
  fetchBreakdown, fetchSalesHistory, fetchReceipt, fetchRoi, fetchDrawerHistory,
} from '../api/client.js';
import { BalanceSheetView } from './BalanceSheetView.jsx';
import { TopPerformersView } from './TopPerformersView.jsx';
import { InvoicesView }     from './InvoicesView.jsx';

const kes  = (v) => `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
const when = (iso) => new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

const PERIODS = [
  { id: 'day',   label: 'Today'      },
  { id: 'week',  label: 'This week'  },
  { id: 'month', label: 'This month' },
];

export function ReportsView({ onNotify }) {
  const [tab, setTab] = useState('sales');

  const TABS = [
    { id: 'sales',       label: 'Sales',         Icon: TrendingUp  },
    { id: 'receipts',    label: 'Receipts',       Icon: ReceiptIcon },
    { id: 'roi',         label: 'Margins',        Icon: BarChart2   },
    { id: 'drawer',      label: 'Drawer log',     Icon: DollarSign  },
    { id: 'balance',     label: 'Balance sheet',  Icon: BarChart2   },
    { id: 'performers',  label: 'Top products',   Icon: Award       },
    { id: 'invoices',    label: 'Invoices',       Icon: FileText    },
  ];

  return (
    <div className="view">
      <header className="view__head">
        <h2>Reports</h2>
        <div className="tabs">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              className={`tab ${tab === id ? 'is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </header>

      {/* Original tabs */}
      {tab === 'sales'      && <SalesBreakdown  onNotify={onNotify} />}
      {tab === 'receipts'   && <Receipts        onNotify={onNotify} />}
      {tab === 'roi'        && <Margins         onNotify={onNotify} />}
      {tab === 'drawer'     && <DrawerLog       onNotify={onNotify} />}

      {/* ── New tabs ── */}
      {tab === 'balance'    && <BalanceSheetView  onNotify={onNotify} />}
      {tab === 'performers' && <TopPerformersView onNotify={onNotify} />}
      {tab === 'invoices'   && <InvoicesView      onNotify={onNotify} />}
    </div>
  );
}

function SalesBreakdown({ onNotify }) {
  const [period, setPeriod] = useState('day');
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchBreakdown(period).then(setData).catch((e) => onNotify(e.message, 'error'));
  }, [period]);

  if (!data) return <p className="panel__note">Loading...</p>;

  return (
    <>
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

      <div className="kpis">
        <div className="kpi">
          <span>Revenue</span>
          <strong>{kes(data.totals.revenue)}</strong>
        </div>
        <div className="kpi">
          <span>Sales</span>
          <strong>{data.totals.sale_count}</strong>
        </div>
        <div className="kpi">
          <span>Average sale</span>
          <strong>{kes(data.totals.average_sale)}</strong>
        </div>
      </div>

      <div className="split">
        <div className="panel">
          <h3>By till</h3>
          {data.byTerminal.length === 0 && <p className="panel__note">No sales in this period.</p>}
          {data.byTerminal.map((t) => (
            <div className="record" key={t.terminal_id}>
              <div className="record__main">
                <strong>{t.terminal_id}</strong>
                <span>{t.sale_count} sales</span>
              </div>
              <div className="record__figures"><span>{kes(t.revenue)}</span></div>
            </div>
          ))}
        </div>

        <div className="panel">
          <h3>By payment method</h3>
          {data.byMethod.length === 0 && <p className="panel__note">No sales in this period.</p>}
          {data.byMethod.map((m) => (
            <div className="record" key={m.payment_method}>
              <div className="record__main">
                <strong>{m.payment_method === 'cash' ? 'Cash' : 'M-Pesa'}</strong>
                <span>{m.sale_count} sales</span>
              </div>
              <div className="record__figures"><span>{kes(m.revenue)}</span></div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Receipts({ onNotify }) {
  const [sales, setSales] = useState([]);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    fetchSalesHistory().then(setSales).catch((e) => onNotify(e.message, 'error'));
  }, []);

  async function view(saleId) {
    try {
      setOpen(await fetchReceipt(saleId));
    } catch (err) {
      onNotify(err.message, 'error');
    }
  }

  return (
    <div className="split">
      <div className="panel">
        <h3>Recent sales</h3>
        <p className="panel__note">Click any sale to see the full receipt.</p>
        {sales.map((s) => (
          <div className="record record--clickable" key={s.id} onClick={() => view(s.id)}>
            <div className="record__main">
              <strong>Sale #{s.id}</strong>
              <span>{s.terminal_id} &middot; {when(s.created_at)}</span>
            </div>
            <div className="record__figures">
              <span className="muted">{s.payment_method}</span>
              <span>{kes(s.total)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="panel">
        {!open ? (
          <p className="panel__note">Pick a sale to view its receipt.</p>
        ) : (
          <>
            <h3>Sale #{open.id}</h3>
            <p className="panel__note">
              {open.terminal_id} &middot; {when(open.created_at)}
              {open.cashier_name && <> &middot; {open.cashier_name}</>}
            </p>

            <div className="receipt-lines">
              {open.items.map((it, i) => (
                <div className="receipt-lines__row" key={i}>
                  <span>
                    {it.name}
                    <em>{it.qty} x {kes(it.price)}</em>
                  </span>
                  <span>{kes(it.line_total)}</span>
                </div>
              ))}
            </div>

            <div className="receipt-lines__total">
              <span>Total</span>
              <strong>{kes(open.total)}</strong>
            </div>

            <div className="record">
              <div className="record__main">
                <strong>{open.payment_method === 'cash' ? 'Cash' : 'M-Pesa'}</strong>
                {open.mpesa_ref && <span>Ref {open.mpesa_ref}</span>}
              </div>
              <div className="record__figures">
                {open.amount_received && <span>Received {kes(open.amount_received)}</span>}
                {open.change_given && <span className="muted">Change {kes(open.change_given)}</span>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Margins({ onNotify }) {
  const [rows, setRows] = useState([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetchRoi(days).then(setRows).catch((e) => onNotify(e.message, 'error'));
  }, [days]);

  return (
    <div className="panel panel--wide">
      <div className="panel__head-row">
        <h3>Product margins</h3>
        <div className="segmented">
          {[7, 30, 90].map((d) => (
            <button key={d} className={days === d ? 'is-active' : ''} onClick={() => setDays(d)}>
              {d} days
            </button>
          ))}
        </div>
      </div>

      <p className="panel__note">
        Only products with a cost price appear here, since margin can not be worked out without one.
      </p>

      <div className="ledger">
        <div className="ledger__row ledger__row--head">
          <span>Product</span><span>Sold</span><span>Revenue</span>
          <span>Cost</span><span>Profit</span><span>Margin</span>
        </div>
        {rows.map((r) => (
          <div className="ledger__row ledger__row--roi" key={r.id}>
            <span className="ledger__product"><strong>{r.name}</strong><em>{r.sku}</em></span>
            <span>{r.units_sold}</span>
            <span>{kes(r.revenue)}</span>
            <span className="muted">{kes(r.cost_of_goods)}</span>
            <span className={Number(r.gross_profit) < 0 ? 'is-bad' : 'is-good'}>{kes(r.gross_profit)}</span>
            <span>{Number(r.margin_pct).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DrawerLog({ onNotify }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    fetchDrawerHistory().then(setRows).catch((e) => onNotify(e.message, 'error'));
  }, []);

  return (
    <div className="panel panel--wide">
      <h3>Drawer openings</h3>
      <p className="panel__note">Every time a drawer opened outside a completed sale.</p>
      {rows.map((d) => (
        <div className="record" key={d.id}>
          <div className="record__main">
            <strong>{d.cashier_name || 'Unknown'}</strong>
            <span>{d.reason} &middot; {d.terminal_id}</span>
          </div>
          <div className="record__figures"><span className="muted">{when(d.created_at)}</span></div>
        </div>
      ))}
    </div>
  );
}
