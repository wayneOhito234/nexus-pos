import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { staffLogin, SERVER_ORIGIN } from '../api/client.js';

export function Login({ onSignedIn }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim() || !password) {
      setError('Fill in all three fields.');
      return;
    }

    setBusy(true);
    try {
      const staff = await staffLogin({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        password,
      });
      onSignedIn(staff);
    } catch (err) {
      setError(err.message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin">
      <form className="signin__card" onSubmit={handleSubmit}>
        <div className="signin__brand">
          <ShieldCheck size={22} />
          <div>
            <h1>Nexus POS</h1>
            <p>Manager terminal</p>
          </div>
        </div>

        <label className="field">
          <span>First name</span>
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
        </label>

        <label className="field">
          <span>Last name</span>
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </label>

        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <p className="signin__error">{error}</p>}

        <button type="submit" className="signin__submit" disabled={busy}>
          {busy ? 'Checking...' : 'Sign in'}
        </button>

        <p className="signin__footnote">
          Cashiers sign in at a till, not here.
          <br />
          <span>{SERVER_ORIGIN}</span>
        </p>
      </form>
    </div>
  );
}