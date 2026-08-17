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

      // The PIN is verified and the opening logged, so now actually open it.
      // A failed kick is reported but doesn't undo the verification -- the
      // event genuinely happened, and a cashier needs to know the drawer
      // didn't move rather than the PIN being wrong.
      const config = await window.nexusConfig?.read();
      const result = await window.nexusDrawer?.open({
        shareName: config?.drawerShareName,
        pin: config?.drawerPin,
      });

      if (result && !result.ok) {
        setError(`PIN accepted, but the drawer did not open. ${result.error}`);
        setChecking(false);
        return;
      }

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