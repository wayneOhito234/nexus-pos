import { useEffect, useState } from 'react';
import { KeyRound, ShieldOff, RefreshCw } from 'lucide-react';
import { fetchDrawerPins, setDrawerPin, clearDrawerPin, fetchDrawerHistory } from '../api/client.js';

const TILLS = ['till-1', 'till-2'];
const when = (iso) => new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

export function DrawerPinsView({ staff, onNotify }) {
  const [active, setActive] = useState([]);
  const [history, setHistory] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [pins, log] = await Promise.all([fetchDrawerPins(), fetchDrawerHistory()]);
      setActive(pins);
      setHistory(log);
    } catch (err) {
      onNotify(err.message, 'error');
    }
  }

  const isSet = (till) => active.some((p) => p.terminal_id === till);
  const detail = (till) => active.find((p) => p.terminal_id === till);

  async function save(till) {
    const pin = (drafts[till] || '').trim();
    if (!/^\d{4,8}$/.test(pin)) return onNotify('Use 4 to 8 digits.', 'error');

    setBusy(till);
    try {
      await setDrawerPin(till, pin, staff.id);
      onNotify(`Drawer PIN set for ${till}. Tell the cashier on that till.`, 'success');
      setDrafts((d) => ({ ...d, [till]: '' }));
      load();
    } catch (err) {
      onNotify(err.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function clear(till) {
    if (!window.confirm(`Clear the PIN for ${till}? The drawer stays shut until a new one is set.`)) return;

    setBusy(till);
    try {
      await clearDrawerPin(till);
      onNotify(`Drawer locked on ${till}`, 'info');
      load();
    } catch (err) {
      onNotify(err.message, 'error');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="view">
      <header className="view__head">
        <h2>Drawer PINs</h2>
      </header>

      <div className="split">
        <div className="panel">
          <h3><KeyRound size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} /> Today's PINs</h3>
          <p className="panel__note">
            Set a fresh PIN for each till at the start of the day and tell that till's cashier.
            PINs expire overnight on their own, so yesterday's stops working without you doing
            anything. The PIN is never shown again after you set it.
          </p>

          {TILLS.map((till) => {
            const set = isSet(till);
            const info = detail(till);

            return (
              <div className="pin-row" key={till}>
                <div className="pin-row__head">
                  <strong>{till}</strong>
                  <span className={`pin-badge ${set ? 'is-set' : 'is-unset'}`}>
                    {set ? 'PIN active' : 'No PIN, drawer locked'}
                  </span>
                </div>

                {set && info && (
                  <p className="pin-row__meta">
                    Set {when(info.created_at)}
                    {info.set_by_name && <> by {info.set_by_name}</>}
                  </p>
                )}

                <div className="pin-row__controls">
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder={set ? 'Replace with a new PIN' : 'New PIN'}
                    value={drafts[till] || ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [till]: e.target.value }))}
                  />
                  <button className="primary" onClick={() => save(till)} disabled={busy === till}>
                    {set ? <RefreshCw size={14} /> : <KeyRound size={14} />}
                    {set ? 'Replace' : 'Set'}
                  </button>
                  {set && (
                    <button className="ghost-danger" onClick={() => clear(till)} disabled={busy === till}>
                      <ShieldOff size={14} />
                      Clear
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="panel">
          <h3>Drawer openings</h3>
          <p className="panel__note">Every time a drawer opened outside a completed sale.</p>
          {history.length === 0 && <p className="panel__note">Nothing logged yet.</p>}
          {history.map((d) => (
            <div className="record" key={d.id}>
              <div className="record__main">
                <strong>{d.cashier_name || 'Unknown'}</strong>
                <span>{d.reason} &middot; {d.terminal_id}</span>
              </div>
              <div className="record__figures">
                <span className="muted">{when(d.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}