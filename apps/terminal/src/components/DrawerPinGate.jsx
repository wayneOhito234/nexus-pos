import { useState } from 'react';

const DRAWER_PIN = '5150';

export function DrawerPinGate({ title = 'Open Drawer (No Sale)', onUnlock, onCancel }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (pin === DRAWER_PIN) {
      onUnlock();
    } else {
      setError('Incorrect drawer PIN');
      setPin('');
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
          placeholder="Enter drawer PIN"
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