export function CategoryTabs({
  departments = [],
  sections = [],
  selectedDepartment = 'All',
  selectedSection = 'All',
  onSelectDepartment,
  onSelectSection,
}) {
  return (
    <div className="category-nav">
      {departments.length > 0 && (
        <div className="category-tabs category-tabs--dept">
          {['All', ...departments].map((dept) => (
            <button
              key={dept}
              className={`category-tab ${selectedDepartment === dept ? 'category-tab--active' : ''}`}
              onClick={() => onSelectDepartment?.(dept)}
            >
              {dept}
            </button>
          ))}
        </div>
      )}

      <div className="category-tabs">
        {['All', ...sections].map((section) => (
          <button
            key={section}
            className={`category-tab ${selectedSection === section ? 'category-tab--active' : ''}`}
            onClick={() => onSelectSection?.(section)}
          >
            {section}
          </button>
        ))}
      </div>
    </div>
  );
}