export function SearchBar({ value, onChange }) {
  return (
    <input
      className="search-bar"
      type="text"
      placeholder="Scan barcode or search product..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoFocus
    />
  );
}
