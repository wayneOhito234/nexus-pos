import { useEffect, useState } from 'react';
import { KeyRound, ShieldOff, RefreshCw } from 'lucide-react';
import {
  fetchDrawerPins,
  setDrawerPin,
  clearDrawerPin,
  fetchDrawerHistory,
  fetchSiteInfo,
} from '../api/client.js';

const when = (iso) => new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

export function DrawerPinsView({ onNotify }) {
  const [tills, setTills] = useState([]);
  const [active, setActive] = useState([]);
  const [history, setHistory] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      // The till list comes from the deployment's own config, so a site
      // running three tills doesn't need a code change.
      const [site, pins, log] = await Promise.all([
        fetchSiteInfo(),
        fetchDrawerPins(),
        fetchDrawerHistory(),
      ]);
      setTills(site.tills || []);
      setActive(pins);
      setHistory(log);
    } catch (err) {
      onNotify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  const isSet = (till) => active.some((p) => p.terminal_id === till);
  const detail = (till) => active.find((p) => p.terminal_id === till);

  async function save(till) {
    const pin = (drafts[till] || '').trim();
    if (!/^\d{4,8}$/.test(pin)) {
      return onNotify('Use 4 to 8 digits.', 'error');
    }

    setBusy(till);
    try {
      await setDrawerPin(till, pin);
      onNotify(`PIN set for ${till}. Tell the cashier on that till.`, 'success');
      setDrafts((d) => ({ ...d, [till]: '' }));
      load();
    } catch (err) {
      onNotify(err.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function clear(till) {
    const confirmed = window.confirm(
      `Clear the PIN for ${till}?\n\nThe drawer stays shut until a new one is set, which means that till cannot give change on a cash sale.`
    );
    if (!confirmed) return;

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

  const unset = tills.filter((t) => !isSet(t));

  return (
    <div className="view">
      <header className="view__head">
        <h2>Drawer PINs</h2>
      </header>

      <div className="split">
        <div className="panel">
          <h3>
            <KeyRound size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} />
            Today's PINs
          </h3>

          <p className="panel__note">
            Set a fresh PIN for each till at the start of the day and tell that till's cashier.
            PINs expire overnight on their own, so yesterday's stops working without you doing
            anything. The PIN is never shown again once set.
          </p>

          {unset.length > 0 && !loading && (
            <p className="pin-warning">
              {unset.length === tills.length
                ? 'No PINs set today. Cash sales needing change will be blocked on every till.'
                : `${unset.join(', ')} has no PIN yet and cannot give change.`}
            </p>
          )}

          {loading && <p className="panel__note">Loading...</p>}

          {!loading && tills.length === 0 && (
            <p className="panel__note">
              No tills are configured for this site. Check <code>site.config.js</code> on the server.
            </p>
          )}

          {tills.map((till) => {
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
                    onKeyDown={(e) => { if (e.key === 'Enter') save(till); }}
                    disabled={busy === till}
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
          <p className="panel__note">
            Every time a drawer opened outside a completed sale, and who opened it.
          </p>

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