import { useEffect, useState } from 'react';
import { UserPlus, LogOut, Trash2, ShieldCheck } from 'lucide-react';
import {
  fetchStaff, registerStaff, updateStaffRole,
  deleteStaff, clockOutStaff, clockOutAll,
} from '../api/client.js';

const when = (iso) => (iso ? new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '\u2014');

export function StaffView({ staff: me, onNotify }) {
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState('cashier');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setPeople(await fetchStaff());
    } catch (err) {
      onNotify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  async function create(e) {
    e.preventDefault();
    setFormError('');

    if (!firstName.trim() || !lastName.trim() || !password) return setFormError('Fill in all fields.');
    if (password !== confirm) return setFormError('The passwords do not match.');
    if (password.length < 6) return setFormError('Use at least 6 characters.');

    setSaving(true);
    try {
      await registerStaff({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        password,
        role,
      });
      onNotify(`${firstName} ${lastName} added as ${role}`, 'success');
      setFirstName(''); setLastName(''); setPassword(''); setConfirm(''); setRole('cashier');
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(person, newRole) {
    try {
      await updateStaffRole(person.id, newRole);
      onNotify(`${person.name} is now a ${newRole}`, 'success');
      load();
    } catch (err) {
      onNotify(err.message, 'error');
    }
  }

  async function forceClockOut(person) {
    try {
      await clockOutStaff(person.id);
      onNotify(`${person.name} clocked out`, 'info');
      load();
    } catch (err) {
      onNotify(err.message, 'error');
    }
  }

  async function endAllShifts() {
    if (!window.confirm('Clock out everyone currently on duty? Use this if a till session got stuck.')) return;
    try {
      const { clockedOut } = await clockOutAll();
      onNotify(`${clockedOut} shift${clockedOut === 1 ? '' : 's'} ended`, 'info');
      load();
    } catch (err) {
      onNotify(err.message, 'error');
    }
  }

  async function remove(person) {
    if (!window.confirm(`Delete ${person.name}'s account? This cannot be undone.`)) return;
    try {
      await deleteStaff(person.id);
      onNotify(`${person.name} removed`, 'info');
      load();
    } catch (err) {
      onNotify(err.message, 'error');
    }
  }

  const onDuty = people.filter((p) => p.shift_id);

  return (
    <div className="view">
      <header className="view__head">
        <h2>Staff</h2>
      </header>

      <div className="split">
        <form className="panel" onSubmit={create}>
          <h3><UserPlus size={16} style={{ verticalAlign: '-3px', marginRight: 6 }} /> Add someone</h3>

          <div className="row">
            <label className="field">
              <span>First name</span>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </label>
            <label className="field">
              <span>Last name</span>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </label>
          </div>

          <div className="row">
            <label className="field">
              <span>Password</span>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="field">
              <span>Confirm</span>
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="cashier">Cashier &mdash; signs in at a till</option>
              <option value="manager">Manager &mdash; signs in here</option>
            </select>
          </label>

          <p className="panel__note">
            Admin can only be granted directly in the database, so nobody can promote
            themselves through this screen.
          </p>

          {formError && <p className="signin__error">{formError}</p>}

          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Creating...' : 'Create account'}
          </button>
        </form>

        <div className="panel">
          <div className="panel__head-row">
            <h3>Everyone</h3>
            {onDuty.length > 0 && (
              <button className="ghost-danger" onClick={endAllShifts}>
                <LogOut size={14} />
                End all {onDuty.length} shift{onDuty.length === 1 ? '' : 's'}
              </button>
            )}
          </div>

          {loading && <p className="panel__note">Loading...</p>}

          {people.map((p) => (
            <div className="record" key={p.id}>
              <div className="record__main">
                <strong>
                  {p.name}
                  {p.role === 'admin' && <ShieldCheck size={13} style={{ marginLeft: 6, verticalAlign: '-2px', color: 'var(--warn)' }} />}
                </strong>
                <span>
                  {p.shift_id
                    ? `On duty at ${p.terminal_id} since ${when(p.clock_in)}`
                    : `${p.role} \u00b7 off duty`}
                </span>
              </div>

              <div className="record__figures">
                {p.role !== 'admin' && (
                  <select
                    className="mini-select"
                    value={p.role}
                    onChange={(e) => changeRole(p, e.target.value)}
                  >
                    <option value="cashier">Cashier</option>
                    <option value="manager">Manager</option>
                  </select>
                )}

                {p.shift_id && (
                  <button className="ghost-danger" onClick={() => forceClockOut(p)}>
                    Clock out
                  </button>
                )}

                {!p.shift_id && p.id !== me.id && p.role !== 'admin' && (
                  <button className="icon-danger" title="Delete account" onClick={() => remove(p)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}