import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, AlertTriangle, Archive, RotateCcw, Save, X, Pencil } from 'lucide-react';
import {
  fetchAllProducts,
  fetchNextSku,
  fetchCategories,
  createProduct,
  updateProductDetails,
  setProductActive,
} from '../api/client.js';

const kes = (v) =>
  v === null || v === undefined || v === ''
    ? '\u2014'
    : `KES ${Number(v).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

const EMPTY = {
  sku: '', barcode: '', name: '', category: '',
  price: '', cost_price: '', stock_qty: '', reorder_level: '10',
};

export function ProductsView({ onNotify }) {
  const [products, setProducts]       = useState([]);
  const [categories, setCategories]   = useState([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState('');

  const [search, setSearch]               = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showArchived, setShowArchived]   = useState(false);

  const [mode, setMode]         = useState('idle');
  const [draft, setDraft]       = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving]     = useState(false);

  // Inline confirm state — replaces window.confirm() so Electron
  // never opens a native blocking dialog that freezes focus.
  const [confirmingId, setConfirmingId] = useState(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    setLoadError('');
    try {
      const [list, cats] = await Promise.all([fetchAllProducts(), fetchCategories()]);
      setProducts(list);
      setCategories(cats);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!showArchived && !p.active) return false;
      if (categoryFilter !== 'All' && p.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode || '').toLowerCase().includes(q)
      );
    });
  }, [products, search, categoryFilter, showArchived]);

  const lowStock = useMemo(
    () => products.filter((p) => p.active && p.stock_qty <= p.reorder_level).length,
    [products]
  );

  // FIX: fetch the SKU first, then render the form once with all data.
  // Previously it rendered with EMPTY then called setDraft again when the
  // SKU arrived, causing a double-render that disrupted input focus.
  async function startCreate() {
    setFormError('');
    setEditingId(null);
    let sku = '';
    try {
      const result = await fetchNextSku();
      sku = result.sku ?? '';
    } catch {
      // A blank SKU is recoverable — the manager can type one.
    }
    setDraft({ ...EMPTY, sku });
    setMode('create');
  }

  function startEdit(p) {
    setConfirmingId(null);
    setFormError('');
    setMode('edit');
    setEditingId(p.id);
    setDraft({
      sku:           p.sku          ?? '',
      barcode:       p.barcode      ?? '',
      name:          p.name         ?? '',
      category:      p.category     ?? '',
      price:         p.price        ?? '',
      cost_price:    p.cost_price   ?? '',
      stock_qty:     p.stock_qty    ?? '',
      reorder_level: p.reorder_level ?? '',
    });
  }

  function cancel() {
    setMode('idle');
    setEditingId(null);
    setDraft(EMPTY);
    setFormError('');
  }

  const set = (field, value) => setDraft((d) => ({ ...d, [field]: value }));

  function validate() {
    if (!draft.name.trim())     return 'Give the product a name.';
    if (!draft.sku.trim())      return 'Every product needs a SKU.';
    if (!draft.barcode.trim())  return 'Enter a barcode so this can be scanned at the till.';
    if (!draft.category.trim()) return 'Choose or type a category.';
    if (draft.price === '' || Number(draft.price) < 0)
      return 'Enter a selling price of zero or more.';
    if (draft.cost_price !== '' && Number(draft.cost_price) > Number(draft.price))
      return 'Cost is higher than the selling price. Check both figures.';
    return '';
  }

  async function save(e) {
    e?.preventDefault();
    const problem = validate();
    if (problem) return setFormError(problem);

    setSaving(true);
    setFormError('');

    const payload = {
      sku:           draft.sku.trim(),
      barcode:       draft.barcode.trim(),
      name:          draft.name.trim(),
      category:      draft.category.trim(),
      price:         Number(draft.price),
      cost_price:    draft.cost_price === '' ? null : Number(draft.cost_price),
      reorder_level: draft.reorder_level === '' ? 10 : Number(draft.reorder_level),
    };

    try {
      if (mode === 'create') {
        const created = await createProduct({
          ...payload,
          stock_qty: draft.stock_qty === '' ? 0 : Number(draft.stock_qty),
        });
        setProducts((prev) => [created, ...prev]);
        onNotify?.(`${created.name} added to the catalogue`, 'success');
      } else {
        const updated = await updateProductDetails(editingId, payload);
        setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
        onNotify?.(`${updated.name} updated`, 'success');
      }

      if (!categories.includes(payload.category)) {
        setCategories((prev) => [...prev, payload.category].sort());
      }
      cancel();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // FIX: no window.confirm(). Sets confirmingId so the row shows
  // inline confirm/cancel buttons instead of a blocking native dialog.
  function requestArchive(p, e) {
    e.stopPropagation();
    setConfirmingId(p.id);
  }

  async function confirmArchive(p, e) {
    e.stopPropagation();
    setConfirmingId(null);
    try {
      const updated = await setProductActive(p.id, !p.active);
      setProducts((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
      onNotify?.(p.active ? `${updated.name} archived` : `${updated.name} restored`, 'info');
      if (editingId === p.id) cancel();
    } catch (err) {
      onNotify?.(err.message, 'error');
    }
  }

  const margin =
    draft.price !== '' && draft.cost_price !== '' && Number(draft.price) > 0
      ? ((Number(draft.price) - Number(draft.cost_price)) / Number(draft.price)) * 100
      : null;

  return (
    <div className="view">
      <header className="view__head">
        <h2>Products</h2>
      </header>

      <div className="catalogue">
        {/* ── Left: product list ── */}
        <div className="catalogue__list-pane">
          <div className="catalogue__toolbar">
            <div className="catalogue__search">
              <Search size={14} />
              <input
                placeholder="Search name, SKU or barcode"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button className="catalogue__new" onClick={startCreate}>
              <Plus size={15} />
              New product
            </button>
          </div>

          <div className="catalogue__filters">
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="All">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

            <label className="catalogue__toggle">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
              />
              Show archived
            </label>

            {lowStock > 0 && (
              <span className="catalogue__lowstock-badge">
                <AlertTriangle size={12} />
                {lowStock} low
              </span>
            )}
          </div>

          {loading && <p className="catalogue__status">Loading the catalogue...</p>}
          {loadError && (
            <div className="catalogue__status catalogue__status--error">
              {loadError}
              <button onClick={loadAll}>Try again</button>
            </div>
          )}

          {!loading && !loadError && visible.length === 0 && (
            <div className="catalogue__empty">
              <p>Nothing matches that.</p>
              <button onClick={startCreate}>Add a product</button>
            </div>
          )}

          {!loading && visible.length > 0 && (
            <div className="catalogue__rows">
              <div className="catalogue__row catalogue__row--head">
                <span>Product</span>
                <span>Price</span>
                <span>Shelf</span>
                <span>Store</span>
                <span />
              </div>

              {visible.map((p) => {
                const low        = p.stock_qty <= p.reorder_level;
                const confirming = confirmingId === p.id;

                return (
                  <div
                    key={p.id}
                    className={[
                      'catalogue__row',
                      editingId === p.id ? 'catalogue__row--selected' : '',
                      !p.active           ? 'catalogue__row--archived'  : '',
                    ].join(' ')}
                  >
                    <span className="catalogue__cell-product">
                      <strong>{p.name}</strong>
                      <span className="catalogue__cell-sub">
                        {p.sku} &middot; {p.category}
                        {!p.active && <em> &middot; archived</em>}
                      </span>
                    </span>

                    <span className="catalogue__cell-price">{kes(p.price)}</span>

                    <span className={`catalogue__cell-stock ${low && p.active ? 'is-low' : ''}`}>
                      {p.stock_qty}
                      {low && p.active && <AlertTriangle size={12} />}
                    </span>

                    <span className="catalogue__cell-stock muted">{p.store_qty ?? 0}</span>

                    {/* Row actions */}
                    <span className="catalogue__row-actions">
                      {confirming ? (
                        // Inline confirm — no native dialog, no focus freeze
                        <>
                          <span className="catalogue__confirm-label">
                            {p.active ? 'Archive?' : 'Restore?'}
                          </span>
                          <button
                            className="catalogue__confirm-yes"
                            onClick={(e) => confirmArchive(p, e)}
                          >
                            Yes
                          </button>
                          <button
                            className="catalogue__confirm-no"
                            onClick={(e) => { e.stopPropagation(); setConfirmingId(null); }}
                          >
                            No
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Edit button — explicit, does not rely on clicking the row */}
                          <button
                            className="catalogue__edit-btn"
                            title="Edit product"
                            onClick={(e) => { e.stopPropagation(); startEdit(p); }}
                          >
                            <Pencil size={13} />
                          </button>

                          <button
                            className="catalogue__archive-btn"
                            title={p.active ? 'Archive' : 'Restore'}
                            onClick={(e) => requestArchive(p, e)}
                          >
                            {p.active ? <Archive size={14} /> : <RotateCcw size={14} />}
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right: form pane ── */}
        <div className="catalogue__form-pane">
          {mode === 'idle' ? (
            <div className="catalogue__placeholder">
              <p className="catalogue__placeholder-title">Pick a product to edit</p>
              <p className="catalogue__placeholder-body">
                Click the <Pencil size={12} style={{ verticalAlign: 'middle' }} /> button on any
                row, or add something new.{' '}
                {products.filter((p) => p.active).length} products are live on the tills right now.
              </p>
              <button onClick={startCreate}><Plus size={15} /> New product</button>
            </div>
          ) : (
            <form className="catalogue__form" onSubmit={save}>
              <div className="catalogue__form-head">
                <h3>{mode === 'create' ? 'New product' : draft.name || 'Edit product'}</h3>
                <button type="button" className="catalogue__form-close" onClick={cancel}>
                  <X size={16} />
                </button>
              </div>

              <label className="catalogue__field">
                <span>Product name</span>
                <input
                  value={draft.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Brookside Fresh Milk 500ml"
                  autoFocus
                />
              </label>

              <div className="catalogue__field-row">
                <label className="catalogue__field">
                  <span>SKU</span>
                  <input value={draft.sku} onChange={(e) => set('sku', e.target.value)} />
                </label>
                <label className="catalogue__field">
                  <span>Barcode</span>
                  <input
                    value={draft.barcode}
                    onChange={(e) => set('barcode', e.target.value)}
                    placeholder="Scan or type"
                  />
                </label>
              </div>

              <label className="catalogue__field">
                <span>Category</span>
                <input
                  list="mgr-categories"
                  value={draft.category}
                  onChange={(e) => set('category', e.target.value)}
                  placeholder="Dairy"
                />
                <datalist id="mgr-categories">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </label>

              <div className="catalogue__field-row">
                <label className="catalogue__field">
                  <span>Selling price</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={draft.price}
                    onChange={(e) => set('price', e.target.value)}
                  />
                </label>
                <label className="catalogue__field">
                  <span>Cost price <em>optional</em></span>
                  <input
                    type="number" step="0.01" min="0"
                    value={draft.cost_price}
                    onChange={(e) => set('cost_price', e.target.value)}
                  />
                </label>
              </div>

              {margin !== null && (
                <p className={`catalogue__margin ${margin < 0 ? 'is-negative' : ''}`}>
                  Margin {margin.toFixed(1)}% &middot; KES{' '}
                  {(Number(draft.price) - Number(draft.cost_price)).toFixed(2)} per unit
                </p>
              )}

              <div className="catalogue__field-row">
                {mode === 'create' && (
                  <label className="catalogue__field">
                    <span>Opening shelf stock</span>
                    <input
                      type="number" min="0"
                      value={draft.stock_qty}
                      onChange={(e) => set('stock_qty', e.target.value)}
                      placeholder="0"
                    />
                  </label>
                )}
                <label className="catalogue__field">
                  <span>Reorder level</span>
                  <input
                    type="number" min="0"
                    value={draft.reorder_level}
                    onChange={(e) => set('reorder_level', e.target.value)}
                  />
                </label>
              </div>

              <p className="catalogue__hint">
                A Telegram alert goes out when shelf stock drops to the reorder level.
              </p>

              {formError && <p className="catalogue__form-error">{formError}</p>}

              <div className="catalogue__form-actions">
                <button type="button" onClick={cancel}>Cancel</button>
                <button type="submit" className="catalogue__save" disabled={saving}>
                  <Save size={15} />
                  {saving ? 'Saving...' : mode === 'create' ? 'Add product' : 'Save changes'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
