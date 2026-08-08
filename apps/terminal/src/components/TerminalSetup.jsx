import { useState } from 'react';

export function TerminalSetup({ onConfigured }) {
  const [terminalId, setTerminalId] = useState('');
  const [serverOrigin, setServerOrigin] = useState('http://192.168.1.10:4000');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    const cleanId = terminalId.trim().toLowerCase().replace(/\s+/g, '-');
    if (!cleanId) {
      setError('Enter a terminal name, e.g. till-1');
      return;
    }
    if (!serverOrigin.trim().startsWith('http')) {
      setError('Server address must start with http:// or https://');
      return;
    }

    setSaving(true);
    try {
      await window.nexusConfig.write({
        terminalId: cleanId,
        serverOrigin: serverOrigin.trim().replace(/\/$/, ''),
      });
      onConfigured();
    } catch (err) {
      setError('Could not save configuration: ' + err.message);
      setSaving(false);
    }
  }

  return (
    <div className="login-overlay">
      <form className="login-card" onSubmit={handleSubmit} style={{ width: 420 }}>
        <div className="login-card__brand">
          <span className="login-card__logo-dot" />
          <h1 className="login-card__title">TERMINAL SETUP</h1>
        </div>
        <p className="login-card__subtitle">
          This is a one-time step. It permanently identifies this computer.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
            Terminal name
          </label>
          <input
            type="text"
            placeholder="till-1"
            value={terminalId}
            onChange={(e) => setTerminalId(e.target.value)}
            style={{
              padding: '12px 14px', borderRadius: 10, border: '1px solid #334155',
              background: '#1e293b', color: '#e2e8f0', fontSize: 15,
            }}
            autoFocus
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          <label style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
            Server address
          </label>
          <input
            type="text"
            placeholder="http://192.168.1.10:4000"
            value={serverOrigin}
            onChange={(e) => setServerOrigin(e.target.value)}
            style={{
              padding: '12px 14px', borderRadius: 10, border: '1px solid #334155',
              background: '#1e293b', color: '#e2e8f0', fontSize: 15,
            }}
          />
        </div>

        {error && <p className="login-card__error" style={{ marginTop: 10 }}>{error}</p>}

        <button type="submit" className="login-card__submit" disabled={saving} style={{ marginTop: 16 }}>
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>

        <p className="login-card__hint" style={{ marginTop: 8 }}>
          Ask your admin for the server address if you don't know it.
        </p>
      </form>
    </div>
  );
}