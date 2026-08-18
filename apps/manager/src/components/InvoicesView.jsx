// apps/manager/src/components/InvoicesView.jsx
import { useEffect, useState } from 'react';
import { Printer, FileText, ArrowLeft } from 'lucide-react';
import { fetchSalesHistory, fetchReceipt } from '../api/client.js';
import { VAT_RATE } from '@nexus-pos/shared';

const kes = (v) =>
  `KES ${Number(v || 0).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

const when = (iso) =>
  new Date(iso).toLocaleString('en-KE', { dateStyle: 'long', timeStyle: 'short' });

const whenShort = (iso) =>
  new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });

// Zero-pad the invoice number for a professional look
const invoiceNo = (id) => `INV-${String(id).padStart(5, '0')}`;

function PaymentBadge({ method }) {
  return (
    <span
      className="badge"
      style={{
        background: method === 'cash' ? 'rgba(74,222,128,0.14)' : 'rgba(56,189,248,0.12)',
        color: method === 'cash' ? 'var(--good)' : 'var(--accent)',
        border: `1px solid ${method === 'cash' ? 'rgba(74,222,128,0.3)' : 'rgba(56,189,248,0.3)'}`,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: '0.72rem',
        fontWeight: 700,
        textTransform: 'uppercase',
      }}
    >
      {method === 'cash' ? 'Cash' : 'M-Pesa'}
    </span>
  );
}

// ── Invoice detail (printable) ────────────────────────────────────────────────
function InvoiceDetail({ sale, onBack }) {
  function handlePrint() {
    window.print();
  }

  // Prices are VAT-inclusive, so sale.total already contains the 16% VAT.
  // Break it out for the invoice: `vat` is the portion embedded in the total,
  // and `subtotal` is the net (ex-VAT) amount. They reconcile to sale.total.
  const gross = Number(sale.total);
  const vat = Math.round((gross - gross / (1 + VAT_RATE)) * 100) / 100;
  const subtotal = Math.round((gross - vat) * 100) / 100;

  return (
    <div className="inv-detail">
      {/* Toolbar — hidden when printing */}
      <div className="inv-detail__toolbar no-print">
        <button className="ghost" onClick={onBack}>
          <ArrowLeft size={14} /> Back to invoices
        </button>
        <button className="primary small" onClick={handlePrint}>
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>

      {/* Printable invoice */}
      <div className="inv-doc">
        {/* Header */}
        <div className="inv-doc__header">
          <div className="inv-doc__brand">
            <h1>Nexus POS</h1>
            <p>Zummart Supermarket</p>
          </div>
          <div className="inv-doc__meta">
            <h2>{invoiceNo(sale.id)}</h2>
            <p>Date: {when(sale.created_at)}</p>
            <p>Terminal: {sale.terminal_id}</p>
            {sale.cashier_name && <p>Served by: {sale.cashier_name}</p>}
          </div>
        </div>

        <div className="inv-doc__divider" />

        {/* Bill-to section */}
        <div className="inv-doc__bill-to">
          <div>
            <strong>INVOICE</strong>
            <p style={{ margin: '2px 0 0', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
              Payment method: <strong>{sale.payment_method === 'cash' ? 'Cash' : 'M-Pesa'}</strong>
              {sale.mpesa_ref && ` — Ref: ${sale.mpesa_ref}`}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: 999,
                background: 'rgba(74,222,128,0.14)',
                color: 'var(--good)',
                fontWeight: 700,
                fontSize: '0.8rem',
              }}
            >
              PAID
            </span>
          </div>
        </div>

        {/* Line items */}
        <table className="inv-doc__table">
          <thead>
            <tr>
              <th>Description</th>
              <th style={{ textAlign: 'center' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Unit price</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {sale.items.map((it, i) => (
              <tr key={i}>
                <td>{it.name}</td>
                <td style={{ textAlign: 'center' }}>{it.qty}</td>
                <td style={{ textAlign: 'right' }}>{kes(it.price)}</td>
                <td style={{ textAlign: 'right' }}>{kes(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="inv-doc__totals">
          <div className="inv-doc__totals-row">
            <span>Subtotal</span>
            <span>{kes(subtotal)}</span>
          </div>
          <div className="inv-doc__totals-row">
            <span>VAT ({Math.round(VAT_RATE * 100)}%)</span>
            <span>{kes(vat)}</span>
          </div>
          <div className="inv-doc__totals-row inv-doc__totals-row--total">
            <span>Total</span>
            <strong>{kes(sale.total)}</strong>
          </div>
          {sale.amount_received && (
            <div className="inv-doc__totals-row">
              <span>Amount received</span>
              <span>{kes(sale.amount_received)}</span>
            </div>
          )}
          {sale.change_given && Number(sale.change_given) > 0 && (
            <div className="inv-doc__totals-row">
              <span>Change given</span>
              <span>{kes(sale.change_given)}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="inv-doc__footer">
          <p>Thank you for shopping at Zummart Supermarket.</p>
          <p style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 4 }}>
            This is a computer-generated invoice and is valid without a signature.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Invoice list ──────────────────────────────────────────────────────────────
export function InvoicesView({ onNotify }) {
  const [sales, setSales] = useState([]);
  const [open, setOpen] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchSalesHistory()
      .then(setSales)
      .catch((e) => onNotify(e.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  async function openInvoice(saleId) {
    try {
      const receipt = await fetchReceipt(saleId);
      setOpen(receipt);
    } catch (err) {
      onNotify(err.message, 'error');
    }
  }

  if (open) {
    return <InvoiceDetail sale={open} onBack={() => setOpen(null)} />;
  }

  const filtered = sales.filter((s) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      String(s.id).includes(q) ||
      s.terminal_id?.toLowerCase().includes(q) ||
      s.payment_method?.toLowerCase().includes(q) ||
      s.mpesa_ref?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="view__body">
      <div className="inv-list__toolbar no-print">
        <div className="panel__head-row" style={{ marginBottom: 0 }}>
          <input
            className="inv-search"
            placeholder="Search by sale ID, M-Pesa ref, terminal…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      <div className="panel panel--wide">
        <div className="panel__head-row">
          <h3>Invoices</h3>
          <p className="panel__note" style={{ margin: 0 }}>
            Click any invoice to open, print, or save as PDF.
          </p>
        </div>

        {loading && <p className="panel__note">Loading…</p>}

        {!loading && filtered.length === 0 && (
          <p className="panel__note">No invoices found.</p>
        )}

        {filtered.map((s) => (
          <div
            className="record record--clickable inv-row"
            key={s.id}
            onClick={() => openInvoice(s.id)}
          >
            <div className="inv-row__icon">
              <FileText size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <div className="record__main">
              <strong>{invoiceNo(s.id)}</strong>
              <span>{s.terminal_id} · {whenShort(s.created_at)}</span>
            </div>
            <div className="record__figures">
              <PaymentBadge method={s.payment_method} />
              <strong>{kes(s.total)}</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}