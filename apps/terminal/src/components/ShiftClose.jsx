import { useEffect, useState } from 'react';
import { Banknote, X } from 'lucide-react';
import { fetchShiftSummary, closeShift } from '../api/managerClient.js';

const kes = (v) => `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

export function ShiftClose({ cashierName, onClosed, onCancel }) {
  const [summary, setSummary] = useState(null);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchShiftSummary().then(setSummary).catch((e) => setError(e.message));
  }, []);

  // Deliberately shown only after a figure is entered, so the expected
  // amount doesn't prompt the count.
  const variance =
    counted !== '' && summary ? Number(counted) - summary.expected_cash : null;

  async function submit(e) {
    e.preventDefault();
    if (counted === '') return setError('Enter the amount you counted.');

    setBusy(true);
    setError('');
    try {
      const result = await closeShift({
        counted_cash: Number(counted),
        notes: notes.trim() || null,
      });
      onClosed(result);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="shift-close-overlay">
      <form className="shift-close" onSubmit={submit}>
        <div className="shift-close__head">
          <h2><Banknote size={18} /> Close your shift</h2>
          <button type="button" onClick={onCancel} disabled={busy}><X size={18} /></button>
        </div>

        <p className="shift-close__who">{cashierName}</p>

        {!summary && !error && <p className="shift-close__status">Loading your shift...</p>}
        {error && !summary && <p className="shift-close__error">{error}</p>}

        {summary && (
          <>
            <div className="shift-close__figures">
              <div>
                <span>Sales this shift</span>
                <strong>{summary.sale_count}</strong>
              </div>
              <div>
                <span>Cash taken</span>
                <strong>{kes(summary.cash_sales)}</strong>
              </div>
              <div>
                <span>M-Pesa</span>
                <strong>{kes(summary.mpesa_sales)}</strong>
              </div>
              <div>
                <span>Opening float</span>
                <strong>{kes(summary.opening_float)}</strong>
              </div>
            </div>

            <label className="shift-close__field">
              <span>Count the drawer and enter the total</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={counted}
                onChange={(e) => setCounted(e.target.value)}
                placeholder="0.00"
                autoFocus
                disabled={busy}
              />
            </label>

            {variance !== null && (
              <p className={`shift-close__variance ${
                Math.abs(variance) <= 0.01 ? 'is-ok' : variance < 0 ? 'is-short' : 'is-over'
              }`}>
                {Math.abs(variance) <= 0.01
                  ? 'Balances exactly'
                  : variance < 0
                    ? `${kes(Math.abs(variance))} short`
                    : `${kes(variance)} over`}
              </p>
            )}

            <label className="shift-close__field">
              <span>Notes <em>optional</em></span>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anything the manager should know"
                disabled={busy}
              />
            </label>

            {error && <p className="shift-close__error">{error}</p>}

            <p className="shift-close__note">
              This records your count and logs you out. The manager reviews any difference.
            </p>

            <button type="submit" className="shift-close__submit" disabled={busy}>
              {busy ? 'Closing...' : 'Close shift and log out'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}