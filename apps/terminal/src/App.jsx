import { useEffect, useMemo, useState } from 'react';
import { calcTotals, PAYMENT_METHODS, SOCKET_EVENTS } from '@nexus-pos/shared';
import { TopBar } from './components/TopBar.jsx';
import { SearchBar } from './components/SearchBar.jsx';
import { CategoryTabs } from './components/CategoryTabs.jsx';
import { ProductGrid } from './components/ProductGrid.jsx';
import { ProductGridSkeleton } from './components/ProductGridSkeleton.jsx';
import { Cart } from './components/Cart.jsx';
import { Receipt } from './components/Receipt.jsx';
import { ManagerPinGate, ManagerPanel } from './components/ManagerPanel.jsx';
import { DrawerPinGate } from './components/DrawerPinGate.jsx';
import { ChangeConfirm } from './components/ChangeConfirm.jsx';
import { AnalyticsPanel } from './components/AnalyticsPanel.jsx';
import { AdminPanel } from './components/AdminPanel.jsx';
import { Login } from './components/Login.jsx';
import { TerminalSetup } from './components/TerminalSetup.jsx';
import { ToastContainer } from './components/ToastContainer.jsx';
import { useToasts } from './hooks/useToasts.js';
import { fetchProducts, postSale, initiateStkPush, checkPaymentStatus, loadServerOrigin, SERVER_ORIGIN } from './api/client.js';
import { clockOut, fetchAnalyticsSummary, openDrawer } from './api/managerClient.js';
import { connectSocket, getSocket } from './socket.js';
import { loadTerminalId, getTerminalId } from './terminalId.js';

const BRANCH_NAME = 'Zummart Supermarket';

