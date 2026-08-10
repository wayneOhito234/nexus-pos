import { useEffect, useState } from 'react';
import { X, Crown } from 'lucide-react';
import {
  fetchCashiers,
  updateCashierRole,
  deleteCashier,
  fetchShiftHistory,
  fetchSalesHistory,
  fetchDrawerHistory,
  clockOutAll,
} from '../api/managerClient.js';

const formatKes = (value) =>
  `KES ${Number(value).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '\u2014';

export function AdminPanel({ onClose, currentCashierId }) {
  const [tab, setTab] = useState('roles');
  const [cashiers, setCashiers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [sales, setSales] = useState([]);
  const [drawerEvents, setDrawerEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [c, s, sa, de] = await Promise.all([
        fetchCashiers(),
        fetchShiftHistory(),
        fetchSalesHistory(),
        fetchDrawerHistory(),
      ]);
      setCashiers(c);
      setShifts(s);
      setSales(sa);
      setDrawerEvents(de);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(cashierId, newRole) {
    try {
      await updateCashierRole(cashierId, newRole);
      setMessage('Role updated.');
      const c = await fetchCashiers();
      setCashiers(c);
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleClockOutAll() {
    const confirmed = window.confirm('Clock out every cashier currently on duty? Use this if a session got stuck.');
    if (!confirmed) return;
    try {
      const result = await clockOutAll();
      setMessage(`Cleared ${result.clockedOut} active shift(s).`);
      await loadAll();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function handleDelete(cashierId, name) {
    const confirmed = window.confirm(`Remove ${name}'s account? This cannot be undone.`);
    if (!confirmed) return;
    try {
      await deleteCashier(cashierId);
      setMessage(`${name} removed.`);
      const c = await fetchCashiers();
      setCashiers(c);
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <div className="manager-panel-overlay">
      <div className="manager-panel admin-panel">
        <div className="manager-panel__header">
          <h2>
            <Crown size={20} style={{ marginRight: 8, verticalAlign: '-3px' }} />
            Admin Dashboard
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="admin-clockout-all" onClick={handleClockOutAll}>
              Clock out everyone
            </button>
            <button className="manager-panel__exit" onClick={onClose}>
              <X size={16} />
              Close
            </button>
          </div>
        </div>

        <div className="manager-panel__tabs">
          <button
            className={tab === 'roles' ? 'manager-tab manager-tab--active' : 'manager-tab'}
            onClick={() => setTab('roles')}
          >
            Roles
          </button>
          <button
            className={tab === 'shifts' ? 'manager-tab manager-tab--active' : 'manager-tab'}
            onClick={() => setTab('shifts')}
          >
            Shift History
          </button>
          <button
            className={tab === 'sales' ? 'manager-tab manager-tab--active' : 'manager-tab'}
            onClick={() => setTab('sales')}
          >
            Sales History
          </button>
          <button
            className={tab === 'drawer' ? 'manager-tab manager-tab--active' : 'manager-tab'}
            onClick={() => setTab('drawer')}
          >
            Drawer Log
          </button>
        </div>

        {message && <p className="manager-panel__message">{message}</p>}
        {loading && <p className="manager-panel__message">Loading...</p>}

        {!loading && tab === 'roles' && (
          <div className="manager-panel__body">
            {cashiers.map((c) => (
              <div key={c.id} className="admin-role-row">
                <span className="manager-cashier-row__name">{c.name}</span>
                {c.role === 'admin' ? (
                  <span className="admin-role-badge">Admin</span>
                ) : (
                  <select
                    value={c.role}
                    onChange={(e) => handleRoleChange(c.id, e.target.value)}
                    className="admin-role-select"
                  >
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                  </select>
                )}
                <button
                  className="manager-cashier-row__delete"
                  onClick={() => handleDelete(c.id, c.name)}
                  disabled={!!c.shift_id || c.id === currentCashierId || c.role === 'admin'}
                  title={
                    c.role === 'admin'
                      ? 'Admin accounts cannot be removed here'
                      : c.id === currentCashierId
                      ? "You can't remove your own account"
                      : c.shift_id
                      ? 'Clock out first to remove this account'
                      : 'Remove account'
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === 'shifts' && (
          <div className="manager-panel__body">
            {shifts.length === 0 && <p className="analytics-section__empty">No shifts recorded yet.</p>}
            {shifts.map((s) => (
              <div key={s.id} className="admin-history-row">
                <span className="admin-history-row__name">{s.name}</span>
                <span className="admin-history-row__terminal">{s.terminal_id}</span>
                <span className="admin-history-row__time">{formatDateTime(s.clock_in)}</span>
                <span className="admin-history-row__arrow">&rarr;</span>
                <span className="admin-history-row__time">
                  {s.clock_out ? formatDateTime(s.clock_out) : 'Still on duty'}
                </span>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === 'sales' && (
          <div className="manager-panel__body">
            {sales.length === 0 && <p className="analytics-section__empty">No sales recorded yet.</p>}
            {sales.map((s) => (
              <div key={s.id} className="admin-history-row">
                <span className="admin-history-row__name">Sale #{s.id}</span>
                <span className="admin-history-row__terminal">{s.terminal_id}</span>
                <span className="admin-history-row__method">{s.payment_method}</span>
                <span className="admin-history-row__time">{formatDateTime(s.created_at)}</span>
                <span className="admin-history-row__total">{formatKes(s.total)}</span>
              </div>
            ))}
          </div>
        )}

        {!loading && tab === 'drawer' && (
          <div className="manager-panel__body">
            {drawerEvents.length === 0 && <p className="analytics-section__empty">No drawer events recorded yet.</p>}
            {drawerEvents.map((d) => (
              <div key={d.id} className="admin-history-row">
                <span className="admin-history-row__name">{d.cashier_name || 'Unknown'}</span>
                <span className="admin-history-row__terminal">{d.terminal_id}</span>
                <span className="admin-history-row__method">{d.reason}</span>
                <span className="admin-history-row__time">{formatDateTime(d.created_at)}</span>
              </div>
            ))}
          </div>
        )}

        <button className="manager-panel__close" onClick={onClose}>
          Close Panel
        </button>
      </div>
    </div>
  );
}