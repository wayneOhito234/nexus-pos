const formatKes = (value) =>
  `KES ${Number(value).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

export function ProductGrid({ products, onSelect }) {
  if (products.length === 0) {
    return <div className="product-grid product-grid--empty">No products match.</div>;
  }

  return (
    <div className="product-grid">
      {products.map((product) => {
        const outOfStock = product.stock_qty <= 0;
        return (
          <button
            key={product.id}
            className="product-tile"
            disabled={outOfStock}
            onClick={() => onSelect(product)}
          >
            <span className="product-tile__name">{product.name}</span>
            <span className="product-tile__price">{formatKes(product.price)}</span>
            <span className="product-tile__stock">
              {outOfStock ? 'Out of stock' : `${product.stock_qty} in stock`}
            </span>
          </button>
        );
      })}
    </div>
  );
}
