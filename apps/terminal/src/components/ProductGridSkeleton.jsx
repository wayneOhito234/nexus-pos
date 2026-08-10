export function ProductGridSkeleton() {
  return (
    <div className="product-grid">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="product-tile product-tile--skeleton">
          <div className="skeleton-line skeleton-line--title" />
          <div className="skeleton-line skeleton-line--price" />
          <div className="skeleton-line skeleton-line--stock" />
        </div>
      ))}
    </div>
  );
}