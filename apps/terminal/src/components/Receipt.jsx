import { useEffect, useRef } from 'react';
import { Printer, X } from 'lucide-react';
import logo from '../assets/zummart-logo.png';

const formatKes = (value) =>
  `KES ${Number(value).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

export function Receipt({ receipt, onClose, autoPrint = true }) {
  const printedRef = useRef(false);

  useEffect(() => {
    // Print once per receipt, not on every re-render.
    if (!autoPrint || printedRef.current) return;
    printedRef.current = true;
    // Small delay so the logo and layout are painted before the print
    // snapshot is taken, otherwise the image can come out blank.
    const timer = setTimeout(() => window.print(), 350);
    return () => clearTimeout(timer);
  }, [autoPrint]);

  return (
    <div className="receipt-overlay">
      <div className="receipt" id="printable-receipt">
        <img src={logo} alt="Zummart Supermarket" className="receipt__logo" />

        <p className="receipt__store">Zummart Supermarket</p>
        <p className="receipt__address">
          Jamarat Apartments, Pangani
          <br />
          Nairobi, Kenya
          <br />
          Tel: +254 796 141800
        </p>

        <hr />

        <p className="receipt__meta">
          Sale #{receipt.saleId}
          {receipt.localRef && <> &middot; {receipt.localRef}</>}
          <br />
          {receipt.timestamp.toLocaleString('en-KE')}
          {receipt.terminalId && <> &middot; {receipt.terminalId}</>}
          {receipt.cashierName && (
            <>
              <br />
              Served by {receipt.cashierName}
            </>
          )}
        </p>

        <hr />

        <div className="receipt__items">
          {receipt.items.map((item, idx) => (
            <div key={`${item.name}-${idx}`} className="receipt__line">
              <span className="receipt__line-name">
                {item.name}
                <br />
                <span className="receipt__line-unit">
                  {item.qty} x {formatKes(item.price)}
                </span>
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
            <span>TOTAL</span>
            <span>{formatKes(receipt.total)}</span>
          </div>
        </div>

        <hr />

        {/*
          Payment breakdown, aligned with the shape App.jsx now builds:
          cashAmount / mpesaAmount / changeGiven / mpesaRef. Each line is
          guarded on > 0 so a pure cash sale shows only cash, a pure M-Pesa
          sale shows only M-Pesa, and a split prints both legs.
        */}
               <div className="receipt__payment">
          <div className="receipt__line">
            <span>Paid via</span>
            <span>{receipt.paymentMethod}</span>
          </div>

          {receipt.cashAmount > 0 && (
            <div className="receipt__line">
              <span>Cash received</span>
              <span>{formatKes(receipt.cashAmount)}</span>
            </div>
          )}

          {receipt.mpesaAmount > 0 && (
            <div className="receipt__line">
              <span>M-Pesa paid</span>
              <span>{formatKes(receipt.mpesaAmount)}</span>
            </div>
          )}

          {/* Only on a split -- on a single-method sale the total paid is
              already the line above it, and repeating it just adds noise. */}
          {receipt.cashAmount > 0 && receipt.mpesaAmount > 0 && (
            <div className="receipt__line">
              <span>Total paid</span>
              <span>{formatKes(receipt.cashAmount + receipt.mpesaAmount)}</span>
            </div>
          )}

          {receipt.changeGiven > 0 && (
            <div className="receipt__line">
              <span>Change</span>
              <span>{formatKes(receipt.changeGiven)}</span>
            </div>
          )}

          {receipt.mpesaRef && (
            <div className="receipt__line">
              <span>M-Pesa Ref</span>
              <span>{receipt.mpesaRef}</span>
            </div>
          )}
        </div>
        <hr />

        <p className="receipt__thanks">
          Thank you for shopping with us
          <br />
          <span className="receipt__tagline">Fresh Everyday</span>
        </p>

        <div className="receipt__actions">
          <button className="receipt__print" onClick={() => window.print()}>
            <Printer size={15} />
            Print again
          </button>
          <button className="receipt__close" onClick={onClose}>
            <X size={15} />
            New Sale
          </button>
        </div>
      </div>
    </div>
  );
}