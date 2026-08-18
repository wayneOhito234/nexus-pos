import { useState } from 'react';
import { verifyDrawerPin } from '../api/managerClient.js';
import { getTerminalId } from '../terminalId.js';

// The PIN is checked by the server, never here. A hardcoded value in the
// frontend is readable by anyone who opens DevTools.
export function DrawerPinGate({ title = 'Open the drawer', subtitle, reason, onUnlock, onCancel }) {
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
        reason,
      });

      // The PIN passed and the opening is logged, so now actually fire it.
      // A failed kick is reported but doesn't undo the verification -- the
      // event genuinely happened, and the cashier needs to know the drawer
      // didn't move rather than think the PIN was wrong.
      //
      // The share name and pin come from terminal config in the main
      // process, so nothing needs passing here.
      const result = await window.nexusDrawer?.open();

      if (result && !result.ok) {
        setError(`PIN accepted, but the drawer did not open. ${result.error}`);
        setChecking(false);
        return;
      }

      onUnlock();
    } catch (err) {
      setError(err.message);
      setPin('');
      setChecking(false);
    }
  }

  return (
    <div className="manager-pin-overlay">
      <form className="manager-pin-box" onSubmit={handleSubmit}>
        <h3>{title}</h3>
        {subtitle && <p className="manager-pin-sub">{subtitle}</p>}
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
          <button type="submit" disabled={checking}>{checking ? 'Opening...' : 'Unlock'}</button>
        </div>
      </form>
    </div>
  );
}