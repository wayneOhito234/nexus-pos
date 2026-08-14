import { useState } from 'react';
import { verifyDrawerPin } from '../api/managerClient.js';
import { getTerminalId } from '../terminalId.js';

// The PIN is checked by the server, never here. A hardcoded value in the
// frontend is readable by anyone who opens DevTools.
export function DrawerPinGate({ title = 'Open Drawer (No Sale)', reason, cashierId, onUnlock, onCancel }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!pin.trim()) return setError('Enter the PIN.');

    setChecking(true);
    setError('');

    try {
      await verifyDrawerPin({
        terminal_id: getTerminalId(),
        pin: pin.trim(),
        cashier_id: cashierId,
        reason,
      });
      onUnlock();
    } catch (err) {
      setError(err.message);
      setPin('');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="manager-pin-overlay">
      <form className="manager-pin-box" onSubmit={handleSubmit}>
        <h3>{title}</h3>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="Today's drawer PIN"
          disabled={checking}
        />
        {error && <p className="manager-pin-error">{error}</p>}
        <div className="manager-pin-actions">
          <button type="button" onClick={onCancel} disabled={checking}>Cancel</button>
          <button type="submit" disabled={checking}>{checking ? 'Checking...' : 'Unlock'}</button>
        </div>
      </form>
    </div>
  );
}