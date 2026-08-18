import { useEffect, useMemo, useState } from 'react';
import { VAT_RATE, SOCKET_EVENTS } from '@nexus-pos/shared';
import { TopBar } from './components/TopBar.jsx';
import { SearchBar } from './components/SearchBar.jsx';
import { CategoryTabs } from './components/CategoryTabs.jsx';
import { ProductGrid } from './components/ProductGrid.jsx';
import { ProductGridSkeleton } from './components/ProductGridSkeleton.jsx';
import { Cart } from './components/Cart.jsx';
import { PaymentScreen } from './components/PaymentScreen.jsx';
import { Receipt } from './components/Receipt.jsx';
import { DrawerPinGate } from './components/DrawerPinGate.jsx';
import { ShiftClose } from './components/ShiftClose.jsx';
import { Login } from './components/Login.jsx';
import { TerminalSetup } from './components/TerminalSetup.jsx';
import { ToastContainer } from './components/ToastContainer.jsx';
import { useToasts } from './hooks/useToasts.js';
import {
  fetchProducts,
  postSale,
  initiateStkPush,
  checkPaymentStatus,
  loadServerOrigin,
  setAuthToken,
  clearAuthToken,
  SERVER_ORIGIN,
} from './api/client.js';
import { connectSocket, getSocket } from './socket.js';
import { loadTerminalId, getTerminalId } from './terminalId.js';

