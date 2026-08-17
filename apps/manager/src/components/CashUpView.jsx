import { useEffect, useState } from 'react';
import { Banknote, TrendingDown, TrendingUp, Check } from 'lucide-react';
import { fetchReconciliation } from '../api/client.js';

const kes = (v) => `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
const when = (iso) => new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

export function CashUpView({ onNotify }) {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);

  useEffect(() => {
    fetchReconciliation(days).then(setData).catch((e) => onNotify(e.message, 'error'));
  }, [days]);

  if (!data) return <div className="view"><p className="panel__note">Loading...</p></div>;

  const { summary, shifts } = data;

  return (
    <div className="view">
      <header className="view__head">
        <h2>Cash up</h2>
        <div className="segmented">
          {[1, 7, 30].map((d) => (
            <button key={d} className={days === d ? 'is-active' : ''} onClick={() => setDays(d)}>
              {d === 1 ? 'Today' : `${d} days`}
            </button>
          ))}
        </div>
      </header>

      <div className="kpis kpis--four">
        <div className="kpi">
          <span>Shifts counted</span>
          <strong>{summary.counted}</strong>
          <em>{summary.balanced} balanced exactly</em>
        </div>
        <div className="kpi">
          <span>Short</span>
          <strong className={summary.short_count > 0 ? 'is-bad' : ''}>
            {kes(Math.abs(summary.total_shortfall))}
          </strong>
          <em>across {summary.short_count} shift{summary.short_count === 1 ? '' : 's'}</em>
        </div>
        <div className="kpi">
          <span>Over</span>
          <strong>{kes(summary.total_surplus)}</strong>
          <em>across {summary.over_count} shift{summary.over_count === 1 ? '' : 's'}</em>
        </div>
        <div className="kpi">
          <span>Net position</span>
          <strong className={summary.net < -0.01 ? 'is-bad' : ''}>{kes(summary.net)}</strong>
        </div>
      </div>

      {summary.short_count > 0 && (
        <div className="alerts">
          <div className="alert alert--warn">
            <TrendingDown size={14} />
            A shortfall usually means change given in error or a miscount, but a repeated
            pattern on one till or one person is worth looking into.
          </div>
        </div>
      )}

      <div className="panel panel--wide">
        <h3>Counted shifts</h3>
        {shifts.length === 0 && (
          <p className="panel__note">Nothing counted in this period.</p>
        )}

        {shifts.map((s) => {
          const v = Number(s.variance);
          const ok = Math.abs(v) <= 0.01;
          return (
            <div className="cashup-row" key={s.id}>
              <div className="cashup-row__who">
                <strong>{s.cashier_name}</strong>
                <span>{s.terminal_id} &middot; {when(s.counted_at)}</span>
                {s.count_notes && <em>{s.count_notes}</em>}
              </div>

              <div className="cashup-row__figures">
                <div><span>Float</span><strong>{kes(s.opening_float)}</strong></div>
                <div><span>Expected</span><strong>{kes(s.expected_cash)}</strong></div>
                <div><span>Counted</span><strong>{kes(s.counted_cash)}</strong></div>
              </div>

              <div className={`cashup-row__variance ${ok ? 'is-ok' : v < 0 ? 'is-short' : 'is-over'}`}>
                {ok ? <Check size={14} /> : v < 0 ? <TrendingDown size={14} /> : <TrendingUp size={14} />}
                {ok ? 'Balanced' : `${v > 0 ? '+' : ''}${kes(v)}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}