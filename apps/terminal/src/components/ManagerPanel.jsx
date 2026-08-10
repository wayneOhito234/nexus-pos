import { useEffect, useState } from 'react';
import { fetchCashiers, clockIn, clockOut, adjustProduct, registerCashier } from '../api/managerClient.js';
import { getTerminalId } from '../terminalId.js';

const MANAGER_PIN = '1234';

export function ManagerPinGate({ onUnlock, onCancel }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (pin === MANAGER_PIN) {
      onUnlock();
    } else {
      setError('Incorrect PIN');
      setPin('');
    }
  }

  return (
    <div className="manager-pin-overlay">
      <form className="manager-pin-box" onSubmit={handleSubmit}>
        <h3>Manager PIN</h3>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Enter PIN"
        />
        {error && <p className="manager-pin-error">{error}</p>}
        <div className="manager-pin-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit">Unlock</button>
        </div>
      </form>
    </div>
  );
}

function CreateCashierForm({ onCreated }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState('cashier');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim() || !password) {
      setError('First name, last name and password are required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 4) {
      setError('Password must be at least 4 characters.');
      return;
    }

    setSubmitting(true);
    try {
      await registerCashier({ first_name: firstName.trim(), last_name: lastName.trim(), password, role });
      setFirstName('');
      setLastName('');
      setPassword('');
      setConfirmPassword('');
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="create-cashier-form" onSubmit={handleSubmit}>
      <div className="create-cashier-form__row">
        <input
          type="text"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
        />
      </div>
      <div className="create-cashier-form__row">
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>
      <select value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="cashier">Cashier</option>
        <option value="manager">Manager</option>
      </select>
      {error && <p className="manager-panel__message manager-panel__message--error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating...' : 'Create cashier account'}
      </button>
    </form>
  );
}

export function ManagerPanel({ products, onClose, onExitManagerMode }) {
  const [tab, setTab] = useState('stock');
  const [cashiers, setCashiers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadCashiers();
  }, []);

  async function loadCashiers() {
    setLoading(true);
    try {
      const data = await fetchCashiers();
      setCashiers(data);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleClockIn(cashierId) {
    try {
      await clockIn(cashierId, getTerminalId());
      await loadCashiers();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleClockOut(cashierId) {
    try {
      await clockOut(cashierId);
      await loadCashiers();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleStockAdjust(productId, newStock) {
    try {
      await adjustProduct(productId, { stock_qty: Number(newStock) });
      setMessage('Stock updated.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handlePriceAdjust(productId, newPrice) {
    try {
      await adjustProduct(productId, { price: Number(newPrice) });
      setMessage('Price updated.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="manager-panel-overlay">
      <div className="manager-panel">
        <div className="manager-panel__header">
          <h2>Manager Mode</h2>
          <button className="manager-panel__exit" onClick={onExitManagerMode}>
            Exit Manager Mode
          </button>
        </div>

        <div className="manager-panel__tabs">
          <button
            className={tab === 'stock' ? 'manager-tab manager-tab--active' : 'manager-tab'}
            onClick={() => setTab('stock')}
          >
            Stock & Pricing
          </button>
          <button
            className={tab === 'cashiers' ? 'manager-tab manager-tab--active' : 'manager-tab'}
            onClick={() => setTab('cashiers')}
          >
            Cashiers on Duty
          </button>
          <button
            className={tab === 'create' ? 'manager-tab manager-tab--active' : 'manager-tab'}
            onClick={() => setTab('create')}
          >
            Create Cashier
          </button>
        </div>

        {message && <p className="manager-panel__message">{message}</p>}

        {tab === 'stock' && (
          <div className="manager-panel__body">
            {products.map((p) => (
              <div key={p.id} className="manager-stock-row">
                <span className="manager-stock-row__name">{p.name}</span>
                <input
                  type="number"
                  defaultValue={p.stock_qty}
                  className="manager-stock-row__input"
                  onBlur={(e) => handleStockAdjust(p.id, e.target.value)}
                />
                <input
                  type="number"
                  step="0.01"
                  defaultValue={p.price}
                  className="manager-stock-row__input"
                  onBlur={(e) => handlePriceAdjust(p.id, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}

        {tab === 'cashiers' && (
          <div className="manager-panel__body">
            {loading && <p>Loading...</p>}
            {!loading &&
              cashiers.map((c) => (
                <div key={c.id} className="manager-cashier-row">
                  <span className="manager-cashier-row__name">
                    {c.name} <span className="manager-cashier-row__role">({c.role})</span>
                  </span>
                  {c.shift_id ? (
                    <>
                      <span className="manager-cashier-row__status manager-cashier-row__status--on">
                        On duty &middot; {c.terminal_id}
                      </span>
                      <button onClick={() => handleClockOut(c.id)}>Clock out</button>
                    </>
                  ) : (
                    <>
                      <span className="manager-cashier-row__status">Off duty</span>
                      <button onClick={() => handleClockIn(c.id)}>Clock in here</button>
                    </>
                  )}
                </div>
              ))}
          </div>
        )}

        {tab === 'create' && (
          <div className="manager-panel__body">
            <CreateCashierForm
              onCreated={() => {
                setMessage('Cashier account created.');
                loadCashiers();
              }}
            />
          </div>
        )}

        <button className="manager-panel__close" onClick={onClose}>
          Close Panel
        </button>
      </div>
    </div>
  );
}