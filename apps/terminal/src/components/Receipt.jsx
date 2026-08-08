const formatKes = (value) =>
  `KES ${Number(value).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

export function Receipt({ receipt, onClose }) {
  return (
    <div className="receipt-overlay">
      <div className="receipt">
        <h2 className="receipt__title">Exit Mart</h2>
        <p className="receipt__subtitle">Westlands Branch</p>
        <p className="receipt__meta">
          Sale #{receipt.saleId} &middot; {receipt.timestamp.toLocaleString('en-KE')}
        </p>
        <hr />
        <div className="receipt__items">
          {receipt.items.map((item) => (
            <div key={item.name} className="receipt__line">
              <span>
                {item.name} x{item.qty}
              </span>
              <span>{formatKes(item.lineTotal)}</span>
            </div>
          ))}
        </div>
        <hr />
        <div className="receipt__totals">
          <div className="receipt__line">
            <span>Subtotal</span>
            <span>{formatKes(receipt.subtotal)}</span>
          </div>
          <div className="receipt__line">
            <span>VAT (16%)</span>
            <span>{formatKes(receipt.vat)}</span>
          </div>
          <div className="receipt__line receipt__line--total">
            <span>Total</span>
            <span>{formatKes(receipt.total)}</span>
          </div>
        </div>
        <hr />
        <p className="receipt__meta">Paid via {receipt.paymentMethod}</p>
        {receipt.mpesaRef && <p className="receipt__meta">M-Pesa Ref: {receipt.mpesaRef}</p>}
        <p className="receipt__thanks">Thank you for shopping with us</p>
        <button className="receipt__close" onClick={onClose}>
          New Sale
        </button>
      </div>
    </div>
  );
}