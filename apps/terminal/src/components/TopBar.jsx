import { useEffect, useState } from 'react';
import { Wifi, WifiOff, LogOut, Lock } from 'lucide-react';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function TopBar({ branchName, cashierName, online, onLogout, onNoSaleClick }) {
  const now = useClock();

  return (
    <header className="top-bar">
      <div className="top-bar__brand">
        <span className="top-bar__logo">NEXUS POS</span>
        <span className="top-bar__branch">{branchName}</span>
      </div>

      <div className="top-bar__center">
        <div className="top-bar__clock">
          {now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>

      <div className="top-bar__meta">
        <button className="manager-toggle" onClick={onNoSaleClick}>
          <Lock size={14} />
          No Sale
        </button>
        <span className="top-bar__cashier">Cashier: {cashierName}</span>
        <button className="logout-btn" onClick={onLogout}>
          <LogOut size={13} />
          Log out
        </button>
        <span className={`status-pill ${online ? 'status-pill--online' : 'status-pill--offline'}`}>
          {online ? <Wifi size={13} /> : <WifiOff size={13} />}
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
    </header>
  );
}