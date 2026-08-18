import { Minus, Plus, Trash2, ShoppingCart } from 'lucide-react';

const formatKes = (value) =>
  `KES ${Number(value).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

export function Cart({
  items,
  subtotal,
  vat,
  total,
  checkingOut,
  onRequestPayment,
  onRemoveItem,
  onIncrement,
  onDecrement,
}) {
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

      <button
        className="checkout-button"
        disabled={items.length === 0 || checkingOut}
        onClick={onRequestPayment}
      >
        Complete sale &middot; {formatKes(total)}
      </button>
    </aside>
  );
}