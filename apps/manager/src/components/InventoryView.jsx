import { useEffect, useMemo, useState } from 'react';
import { Truck, ArrowRightLeft, ClipboardList, Plus, History } from 'lucide-react';
import {
  fetchSuppliers,
  createSupplier,
  fetchDeliveries,
  createDelivery,
  recordPayment,
  transferToShelf,
  fetchMovements,
  fetchAllProducts,
} from '../api/client.js';

const kes = (v) => `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
const when = (iso) => new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

const TABS = [
  { id: 'receive', label: 'Receive goods', icon: Truck },
  { id: 'transfer', label: 'Store to shelf', icon: ArrowRightLeft },
  { id: 'suppliers', label: 'Suppliers', icon: ClipboardList },
  { id: 'movements', label: 'Movements', icon: History },
];

export function InventoryView({ onNotify }) {
  const [tab, setTab] = useState('receive');
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);

  useEffect(() => {
    fetchAllProducts().then(setProducts).catch((e) => onNotify(e.message, 'error'));
    fetchSuppliers().then(setSuppliers).catch(() => {});
  }, []);

  function refreshProducts() {
    fetchAllProducts().then(setProducts).catch(() => {});
  }

  return (
    <div className="view">
      <header className="view__head">
        <h2>Inventory</h2>
        <div className="tabs">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`tab ${tab === id ? 'is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </header>

      {tab === 'receive' && (
        <ReceiveGoods
          products={products}
          suppliers={suppliers}
          onNotify={onNotify}
          onDone={refreshProducts}
        />
      )}
      {tab === 'transfer' && (
        <TransferStock products={products} onNotify={onNotify} onDone={refreshProducts} />
      )}
      {tab === 'suppliers' && (
        <Suppliers suppliers={suppliers} setSuppliers={setSuppliers} onNotify={onNotify} />
      )}
      {tab === 'movements' && <Movements onNotify={onNotify} />}
    </div>
  );
}

// ---------- Receive goods ----------

