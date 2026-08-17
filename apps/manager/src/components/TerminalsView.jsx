import { useEffect, useState } from 'react';
import { Monitor, MonitorOff, RotateCcw } from 'lucide-react';
import { fetchTerminals, setTerminalActive } from '../api/client.js';

const when = (iso) => new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

export function TerminalsView({ onNotify }) {
  const [terminals, setTerminals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setTerminals(await fetchTerminals());
    } catch (err) {
      onNotify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function disable(t) {
    const reason = window.prompt(
      `Take ${t.terminal_id} out of service?\n\nAnyone signed in there will be clocked out and cannot sell until it's brought back.\n\nReason (optional):`
    );
    if (reason === null) return;

    setBusy(t.terminal_id);
    try {
      await setTerminalActive(t.terminal_id, false, reason);
      onNotify(`${t.terminal_id} taken out of service`, 'info');
      load();
    } catch (err) {
      onNotify(err.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function enable(t) {
    setBusy(t.terminal_id);
    try {
      await setTerminalActive(t.terminal_id, true);
      onNotify(`${t.terminal_id} back in service`, 'success');
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
        <h2>Terminals</h2>
        <p className="panel__note">
          Which tills can trade. Taking one out of service stops anyone signing in there,
          which is what you want for a machine being repaired or a lane that's closed.
        </p>
      </header>

      <div className="panel panel--wide">
        {loading && <p className="panel__note">Loading...</p>}

        {!loading && terminals.length === 0 && (
          <p className="panel__note">
            No tills configured. Check <code>site.config.js</code> on the server.
          </p>
        )}

        {terminals.map((t) => (
          <div className="terminal-row" key={t.terminal_id}>
            <div className="terminal-row__main">
              <div className="terminal-row__head">
                <strong>{t.label || t.terminal_id}</strong>
                <span className={`pin-badge ${t.active ? 'is-set' : 'is-unset'}`}>
                  {t.active ? 'In service' : 'Out of service'}
                </span>
                {t.current_cashier && (
                  <span className="terminal-row__busy">{t.current_cashier} on duty</span>
                )}
              </div>

              <p className="pin-row__meta">
                {t.ip}
                {!t.active && t.disabled_at && (
                  <>
                    {' '}&middot; since {when(t.disabled_at)}
                    {t.disabled_by_name && <> by {t.disabled_by_name}</>}
                    {t.disabled_reason && <> &middot; {t.disabled_reason}</>}
                  </>
                )}
              </p>
            </div>

            {t.active ? (
              <button className="ghost-danger" onClick={() => disable(t)} disabled={busy === t.terminal_id}>
                <MonitorOff size={14} />
                Take out of service
              </button>
            ) : (
              <button className="primary" onClick={() => enable(t)} disabled={busy === t.terminal_id}>
                <RotateCcw size={14} />
                Bring back
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}