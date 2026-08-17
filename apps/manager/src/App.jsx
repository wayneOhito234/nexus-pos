import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar.jsx';
import { Login } from './components/Login.jsx';
import { DashboardView } from './components/DashboardView.jsx';
import { ProductsView } from './components/ProductsView.jsx';
import { InventoryView } from './components/InventoryView.jsx';
import { StaffView } from './components/StaffView.jsx';
import { DrawerPinsView } from './components/DrawerPinsView.jsx';
import { TerminalsView } from './components/TerminalsView.jsx';
import { ReportsView } from './components/ReportsView.jsx';
import { loadServerOrigin, setAuthToken, clearAuthToken, signOut } from './api/client.js';

export default function App() {
  const [ready, setReady] = useState(false);
  const [staff, setStaff] = useState(null);
  const [section, setSection] = useState('products');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadServerOrigin().finally(() => setReady(true));
  }, []);

  function notify(message, kind = 'info') {
    setToast({ message, kind, id: Date.now() });
    setTimeout(() => setToast(null), 4000);
  }

  function handleSignedIn(staffMember) {
    setAuthToken(staffMember.token);
    setStaff(staffMember);
    // An owner opening the app wants the overview. A manager wants the work.
    setSection(staffMember.role === 'admin' ? 'dashboard' : 'products');
  }

  async function handleSignOut() {
    // Tell the server to revoke the session, but don't let a failure there
    // trap someone inside the app -- clearing locally is what matters most.
    try {
      await signOut();
    } catch {
      // Intentionally quiet.
    }
    clearAuthToken();
    setStaff(null);
    setSection('products');
  }

  if (!ready) return <div className="booting" />;
  if (!staff) return <Login onSignedIn={handleSignedIn} />;

  const isAdmin = staff.role === 'admin';

  return (
    <div className="shell">
      <Sidebar
        active={section}
        onSelect={setSection}
        staff={staff}
        onSignOut={handleSignOut}
      />

      <main className="shell__main">
        {section === 'dashboard' && isAdmin && <DashboardView staff={staff} onNotify={notify} />}
        {section === 'products' && <ProductsView onNotify={notify} />}
        {section === 'inventory' && <InventoryView onNotify={notify} />}
        {section === 'staff' && <StaffView staff={staff} onNotify={notify} />}
        {section === 'drawer' && <DrawerPinsView onNotify={notify} />}
        {section === 'terminals' && isAdmin && <TerminalsView onNotify={notify} />}
        {section === 'reports' && <ReportsView onNotify={notify} />}
      </main>

      {toast && <div className={`toast toast--${toast.kind}`}>{toast.message}</div>}
    </div>
  );
}