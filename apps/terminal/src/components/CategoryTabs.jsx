export function CategoryTabs({ categories, selected, onSelect }) {
  return (
    <div className="category-tabs">
      {['All', ...categories].map((category) => (
        <button
          key={category}
          className={`category-tab ${selected === category ? 'category-tab--active' : ''}`}
          onClick={() => onSelect(category)}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
