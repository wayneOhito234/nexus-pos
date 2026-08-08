import { useState, useEffect } from 'react';
import { Minus, Plus, Trash2, Banknote, Smartphone, ShoppingCart } from 'lucide-react';

const formatKes = (value) =>
  `KES ${Number(value).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

export function Cart({
  items,
  subtotal,
  vat,
  total,
  onCheckoutCash,
  onCheckoutMpesa,
  onRequestChangeFlow,
  checkingOut,
  paymentStatus,
  managerMode,
  onRemoveItem,
  onIncrement,
  onDecrement,
}) {
  const [method, setMethod] = useState('cash');
  const [phone, setPhone] = useState('254');
  const [amountReceived, setAmountReceived] = useState('');

  useEffect(() => {
    if (items.length === 0) {
      setAmountReceived('');
    }
  }, [items.length]);

  const disabled = items.length === 0 || checkingOut;

  const receivedNum = Number(amountReceived) || 0;
  const change = receivedNum - total;
  const cashReady = method === 'cash' ? receivedNum >= total : true;

  function handlePayClick() {
    if (method === 'cash') {
      if (change > 0.001) {
        onRequestChangeFlow(receivedNum);
      } else {
        onCheckoutCash(receivedNum);
      }
    } else {
      onCheckoutMpesa(phone);
    }
  }

  return (
    <aside className="cart">
      <h2 className="cart__title">
        <ShoppingCart size={18} />
        Current Sale
      </h2>
      <div className="cart__items">
        {items.length === 0 && (
          <div className="cart__empty">
            <ShoppingCart size={28} strokeWidth={1.3} />
            <span>Cart is empty</span>
          </div>
        )}
        {items.map((item) => (
          <div key={item.product.id} className="cart__line">
            <div className="cart__line-info">
              <span className="cart__line-name">{item.product.name}</span>
              <span className="cart__line-price">{formatKes(item.product.price)} each</span>
            </div>

            <div className="cart__line-controls">
              <button
                className="cart__qty-btn"
                onClick={() => onDecrement(item.product.id)}
                disabled={checkingOut}
                title="Decrease quantity"
              >
                <Minus size={13} />
              </button>
              <span className="cart__qty-value">{item.qty}</span>
              <button
                className="cart__qty-btn"
                onClick={() => onIncrement(item.product.id)}
                disabled={checkingOut || item.qty >= item.product.stock_qty}
                title="Increase quantity"
              >
                <Plus size={13} />
              </button>
            </div>

            <div className="cart__line-right">
              <span className="cart__line-total">{formatKes(item.product.price * item.qty)}</span>
              <button
                className="cart__remove-btn"
                onClick={() => onRemoveItem(item.product.id)}
                disabled={checkingOut}
                title="Remove item"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="cart__totals">
        <div className="cart__totals-row">
          <span>Subtotal</span>
          <span>{formatKes(subtotal)}</span>
        </div>
        <div className="cart__totals-row">
          <span>VAT (16%)</span>
          <span>{formatKes(vat)}</span>
        </div>
        <div className="cart__totals-row cart__totals-row--total">
          <span>Total</span>
          <span>{formatKes(total)}</span>
        </div>
      </div>

      <div className="cart__payment-methods">
        <button
          className={`payment-method-btn ${method === 'cash' ? 'payment-method-btn--active' : ''}`}
          onClick={() => setMethod('cash')}
          disabled={checkingOut}
        >
          <Banknote size={15} />
          Cash
        </button>
        <button
          className={`payment-method-btn ${method === 'mpesa_stk' ? 'payment-method-btn--active' : ''}`}
          onClick={() => setMethod('mpesa_stk')}
          disabled={checkingOut}
        >
          <Smartphone size={15} />
          M-Pesa STK Push
        </button>
      </div>

      {method === 'cash' && (
        <div className="cash-tender">
          <input
            className="cash-tender__input"
            type="number"
            placeholder="Amount received (KES)"
            value={amountReceived}
            onChange={(e) => setAmountReceived(e.target.value)}
            disabled={checkingOut}
          />
          {amountReceived !== '' && (
            <div className={`cash-tender__change ${change < 0 ? 'cash-tender__change--short' : ''}`}>
              {change < 0
                ? `Short by ${formatKes(Math.abs(change))}`
                : change > 0.001
                ? `Change due: ${formatKes(change)}`
                : 'Exact amount \u2014 no change'}
            </div>
          )}
        </div>
      )}

      {method === 'mpesa_stk' && (
        <input
          className="cart__phone-input"
          type="tel"
          placeholder="2547XXXXXXXX"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={checkingOut}
        />
      )}

      {paymentStatus && <p className="cart__payment-status">{paymentStatus}</p>}

      <button
        className="checkout-button"
        disabled={disabled || (method === 'cash' && !cashReady)}
        onClick={handlePayClick}
      >
        {checkingOut
          ? 'Processing...'
          : method === 'cash'
          ? 'Complete Cash Sale'
          : 'Send STK Push'}
      </button>
    </aside>
  );
}