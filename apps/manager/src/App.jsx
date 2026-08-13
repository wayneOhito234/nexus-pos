import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar.jsx';
import { Login } from './components/Login.jsx';
import { ProductsView } from './components/ProductsView.jsx';
import { InventoryView } from './components/InventoryView.jsx';
import { loadServerOrigin } from './api/client.js';

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

  if (!ready) return <div className="booting" />;
  if (!staff) return <Login onSignedIn={setStaff} />;

  return (
    <div className="shell">
      <Sidebar
        active={section}
        onSelect={setSection}
        staff={staff}
        onSignOut={() => setStaff(null)}
      />

      <main className="shell__main">
        {section === 'products' && <ProductsView onNotify={notify} />}
        {section === 'inventory' && <InventoryView staff={staff} onNotify={notify} />}
        {section === 'staff' && <Placeholder title="Staff" />}
        {section === 'reports' && <Placeholder title="Reports" />}
      </main>

      {toast && <div className={`toast toast--${toast.kind}`}>{toast.message}</div>}
    </div>
  );
}

function Placeholder({ title }) {
  return (
    <div className="placeholder">
      <h2>{title}</h2>
      <p>Not built yet.</p>
    </div>
  );
}