function ReceiveGoods({ products, suppliers, onNotify, onDone }) {
  const [supplierId, setSupplierId] = useState('');
  const [reference, setReference] = useState('');
  const [amountPaid, setAmountPaid] = useState('');
  const [lines, setLines] = useState([{ product_id: '', qty: '', unit_cost: '' }]);
  const [saving, setSaving] = useState(false);
  const [deliveries, setDeliveries] = useState([]);

  useEffect(() => {
    fetchDeliveries().then(setDeliveries).catch(() => {});
  }, []);

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0),
    [lines]
  );

  function setLine(idx, field, value) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  }

  async function submit(e) {
    e.preventDefault();

    const valid = lines.filter((l) => l.product_id && Number(l.qty) > 0 && l.unit_cost !== '');
    if (!supplierId) return onNotify('Choose a supplier.', 'error');
    if (valid.length === 0) return onNotify('Add at least one item with a quantity and cost.', 'error');

    setSaving(true);
    try {
      await createDelivery({
        supplier_id: Number(supplierId),
        reference: reference.trim() || null,
        amount_paid: amountPaid === '' ? 0 : Number(amountPaid),
        items: valid.map((l) => ({
          product_id: Number(l.product_id),
          qty: Number(l.qty),
          unit_cost: Number(l.unit_cost),
        })),
      });

      onNotify(`Delivery recorded, ${kes(total)} of stock into the store`, 'success');
      setReference('');
      setAmountPaid('');
      setLines([{ product_id: '', qty: '', unit_cost: '' }]);
      fetchDeliveries().then(setDeliveries).catch(() => {});
      onDone();
    } catch (err) {
      onNotify(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const owed = amountPaid === '' ? total : total - Number(amountPaid);

  return (
    <div className="split">
      <form className="panel" onSubmit={submit}>
        <h3>New delivery</h3>
        <p className="panel__note">
          Stock arrives into the store. Move it to the shelf separately before it can be sold.
        </p>

        <div className="row">
          <label className="field">
            <span>Supplier</span>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Choose one</option>
              {suppliers.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Invoice or delivery note</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="INV-2841"
            />
          </label>
        </div>

        <div className="lines">
          <div className="lines__head">
            <span>Product</span>
            <span>Qty</span>
            <span>Unit cost</span>
            <span>Line</span>
          </div>

          {lines.map((line, idx) => (
            <div className="lines__row" key={idx}>
              <select value={line.product_id} onChange={(e) => setLine(idx, 'product_id', e.target.value)}>
                <option value="">Choose a product</option>
                {products.filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={line.qty}
                onChange={(e) => setLine(idx, 'qty', e.target.value)}
              />
              <input
                type="number"
                step="0.01"
                min="0"
                value={line.unit_cost}
                onChange={(e) => setLine(idx, 'unit_cost', e.target.value)}
              />
              <span className="lines__total">
                {kes((Number(line.qty) || 0) * (Number(line.unit_cost) || 0))}
              </span>
            </div>
          ))}

          <button
            type="button"
            className="lines__add"
            onClick={() => setLines((p) => [...p, { product_id: '', qty: '', unit_cost: '' }])}
          >
            <Plus size={14} />
            Add another item
          </button>
        </div>

        <div className="row">
          <label className="field">
            <span>Paid now</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder="0.00"
            />
          </label>

          <div className="summary">
            <div><span>Delivery total</span><strong>{kes(total)}</strong></div>
            <div className={owed > 0 ? 'is-owed' : ''}>
              <span>Balance owed</span><strong>{kes(owed)}</strong>
            </div>
          </div>
        </div>

        <button type="submit" className="primary" disabled={saving}>
          {saving ? 'Recording...' : 'Record delivery'}
        </button>
      </form>

      <div className="panel">
        <h3>Recent deliveries</h3>
        {deliveries.length === 0 && <p className="panel__note">Nothing recorded yet.</p>}
        {deliveries.map((d) => (
          <div className="record" key={d.id}>
            <div className="record__main">
              <strong>{d.supplier_name}</strong>
              <span>
                {d.reference || 'No reference'} &middot; {when(d.received_at)}
                {d.received_by_name && <> &middot; {d.received_by_name}</>}
              </span>
            </div>
            <div className="record__figures">
              <span>{kes(d.total_cost)}</span>
              {Number(d.balance_owed) > 0 && (
                <PaymentButton
                  delivery={d}
                  onNotify={onNotify}
                  onPaid={() => fetchDeliveries().then(setDeliveries).catch(() => {})}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentButton({ delivery, onNotify, onPaid }) {
  async function pay() {
    const input = window.prompt(
      `Total paid so far on this delivery (currently ${kes(delivery.amount_paid)} of ${kes(delivery.total_cost)}):`,
      String(delivery.total_cost)
    );
    if (input === null) return;

    try {
      await recordPayment(delivery.id, Number(input));
      onNotify('Payment recorded', 'success');
      onPaid();
    } catch (err) {
      onNotify(err.message, 'error');
    }
  }

  return (
    <button className="owed-pill" onClick={pay}>
      {kes(delivery.balance_owed)} owed
    </button>
  );
}

// ---------- Transfer ----------

function TransferStock({ products, onNotify, onDone }) {
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [busy, setBusy] = useState(false);

  const selected = products.find((p) => String(p.id) === productId);
  const inStore = products.filter((p) => p.active && p.store_qty > 0);

  async function submit(e) {
    e.preventDefault();
    if (!productId || Number(qty) <= 0) return onNotify('Choose a product and quantity.', 'error');

    setBusy(true);
    try {
      const updated = await transferToShelf({
        product_id: Number(productId),
        qty: Number(qty),
      });
      onNotify(`${qty} x ${updated.name} moved to the shelf`, 'success');
      setQty('');
      onDone();
    } catch (err) {
      onNotify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split">
      <form className="panel" onSubmit={submit}>
        <h3>Move stock to the shelf</h3>
        <p className="panel__note">
          Only what's on the shelf can be sold. This is the step that makes stock live at the tills.
        </p>

        <label className="field">
          <span>Product</span>
          <select value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Choose a product</option>
            {inStore.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} &mdash; {p.store_qty} in store
              </option>
            ))}
          </select>
        </label>

        {selected && (
          <div className="balances">
            <div><span>In store</span><strong>{selected.store_qty}</strong></div>
            <div><span>On shelf</span><strong>{selected.stock_qty}</strong></div>
          </div>
        )}

        <label className="field">
          <span>Quantity to move</span>
          <input
            type="number"
            min="1"
            max={selected?.store_qty ?? undefined}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>

        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Moving...' : 'Move to shelf'}
        </button>
      </form>

      <div className="panel">
        <h3>Waiting in the store</h3>
        {inStore.length === 0 && <p className="panel__note">Nothing in the store right now.</p>}
        {inStore.map((p) => (
          <div className="record" key={p.id}>
            <div className="record__main">
              <strong>{p.name}</strong>
              <span>{p.sku}</span>
            </div>
            <div className="record__figures">
              <span>{p.store_qty} in store</span>
              <span className="muted">{p.stock_qty} on shelf</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Suppliers ----------

function Suppliers({ suppliers, setSuppliers, onNotify }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return onNotify('Give the supplier a name.', 'error');

    try {
      const created = await createSupplier({
        name: name.trim(),
        contact_person: contact.trim() || null,
        phone: phone.trim() || null,
      });
      setSuppliers((prev) => [
        ...prev,
        { ...created, total_ordered: 0, total_paid: 0, delivery_count: 0 },
      ]);
      setName(''); setContact(''); setPhone('');
      onNotify(`${created.name} added`, 'success');
    } catch (err) {
      onNotify(err.message, 'error');
    }
  }

  return (
    <div className="split">
      <form className="panel" onSubmit={submit}>
        <h3>Add a supplier</h3>
        <label className="field">
          <span>Business name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Brookside Dairy" />
        </label>
        <label className="field">
          <span>Contact person</span>
          <input value={contact} onChange={(e) => setContact(e.target.value)} />
        </label>
        <label className="field">
          <span>Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0722 000 000" />
        </label>
        <button type="submit" className="primary">Add supplier</button>
      </form>

      <div className="panel">
        <h3>Suppliers</h3>
        {suppliers.length === 0 && <p className="panel__note">No suppliers yet.</p>}
        {suppliers.map((s) => {
          const owed = Number(s.total_ordered) - Number(s.total_paid);
          return (
            <div className="record" key={s.id}>
              <div className="record__main">
                <strong>{s.name}</strong>
                <span>{s.phone || 'No phone'} &middot; {s.delivery_count} deliveries</span>
              </div>
              <div className="record__figures">
                <span>{kes(s.total_ordered)}</span>
                {owed > 0 && <span className="owed-pill">{kes(owed)} owed</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Movements ----------

function Movements({ onNotify }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMovements()
      .then(setRows)
      .catch((e) => onNotify(e.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="panel panel--wide">
      <h3>Stock movements</h3>
      <p className="panel__note">Every change to stock, and why it happened.</p>

      {loading && <p className="panel__note">Loading...</p>}

      <div className="ledger">
        {rows.map((m) => (
          <div className="ledger__row" key={m.id}>
            <span className={`ledger__delta ${m.qty_change < 0 ? 'is-out' : 'is-in'}`}>
              {m.qty_change > 0 ? '+' : ''}{m.qty_change}
            </span>
            <span className="ledger__product">
              <strong>{m.product_name}</strong>
              <em>{m.reason}</em>
            </span>
            <span className="ledger__where">{m.location}</span>
            <span className="ledger__who">{m.staff_name || '\u2014'}</span>
            <span className="ledger__when">{when(m.created_at)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}