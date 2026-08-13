import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, AlertTriangle, Archive, RotateCcw, Save, X } from 'lucide-react';
import {
  fetchAllProducts,
  fetchNextSku,
  fetchCategories,
  createProduct,
  updateProductDetails,
  setProductActive,
} from '../api/client.js';

const formatKes = (value) =>
  value === null || value === undefined || value === ''
    ? '\u2014'
    : `KES ${Number(value).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

const EMPTY_DRAFT = {
  sku: '',
  barcode: '',
  name: '',
  category: '',
  price: '',
  cost_price: '',
  stock_qty: '',
  reorder_level: '10',
};

export function ProductManager({ onNotify }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showArchived, setShowArchived] = useState(false);

  const [mode, setMode] = useState('idle'); // idle | create | edit
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEverything();
  }, []);

  async function loadEverything() {
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
    const query = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!showArchived && !p.active) return false;
      if (categoryFilter !== 'All' && p.category !== categoryFilter) return false;
      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query) ||
        (p.barcode || '').toLowerCase().includes(query)
      );
    });
  }, [products, search, categoryFilter, showArchived]);

  const lowStockCount = useMemo(
    () => products.filter((p) => p.active && p.stock_qty <= p.reorder_level).length,
    [products]
  );

  async function startCreate() {
    setFormError('');
    setEditingId(null);
    setMode('create');
    setDraft(EMPTY_DRAFT);
    try {
      const { sku } = await fetchNextSku();
      setDraft((d) => ({ ...d, sku }));
    } catch {
      // A blank SKU field is recoverable -- the manager can type one.
    }
  }

  function startEdit(product) {
    setFormError('');
    setMode('edit');
    setEditingId(product.id);
    setDraft({
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      name: product.name ?? '',
      category: product.category ?? '',
      price: product.price ?? '',
      cost_price: product.cost_price ?? '',
      stock_qty: product.stock_qty ?? '',
      reorder_level: product.reorder_level ?? '',
    });
  }

  function cancelForm() {
    setMode('idle');
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setFormError('');
  }

  function set(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  function validate() {
    if (!draft.name.trim()) return 'Give the product a name.';
    if (!draft.sku.trim()) return 'Every product needs a SKU.';
    if (!draft.barcode.trim()) return 'Enter a barcode so this can be scanned at the till.';
    if (!draft.category.trim()) return 'Choose or type a category.';
    if (draft.price === '' || Number(draft.price) < 0) return 'Enter a selling price of zero or more.';
    if (draft.cost_price !== '' && Number(draft.cost_price) > Number(draft.price)) {
      return 'Cost is higher than the selling price. Check both figures.';
    }
    return '';
  }

  async function handleSave(e) {
    e?.preventDefault();
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }

    setSaving(true);
    setFormError('');

    const payload = {
      sku: draft.sku.trim(),
      barcode: draft.barcode.trim(),
      name: draft.name.trim(),
      category: draft.category.trim(),
      price: Number(draft.price),
      cost_price: draft.cost_price === '' ? null : Number(draft.cost_price),
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
      cancelForm();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(product) {
    const goingInactive = product.active;
    const message = goingInactive
      ? `Archive ${product.name}? It will disappear from both tills but stay in past sales.`
      : `Bring ${product.name} back to the tills?`;
    if (!window.confirm(message)) return;

    try {
      const updated = await setProductActive(product.id, !product.active);
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
      onNotify?.(goingInactive ? `${updated.name} archived` : `${updated.name} restored`, 'info');
      if (editingId === product.id) cancelForm();
    } catch (err) {
      onNotify?.(err.message, 'error');
    }
  }

  const margin =
    draft.price !== '' && draft.cost_price !== '' && Number(draft.price) > 0
      ? ((Number(draft.price) - Number(draft.cost_price)) / Number(draft.price)) * 100
      : null;

  return (
    <div className="catalogue">
      {/* ---------- Left: the list ---------- */}
      <div className="catalogue__list-pane">
        <div className="catalogue__toolbar">
          <div className="catalogue__search">
            <Search size={14} />
            <input
              type="text"
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
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <label className="catalogue__toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>

          {lowStockCount > 0 && (
            <span className="catalogue__lowstock-badge">
              <AlertTriangle size={12} />
              {lowStockCount} low
            </span>
          )}
        </div>

        {loading && <p className="catalogue__status">Loading the catalogue...</p>}
        {loadError && (
          <div className="catalogue__status catalogue__status--error">
            {loadError}
            <button onClick={loadEverything}>Try again</button>
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
              <span>Stock</span>
              <span />
            </div>

            {visible.map((p) => {
              const low = p.stock_qty <= p.reorder_level;
              return (
                <div
                  key={p.id}
                  className={[
                    'catalogue__row',
                    editingId === p.id ? 'catalogue__row--selected' : '',
                    !p.active ? 'catalogue__row--archived' : '',
                  ].join(' ')}
                  onClick={() => startEdit(p)}
                >
                  <span className="catalogue__cell-product">
                    <strong>{p.name}</strong>
                    <span className="catalogue__cell-sub">
                      {p.sku} &middot; {p.category}
                      {!p.active && <em> &middot; archived</em>}
                    </span>
                  </span>

                  <span className="catalogue__cell-price">{formatKes(p.price)}</span>

                  <span className={`catalogue__cell-stock ${low && p.active ? 'is-low' : ''}`}>
                    {p.stock_qty}
                    {low && p.active && <AlertTriangle size={12} />}
                  </span>

                  <button
                    className="catalogue__archive-btn"
                    title={p.active ? 'Archive' : 'Restore'}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleArchive(p);
                    }}
                  >
                    {p.active ? <Archive size={14} /> : <RotateCcw size={14} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------- Right: the form ---------- */}
      <div className="catalogue__form-pane">
        {mode === 'idle' ? (
          <div className="catalogue__placeholder">
            <p className="catalogue__placeholder-title">Pick a product to edit</p>
            <p className="catalogue__placeholder-body">
              Or add something new. {products.filter((p) => p.active).length} products are live on
              the tills right now.
            </p>
            <button onClick={startCreate}>
              <Plus size={15} />
              New product
            </button>
          </div>
        ) : (
          <form className="catalogue__form" onSubmit={handleSave}>
            <div className="catalogue__form-head">
              <h3>{mode === 'create' ? 'New product' : draft.name || 'Edit product'}</h3>
              <button type="button" className="catalogue__form-close" onClick={cancelForm}>
                <X size={16} />
              </button>
            </div>

            <label className="catalogue__field catalogue__field--wide">
              <span>Product name</span>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="Brookside Fresh Milk 500ml"
                autoFocus
              />
            </label>

            <div className="catalogue__field-row">
              <label className="catalogue__field">
                <span>SKU</span>
                <input type="text" value={draft.sku} onChange={(e) => set('sku', e.target.value)} />
              </label>

              <label className="catalogue__field">
                <span>Barcode</span>
                <input
                  type="text"
                  value={draft.barcode}
                  onChange={(e) => set('barcode', e.target.value)}
                  placeholder="Scan or type"
                />
              </label>
            </div>

            <label className="catalogue__field catalogue__field--wide">
              <span>Category</span>
              <input
                type="text"
                list="catalogue-categories"
                value={draft.category}
                onChange={(e) => set('category', e.target.value)}
                placeholder="Dairy"
              />
              <datalist id="catalogue-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>

            <div className="catalogue__field-row">
              <label className="catalogue__field">
                <span>Selling price</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.price}
                  onChange={(e) => set('price', e.target.value)}
                />
              </label>

              <label className="catalogue__field">
                <span>
                  Cost price <em>optional</em>
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
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
                  <span>Opening stock</span>
                  <input
                    type="number"
                    min="0"
                    value={draft.stock_qty}
                    onChange={(e) => set('stock_qty', e.target.value)}
                    placeholder="0"
                  />
                </label>
              )}

              <label className="catalogue__field">
                <span>Reorder level</span>
                <input
                  type="number"
                  min="0"
                  value={draft.reorder_level}
                  onChange={(e) => set('reorder_level', e.target.value)}
                />
              </label>
            </div>

            <p className="catalogue__hint">
              A Telegram alert goes out when stock drops to the reorder level.
            </p>

            {formError && <p className="catalogue__form-error">{formError}</p>}

            <div className="catalogue__form-actions">
              <button type="button" onClick={cancelForm}>
                Cancel
              </button>
              <button type="submit" className="catalogue__save" disabled={saving}>
                <Save size={15} />
                {saving ? 'Saving...' : mode === 'create' ? 'Add product' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}