import { useEffect, useState } from 'react';
import { fetchCashiers, loginCashier } from '../api/managerClient.js';
import { getTerminalId } from '../terminalId.js';

function initials(firstName, lastName) {
  return `${(firstName || '?')[0]}${(lastName || '')[0] || ''}`.toUpperCase();
}

export function Login({ onLoggedIn }) {
  const [cashiers, setCashiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadCashiers();
    const interval = setInterval(loadCashiers, 4000);
    return () => clearInterval(interval);
  }, []);

  async function loadCashiers() {
    setLoading(true);
    setListError('');
    try {
      const data = await fetchCashiers();
      setCashiers(data);
    } catch (err) {
      setListError('Could not reach the server. Is it running?');
    } finally {
      setLoading(false);
    }
  }

  function selectCashier(cashier) {
    if (cashier.shift_id) return;
    setSelected(cashier);
    setPassword('');
    setAuthError('');
  }

  function goBack() {
    setSelected(null);
    setPassword('');
    setAuthError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setAuthError('');

    if (!password) {
      setAuthError('Enter your password.');
      return;
    }

    setSubmitting(true);
    try {
      const cashier = await loginCashier({
        first_name: selected.first_name,
        last_name: selected.last_name,
        password,
        terminal_id: getTerminalId(),
      });
      onLoggedIn(cashier);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-overlay">
      <div className="login-card">
        <div className="login-card__brand">
          <span className="login-card__logo-dot" />
          <h1 className="login-card__title">NEXUS POS</h1>
        </div>
        <p className="login-card__subtitle">Zummart Supermarket &middot; Pangani</p>

        {!selected ? (
          <>
            <p className="login-card__prompt">Who's clocking in?</p>

            {loading && <p className="login-card__status">Loading team...</p>}
            {listError && <p className="login-card__error">{listError}</p>}

            {!loading && !listError && (
              <div className="cashier-grid">
                {cashiers.map((c) => (
                  <button
                    key={c.id}
                    className={`cashier-tile ${c.shift_id ? 'cashier-tile--busy' : ''}`}
                    onClick={() => selectCashier(c)}
                    disabled={!!c.shift_id}
                  >
                    <span className="cashier-tile__avatar">{initials(c.first_name, c.last_name)}</span>
                    <span className="cashier-tile__name">{c.name}</span>
                    <span className="cashier-tile__meta">
                      {c.shift_id ? `On duty \u00b7 ${c.terminal_id}` : c.role}
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button className="login-card__refresh" onClick={loadCashiers} disabled={loading}>
              Refresh
            </button>
          </>
        ) : (
          <form className="password-step" onSubmit={handleSubmit}>
            <button type="button" className="password-step__back" onClick={goBack}>
              &larr; Back
            </button>

            <div className="password-step__identity">
              <span className="cashier-tile__avatar cashier-tile__avatar--lg">
                {initials(selected.first_name, selected.last_name)}
              </span>
              <span className="password-step__name">{selected.name}</span>
            </div>

            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />

            {authError && <p className="login-card__error">{authError}</p>}

            <button type="submit" className="login-card__submit" disabled={submitting}>
              {submitting ? 'Logging in...' : 'Log in'}
            </button>
          </form>
        )}

        <p className="login-card__hint">
          New cashier? Ask your manager to create your account in Manager Mode.
        </p>
      </div>
    </div>
  );
}