export default function App() {
  const [bootState, setBootState] = useState('checking'); // checking | needs-setup | ready
  const [socketReady, setSocketReady] = useState(false);

  const [cashier, setCashier] = useState(null);

  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [cart, setCart] = useState([]);
  const [checkingOut, setCheckingOut] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [receipt, setReceipt] = useState(null);

  const [managerMode, setManagerMode] = useState(false);
  const [showPinGate, setShowPinGate] = useState(false);
  const [showManagerPanel, setShowManagerPanel] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [todayKpi, setTodayKpi] = useState(null);
  const [showDrawerPin, setShowDrawerPin] = useState(false);
  const [showChangeDrawerPin, setShowChangeDrawerPin] = useState(false);
  const [showChangeConfirm, setShowChangeConfirm] = useState(false);
  const [pendingCashAmount, setPendingCashAmount] = useState(null);

  const { toasts, addToast, removeToast } = useToasts();

  // ---- Boot sequence: check config -> setup screen or continue ----
  useEffect(() => {
    async function boot() {
      const configured = await window.nexusConfig?.isConfigured();
      if (!configured) {
        setBootState('needs-setup');
        return;
      }
      await loadServerOrigin();
      await loadTerminalId();
      connectSocket(SERVER_ORIGIN);
      setSocketReady(true);
      setBootState('ready');
    }
    boot();
  }, []);

  async function handleSetupComplete() {
    await loadServerOrigin();
    await loadTerminalId();
    connectSocket(SERVER_ORIGIN);
    setSocketReady(true);
    setBootState('ready');
  }

  useEffect(() => {
    if (bootState !== 'ready') return;
    let cancelled = false;

    async function loadProducts() {
      try {
        const data = await fetchProducts();
        if (cancelled) return;
        setProducts(data);
        setOnline(true);
        window.nexusCache?.setProducts(data);
      } catch (err) {
        console.warn('Falling back to local cache:', err.message);
        const cached = (await window.nexusCache?.getProducts()) || [];
        if (cancelled) return;
        setProducts(cached);
        setOnline(false);
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    }

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [bootState]);

  useEffect(() => {
    if (!socketReady) return;
    const socket = getSocket();
    if (!socket) return;

    const handleConnect = () => setOnline(true);
    const handleDisconnect = () => setOnline(false);
    const handleStockUpdated = (updatedProducts) => {
      setProducts((prev) => {
        const byId = new Map(prev.map((p) => [p.id, p]));
        for (const updated of updatedProducts) byId.set(updated.id, updated);
        const merged = Array.from(byId.values());
        window.nexusCache?.setProducts(merged);
        return merged;
      });
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on(SOCKET_EVENTS.STOCK_UPDATED, handleStockUpdated);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off(SOCKET_EVENTS.STOCK_UPDATED, handleStockUpdated);
    };
  }, [socketReady]);

  useEffect(() => {
    if (bootState !== 'ready') return;
    let cancelled = false;

    async function loadKpi() {
      try {
        const summary = await fetchAnalyticsSummary();
        if (!cancelled) setTodayKpi(summary);
      } catch (err) {
        // Silent -- KPI strip just stays hidden if this fails
      }
    }

    loadKpi();
    const interval = setInterval(loadKpi, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bootState]);

  const categories = useMemo(
    () => Array.from(new Set(products.map((p) => p.category))).sort(),
    [products]
  );

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((p) => {
      const matchesCategory = category === 'All' || p.category === category;
      const matchesQuery =
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        (p.barcode || '').toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [products, search, category]);

  const { subtotal, vat, total } = useMemo(
    () => calcTotals(cart.map((item) => ({ price: Number(item.product.price), qty: item.qty }))),
    [cart]
  );

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      const currentQty = existing?.qty || 0;
      if (currentQty >= product.stock_qty) return prev;
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
        );
      }
      return [...prev, { product, qty: 1 }];
    });
  }

  function removeCartItem(productId) {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  }

  function incrementCartItem(productId) {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id !== productId) return item;
        if (item.qty >= item.product.stock_qty) return item;
        return { ...item, qty: item.qty + 1 };
      })
    );
  }

  function decrementCartItem(productId) {
    setCart((prev) => {
      const target = prev.find((item) => item.product.id === productId);
      if (target && target.qty <= 1) {
        return prev.filter((item) => item.product.id !== productId);
      }
      return prev.map((item) =>
        item.product.id === productId ? { ...item, qty: item.qty - 1 } : item
      );
    });
  }

  function buildReceipt(sale, paymentMethod, extra = {}) {
    return {
      saleId: sale.id,
      localRef: sale.local_ref,
      terminalId: getTerminalId(),
      cashierName: cashier?.name,
      items: cart.map((item) => ({
        name: item.product.name,
        qty: item.qty,
        price: item.product.price,
        lineTotal: item.product.price * item.qty,
      })),
      subtotal,
      vat,
      total,
      paymentMethod,
      timestamp: new Date(),
      ...extra,
    };
  }

  async function handleCheckoutCash(amountReceived) {
    setCheckingOut(true);
    setPaymentStatus(null);
    try {
      const payload = {
        terminal_id: getTerminalId(),
        payment_method: PAYMENT_METHODS.CASH,
        amount_received: amountReceived,
        items: cart.map((item) => ({ product_id: item.product.id, qty: item.qty })),
      };
      const sale = await postSale(payload);
      setReceipt(buildReceipt(sale, 'Cash', {
        amountReceived: sale.amount_received,
        changeGiven: sale.change_given,
      }));
      setCart([]);
      addToast(`Sale #${sale.id} complete, KES ${Number(sale.total).toFixed(2)}`, 'success');
      fetchAnalyticsSummary().then(setTodayKpi).catch(() => {});
    } catch (err) {
      addToast(`Checkout failed: ${err.message}`, 'error');
    } finally {
      setCheckingOut(false);
    }
  }

  async function handleCheckoutMpesa(phone) {
    setCheckingOut(true);
    setPaymentStatus('Sending payment request...');
    try {
      const { checkoutRequestId } = await initiateStkPush({
        phone,
        amount: total,
        terminal_id: getTerminalId(),
      });

      setPaymentStatus(`Waiting for customer to approve on their phone... (ID: ${checkoutRequestId})`);

      const finalStatus = await pollPaymentStatus(checkoutRequestId);

      if (finalStatus.status !== 'confirmed') {
        setPaymentStatus(`Payment ${finalStatus.status}: ${finalStatus.resultDesc || 'not completed'}`);
        addToast(`Payment ${finalStatus.status}`, 'error');
        setCheckingOut(false);
        return;
      }

      const payload = {
        terminal_id: getTerminalId(),
        payment_method: PAYMENT_METHODS.MPESA,
        mpesa_ref: finalStatus.mpesaRef,
        items: cart.map((item) => ({ product_id: item.product.id, qty: item.qty })),
      };
      const sale = await postSale(payload);
      setReceipt(buildReceipt(sale, 'M-Pesa', { mpesaRef: finalStatus.mpesaRef }));
      setCart([]);
      setPaymentStatus(null);
      addToast(`Sale #${sale.id} complete, KES ${Number(sale.total).toFixed(2)}`, 'success');
      fetchAnalyticsSummary().then(setTodayKpi).catch(() => {});
    } catch (err) {
      setPaymentStatus(`Payment failed: ${err.message}`);
      addToast(`Payment failed: ${err.message}`, 'error');
    } finally {
      setCheckingOut(false);
    }
  }

  async function pollPaymentStatus(checkoutRequestId, attempts = 15, intervalMs = 2000) {
    for (let i = 0; i < attempts; i++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      const result = await checkPaymentStatus(checkoutRequestId);
      if (result.status !== 'pending') return result;
    }
    return { status: 'pending' };
  }

  function handleManagerButtonClick() {
    if (managerMode) {
      setShowManagerPanel(true);
    } else {
      setShowPinGate(true);
    }
  }

  function handlePinUnlock() {
    setManagerMode(true);
    setShowPinGate(false);
    setShowManagerPanel(true);
  }

  function handleExitManagerMode() {
    setManagerMode(false);
    setShowManagerPanel(false);
  }

  async function handleDrawerOpened() {
    try {
      await openDrawer({
        cashier_id: cashier.id,
        terminal_id: getTerminalId(),
        reason: 'No sale',
      });
      addToast('Drawer opened (No Sale) \u2014 logged.', 'info');
    } catch (err) {
      addToast(`Could not open drawer: ${err.message}`, 'error');
    }
    setShowDrawerPin(false);
  }

  function handleRequestChangeFlow(amountReceived) {
    setPendingCashAmount(amountReceived);
    setShowChangeDrawerPin(true);
  }

  async function handleChangeDrawerUnlocked() {
    setShowChangeDrawerPin(false);
    try {
      await openDrawer({
        cashier_id: cashier.id,
        terminal_id: getTerminalId(),
        reason: 'Change given',
      });
    } catch (err) {
      console.warn('drawer log failed:', err.message);
    }
    setShowChangeConfirm(true);
  }

  function handleChangeCancelled() {
    setShowChangeDrawerPin(false);
    setShowChangeConfirm(false);
    setPendingCashAmount(null);
  }

  async function handleChangeAcknowledged() {
    const amount = pendingCashAmount;
    setShowChangeConfirm(false);
    setPendingCashAmount(null);
    await handleCheckoutCash(amount);
  }

  function handleLoggedIn(newCashier) {
    setCashier(newCashier);
    window.nexusSession?.setCashierId(newCashier.id);
  }

  async function handleLogout() {
    if (!cashier) return;
    try {
      await clockOut(cashier.id);
    } catch (err) {
      console.warn('clock-out failed:', err.message);
    }
    window.nexusSession?.clearCashierId();
    setCashier(null);
    setManagerMode(false);
  }

  if (bootState === 'checking') {
    return <div className="app" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }} />;
  }

  if (bootState === 'needs-setup') {
    return <TerminalSetup onConfigured={handleSetupComplete} />;
  }

  if (!cashier) {
    return <Login onLoggedIn={handleLoggedIn} />;
  }

  return (
    <div className="app">
      <TopBar
        branchName={BRANCH_NAME}
        cashierName={cashier.name}
        online={online}
        managerMode={managerMode}
        onManagerClick={handleManagerButtonClick}
        onLogout={handleLogout}
        canAccessManager={cashier.role === 'manager' || cashier.role === 'admin'}
        onAnalyticsClick={() => setShowAnalytics(true)}
        todayKpi={todayKpi}
        canAccessAdmin={cashier.role === 'admin'}
        onAdminClick={() => setShowAdmin(true)}
        onNoSaleClick={() => setShowDrawerPin(true)}
      />
      <div className="app__toolbar">
        <SearchBar value={search} onChange={setSearch} />
        <CategoryTabs categories={categories} selected={category} onSelect={setCategory} />
      </div>
      <div className="app__body">
        {productsLoading ? (
          <ProductGridSkeleton />
        ) : (
          <ProductGrid products={visibleProducts} onSelect={addToCart} />
        )}
        <Cart
          items={cart}
          subtotal={subtotal}
          vat={vat}
          total={total}
          onCheckoutCash={handleCheckoutCash}
          onCheckoutMpesa={handleCheckoutMpesa}
          onRequestChangeFlow={handleRequestChangeFlow}
          checkingOut={checkingOut}
          paymentStatus={paymentStatus}
          managerMode={managerMode}
          onRemoveItem={removeCartItem}
          onIncrement={incrementCartItem}
          onDecrement={decrementCartItem}
        />
      </div>
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
      {receipt && <Receipt receipt={receipt} onClose={() => setReceipt(null)} />}
      {showPinGate && (
        <ManagerPinGate onUnlock={handlePinUnlock} onCancel={() => setShowPinGate(false)} />
      )}
      {showManagerPanel && (
        <ManagerPanel
          products={products}
          onClose={() => setShowManagerPanel(false)}
          onExitManagerMode={handleExitManagerMode}
        />
      )}
      {showAnalytics && <AnalyticsPanel onClose={() => setShowAnalytics(false)} />}
      {showAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} currentCashierId={cashier.id} />
      )}
      {showDrawerPin && (
        <DrawerPinGate onUnlock={handleDrawerOpened} onCancel={() => setShowDrawerPin(false)} />
      )}
      {showChangeDrawerPin && (
        <DrawerPinGate
          title="Enter PIN to open drawer"
          onUnlock={handleChangeDrawerUnlocked}
          onCancel={handleChangeCancelled}
        />
      )}
      {showChangeConfirm && (
        <ChangeConfirm
          amountReceived={pendingCashAmount}
          total={total}
          onAcknowledge={handleChangeAcknowledged}
          onCancel={handleChangeCancelled}
        />
      )}
    </div>
  );
}