const BRANCH_NAME = 'Zummart Supermarket';
const kes = (v) => `KES ${Number(v || 0).toFixed(2)}`;
const round2 = (n) => Math.round(n * 100) / 100;

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
  const [showPayment, setShowPayment] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const [showNoSalePin, setShowNoSalePin] = useState(false);
  const [showSaleDrawerPin, setShowSaleDrawerPin] = useState(false);
  const [pendingSale, setPendingSale] = useState(null);
  const [showShiftClose, setShowShiftClose] = useState(false);

  const { toasts, addToast, removeToast } = useToasts();

  // ---- Boot: check config, then either show setup or start up ----
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

    // An archived product arrives here like any other update, so filter it
    // out -- otherwise something the manager just pulled stays sellable
    // until the till restarts.
    const handleStockUpdated = (updatedProducts) => {
      setProducts((prev) => {
        const byId = new Map(prev.map((p) => [p.id, p]));
        for (const updated of updatedProducts) byId.set(updated.id, updated);
        const merged = Array.from(byId.values()).filter((p) => p.active !== false);
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

  // Greet the customer once a cashier is on duty and the cart is empty, but
  // not while a receipt is still up. Completing a sale clears the cart, which
  // would otherwise fire welcome() the same instant the display is showing
  // the change and thank-you, wiping it before the customer reads it.
  useEffect(() => {
    if (cashier && cart.length === 0 && !receipt) {
      window.nexusVfd?.welcome().catch(() => {});
    }
  }, [cashier, cart.length, receipt]);

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

  // Shelf prices are VAT-inclusive, so the total is simply the sum of the
  // line prices and the VAT is the portion already inside it. This mirrors
  // the server's calculation exactly and deliberately does NOT use
  // calcTotals -- that adds VAT on top, which would quote the customer 116
  // on a 100/= item while the server records 100 and hands back 16 in
  // change for no reason.
  const { subtotal, vat, total } = useMemo(() => {
    const gross = cart.reduce(
      (sum, item) => sum + Number(item.product.price) * item.qty,
      0
    );
    const t = round2(gross);
    const v = round2(t - t / (1 + VAT_RATE));
    return { subtotal: round2(t - v), vat: v, total: t };
  }, [cart]);

  // ---- Cart ----

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      const currentQty = existing?.qty || 0;
      if (currentQty >= product.stock_qty) return prev;

      const next = existing
        ? prev.map((item) =>
            item.product.id === product.id ? { ...item, qty: item.qty + 1 } : item
          )
        : [...prev, { product, qty: 1 }];

      const runningTotal = next.reduce(
        (sum, i) => sum + Number(i.product.price) * i.qty,
        0
      );
      window.nexusVfd
        ?.itemAdded(product.name, Number(product.price), round2(runningTotal))
        .catch(() => {});

      return next;
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

  function buildReceipt(sale, paymentLabel, extra = {}) {
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
      subtotal: sale.subtotal ?? subtotal,
      vat: sale.vat ?? vat,
      total: sale.total ?? total,
      paymentMethod: paymentLabel,
      timestamp: new Date(),
      ...extra,
    };
  }

  // ============================================================
  // Payment
  //
  // Two stages on purpose. "Complete sale" settles the basket and shows the
  // customer what they owe including VAT; only then does anyone choose how
  // to pay. That matches how a counter actually works -- the customer
  // decides once they know the figure.
  //
  // The drawer opens whenever cash physically moves, and only then:
  //
  //   Cash, any amount     -> opens, the notes go in
  //   M-Pesa, exact        -> stays shut, nothing physical moves
  //   M-Pesa, overpaid     -> opens, change comes out
  //   Split                -> opens, the cash portion goes in
  // ============================================================

  function handleRequestPayment() {
    if (cart.length === 0) return;
    setPaymentStatus(null);
    setShowPayment(true);
    // Put the amount due on the customer display while they decide.
    window.nexusVfd?.checkout(total, 'TOTAL').catch(() => {});
  }

  function handlePaymentCancel() {
    setShowPayment(false);
    setPaymentStatus(null);
    setCheckingOut(false);
  }

  async function handleTakePayment({ cashAmount = 0, mpesaAmount = 0, phone }) {
    setCheckingOut(true);
    setPaymentStatus(null);

    let mpesaRef = null;
    let mpesaPaid = 0;

    try {
      if (mpesaAmount > 0) {
        window.nexusVfd?.checkout(total, 'M-PESA').catch(() => {});
        setPaymentStatus('Sending payment request...');

        // On a split, the push is for the M-Pesa portion only, not the full
        // total -- the rest is coming in cash.
        const { checkoutRequestId } = await initiateStkPush({
          phone,
          amount: mpesaAmount,
          terminal_id: getTerminalId(),
        });

        setPaymentStatus(
          `Waiting for the customer to approve on their phone... (ID: ${checkoutRequestId})`
        );

        const finalStatus = await pollPaymentStatus(checkoutRequestId);

        if (finalStatus.status !== 'confirmed') {
          setPaymentStatus(
            `Payment ${finalStatus.status}: ${finalStatus.resultDesc || 'not completed'}`
          );
          addToast(`Payment ${finalStatus.status}`, 'error');
          setCheckingOut(false);
          // Nothing recorded, no drawer opened, so the cashier can retry or
          // switch method from the same screen.
          return;
        }

        mpesaRef = finalStatus.mpesaRef;
        mpesaPaid = Number(finalStatus.amountPaid ?? mpesaAmount);
      } else {
        window.nexusVfd?.checkout(total, 'CASH').catch(() => {});
      }

      setPaymentStatus(null);

      const tendered = round2(cashAmount + mpesaPaid);
      const change = round2(tendered - total);
      const cashMoves = cashAmount > 0 || change > 0.001;

      if (cashMoves) {
        setCheckingOut(false);
        setShowPayment(false);
        setPendingSale({
          cashAmount,
          mpesaAmount: mpesaPaid,
          mpesaRef,
          change: change > 0.001 ? change : 0,
        });
        setShowSaleDrawerPin(true);
        return;
      }

      await completeSale({ cashAmount, mpesaAmount: mpesaPaid, mpesaRef, change: 0 });
    } catch (err) {
      setPaymentStatus(`Payment failed: ${err.message}`);
      addToast(`Payment failed: ${err.message}`, 'error');
      setCheckingOut(false);
    }
  }

  async function handleSaleDrawerUnlocked() {
    setShowSaleDrawerPin(false);
    const sale = pendingSale;
    setPendingSale(null);
    if (sale) await completeSale(sale);
  }

  function handleSaleDrawerCancelled() {
    setShowSaleDrawerPin(false);

    // Any M-Pesa portion has already gone through by this point, so
    // abandoning here leaves money taken with no sale recorded. Say so
    // plainly rather than letting it pass quietly.
    if (pendingSale?.mpesaAmount > 0) {
      addToast(
        'Payment was received but the sale was not completed. Open the drawer to finish it.',
        'error'
      );
    }

    setPendingSale(null);
  }

  async function completeSale({ cashAmount = 0, mpesaAmount = 0, mpesaRef, change = 0 }) {
    setCheckingOut(true);
    setPaymentStatus(null);

    try {
      const sale = await postSale({
        terminal_id: getTerminalId(),
        cash_amount: cashAmount,
        mpesa_amount: mpesaAmount,
        mpesa_ref: mpesaRef ?? null,
        items: cart.map((item) => ({ product_id: item.product.id, qty: item.qty })),
      });

      const label =
        cashAmount > 0 && mpesaAmount > 0
          ? 'Cash + M-Pesa'
          : mpesaAmount > 0
            ? 'M-Pesa'
            : 'Cash';

      // Prefer the server's figure, falling back to what we worked out at
      // payment time so the receipt and display still show it either way.
      const changeGiven = Number(sale.change_given ?? change ?? 0);

      // Build the receipt BEFORE clearing the cart -- buildReceipt reads the
      // line items off it, and Receipt auto-prints when it mounts.
      setReceipt(
        buildReceipt(sale, label, {
          cashAmount: sale.cash_amount ?? cashAmount,
          mpesaAmount: sale.mpesa_amount ?? mpesaAmount,
          amountReceived: sale.amount_received,
          changeGiven,
          mpesaRef: sale.mpesa_ref ?? mpesaRef,
        })
      );

      window.nexusVfd
        ?.saleComplete(changeGiven, label.toUpperCase())
        .catch(() => {});

      setCart([]);
      setShowPayment(false);
      addToast(`Sale #${sale.id} complete, ${kes(sale.total)}`, 'success');
    } catch (err) {
      addToast(`Checkout failed: ${err.message}`, 'error');
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

  // ---- No sale ----

  function handleNoSaleOpened() {
    addToast('Drawer opened (No Sale) \u2014 logged.', 'info');
    setShowNoSalePin(false);
  }

  // ---- Session ----

  function handleLoggedIn(newCashier) {
    setAuthToken(newCashier.token);
    setCashier(newCashier);
    window.nexusSession?.setCashierId(newCashier.id);
  }

  // Logging out goes through the cash count, so a shift can't end without
  // the drawer being reconciled.
  function handleLogout() {
    if (cart.length > 0) {
      addToast('Finish or clear the current sale first.', 'error');
      return;
    }
    setShowShiftClose(true);
  }

  function handleShiftClosed(result) {
    setShowShiftClose(false);
    clearAuthToken();
    window.nexusSession?.clearCashierId();
    window.nexusVfd?.clear().catch(() => {});
    setCashier(null);

    const variance = Number(result.variance);
    if (Math.abs(variance) > 0.01) {
      console.warn(`Shift closed with a variance of ${variance.toFixed(2)}`);
    }
  }

  // ---- Render ----

  if (bootState === 'checking') {
    return (
      <div
        className="app"
        style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}
      />
    );
  }

  if (bootState === 'needs-setup') {
    return <TerminalSetup onConfigured={handleSetupComplete} />;
  }

  if (!cashier) {
    return <Login onLoggedIn={handleLoggedIn} />;
  }

  const drawerTitle =
    pendingSale?.change > 0
      ? `Change due: ${kes(pendingSale.change)}`
      : 'Open the drawer for this sale';

  const drawerSubtitle = (() => {
    if (!pendingSale) return undefined;
    const { cashAmount, mpesaAmount, change } = pendingSale;
    if (cashAmount > 0 && mpesaAmount > 0) {
      return `Split: ${kes(cashAmount)} cash + ${kes(mpesaAmount)} M-Pesa against ${kes(total)}`;
    }
    if (mpesaAmount > 0) {
      return `Paid ${kes(mpesaAmount)} by M-Pesa against ${kes(total)}`;
    }
    return change > 0
      ? `Received ${kes(cashAmount)} against ${kes(total)}`
      : `Exact payment of ${kes(total)}`;
  })();

  const drawerReason = (() => {
    if (!pendingSale) return undefined;
    if (pendingSale.cashAmount > 0 && pendingSale.mpesaAmount > 0) {
      return 'Split sale, cash portion';
    }
    if (pendingSale.mpesaAmount > 0) {
      return 'Change on M-Pesa overpayment';
    }
    return pendingSale.change > 0 ? 'Cash sale with change' : 'Cash sale, exact';
  })();

  return (
    <div className="app">
      <TopBar
        branchName={BRANCH_NAME}
        cashierName={cashier.name}
        online={online}
        onLogout={handleLogout}
        onNoSaleClick={() => setShowNoSalePin(true)}
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
          checkingOut={checkingOut}
          onRequestPayment={handleRequestPayment}
          onRemoveItem={removeCartItem}
          onIncrement={incrementCartItem}
          onDecrement={decrementCartItem}
        />
      </div>

      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {showPayment && (
        <PaymentScreen
          total={total}
          vat={vat}
          online={online}
          busy={checkingOut}
          status={paymentStatus}
          onTake={handleTakePayment}
          onCancel={handlePaymentCancel}
        />
      )}

      {receipt && <Receipt receipt={receipt} onClose={() => setReceipt(null)} />}

      {showSaleDrawerPin && (
        <DrawerPinGate
          title={drawerTitle}
          subtitle={drawerSubtitle}
          reason={drawerReason}
          onUnlock={handleSaleDrawerUnlocked}
          onCancel={handleSaleDrawerCancelled}
        />
      )}

      {showNoSalePin && (
        <DrawerPinGate
          title="Open the drawer (No Sale)"
          reason="No sale"
          onUnlock={handleNoSaleOpened}
          onCancel={() => setShowNoSalePin(false)}
        />
      )}

      {showShiftClose && (
        <ShiftClose
          cashierName={cashier.name}
          onClosed={handleShiftClosed}
          onCancel={() => setShowShiftClose(false)}
        />
      )}
    </div>
  );
}