// Central supermarket product taxonomy and hierarchy helpers.
// This is the single source of truth for departments -> sections, the allowed
// pack-size units, the Excel import columns, product-name composition and the
// hierarchy validation used by BOTH the manager (Excel import + Add Product)
// and the server (authoritative validation). Expand the taxonomy here and every
// consumer picks it up.

// ─── Pack-size units ─────────────────────────────────────────────────────────
export const UNITS = [
  'ml', 'L', 'g', 'kg', 'mg',
  'pack', 'piece', 'pair', 'box', 'carton',
  'bottle', 'can', 'sachet', 'tube', 'roll', 'bag',
];

// ─── Departments -> Sections ─────────────────────────────────────────────────
// Department is the top grouping; Section is the aisle-level grouping that the
// till uses as the product `category`. Brand and Product Type are open text
// (there are too many to enumerate), validated for presence rather than
// membership.
export const SUPERMARKET_TAXONOMY = {
  'Food & Grocery': [
    'Dairy & Eggs', 'Milk', 'Yoghurt', 'Cheese', 'Butter & Margarine',
    'Beverages', 'Soft Drinks', 'Juices', 'Water', 'Energy Drinks', 'Tea & Coffee',
    'Cereals & Breakfast', 'Bread & Bakery', 'Biscuits & Snacks', 'Confectionery',
    'Cooking Oils', 'Flour & Baking', 'Sugar & Sweeteners', 'Rice & Grains',
    'Pasta & Noodles', 'Canned Foods', 'Sauces & Condiments', 'Spices & Seasonings',
    'Pulses & Legumes', 'Baby Food', 'Frozen Foods', 'Fresh Produce',
    'Meat & Poultry', 'Fish & Seafood',
  ],
  'Household': [
    'Laundry', 'Dishwashing', 'Household Cleaners', 'Kitchen Supplies',
    'Paper Products', 'Storage Products', 'Air Fresheners', 'Cleaning Tools',
    'Insect Control',
  ],
  'Personal Care': [
    'Bath & Body', 'Hair Care', 'Oral Care', 'Skincare', 'Deodorants',
    'Feminine Hygiene', 'Shaving & Grooming', 'Personal Hygiene',
  ],
  'Baby Care': [
    'Baby Food', 'Diapers', 'Baby Wipes', 'Baby Toiletries', 'Baby Accessories',
  ],
  'Health & Wellness': [
    'OTC Health Products', 'Vitamins & Supplements', 'First Aid',
    'Personal Health Care',
  ],
  'Beauty & Cosmetics': [
    'Makeup', 'Fragrances', 'Hair Products', 'Beauty Accessories',
  ],
  'Stationery & School': [
    'Books', 'Pens & Pencils', 'Paper', 'School Supplies', 'Office Supplies',
  ],
  'Home & Kitchen': [
    'Kitchenware', 'Cookware', 'Utensils', 'Plasticware', 'Household Accessories',
  ],
  'Hardware & General Merchandise': [
    'Electrical', 'Batteries', 'Tools', 'Automotive', 'General Merchandise',
  ],
  'Pet Care': [
    'Pet Food', 'Pet Hygiene', 'Pet Accessories',
  ],
  'Tobacco & Age Restricted': [
    'Tobacco', 'Age Restricted',
  ],
};

export const DEPARTMENTS = Object.keys(SUPERMARKET_TAXONOMY);

// Sections that need an adult (kept available; existing restricted-product
// business rules elsewhere still apply).
export const RESTRICTED_DEPARTMENTS = ['Tobacco & Age Restricted'];

export function sectionsFor(department) {
  return SUPERMARKET_TAXONOMY[department] || [];
}

export function isValidDepartment(department) {
  return DEPARTMENTS.includes(department);
}

export function isValidSection(department, section) {
  return isValidDepartment(department) && sectionsFor(department).includes(section);
}

export function isValidUnit(unit) {
  return UNITS.includes(unit);
}

// ─── Product name composition ────────────────────────────────────────────────
// "Dairy Fresh" + "Long Life Milk" + "500" + "ml" -> "Dairy Fresh Long Life Milk 500ml"
export function formatPackSize(value) {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value).trim();
  // Trim trailing zeros: 1.50 -> 1.5, 500.00 -> 500
  return String(Number(n.toFixed(3)));
}

export function composeProductName({ brand, product_type, variant, pack_size, unit } = {}) {
  const size =
    pack_size !== null && pack_size !== undefined && pack_size !== ''
      ? `${formatPackSize(pack_size)}${unit ? unit : ''}`
      : '';
  return [brand, product_type, variant, size]
    .map((s) => (s === null || s === undefined ? '' : String(s).trim()))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Excel import columns ────────────────────────────────────────────────────
// Order here drives the template header order and the parser mapping, so the
// template, the parser and the validator can never drift apart.
export const IMPORT_COLUMNS = [
  { key: 'sku',           header: 'SKU',           required: false, note: 'Leave blank to auto-generate (PRD-####)' },
  { key: 'barcode',       header: 'Barcode',       required: false, note: 'Keep as text to preserve leading zeros' },
  { key: 'product_name',  header: 'Product Name',  required: false, note: 'Leave blank to auto-build from Brand + Type + Size' },
  { key: 'department',    header: 'Department',     required: true,  note: 'Must match the Reference sheet' },
  { key: 'section',       header: 'Section',        required: true,  note: 'Must match the Reference sheet for the Department' },
  { key: 'brand',         header: 'Brand',          required: true,  note: 'e.g. Dairy Fresh' },
  { key: 'product_type',  header: 'Product Type',   required: true,  note: 'e.g. Long Life Milk' },
  { key: 'variant',       header: 'Variant',        required: false, note: 'Optional, e.g. Low Fat' },
  { key: 'pack_size',     header: 'Pack Size',      required: true,  note: 'Numeric, e.g. 500' },
  { key: 'unit',          header: 'Unit',           required: true,  note: 'e.g. ml, L, g, kg, pack' },
  { key: 'cost_price',    header: 'Cost Price',     required: true,  note: 'Numeric, KES' },
  { key: 'selling_price', header: 'Selling Price',  required: true,  note: 'Numeric, KES (VAT-inclusive shelf price)' },
  { key: 'stock_qty',     header: 'Opening Stock',  required: false, note: 'Numeric, default 0' },
  { key: 'reorder_level', header: 'Reorder Level',  required: false, note: 'Numeric, default 10' },
];

export const IMPORT_HEADERS = IMPORT_COLUMNS.map((c) => c.header);

// ─── Row validation (shared by client preview and server import) ─────────────
// Returns an array of human-readable error strings for one row. Empty = valid.
// `rowObj` uses the IMPORT_COLUMNS keys. Barcode/SKU cross-row and DB dedupe is
// handled by the caller (it needs the whole batch / the database).
export function validateProductRow(rowObj) {
  const errors = [];
  const s = (v) => (v === null || v === undefined ? '' : String(v).trim());

  const department = s(rowObj.department);
  const section = s(rowObj.section);
  const brand = s(rowObj.brand);
  const productType = s(rowObj.product_type);
  const unit = s(rowObj.unit);

  if (!department) errors.push('Department is required');
  else if (!isValidDepartment(department)) errors.push(`Invalid Department "${department}"`);

  if (!section) errors.push('Section is required');
  else if (department && isValidDepartment(department) && !isValidSection(department, section))
    errors.push(`Section "${section}" is not valid for Department "${department}"`);

  if (!brand) errors.push('Brand is required');
  if (!productType) errors.push('Product Type is required');

  if (!unit) errors.push('Unit is required');
  else if (!isValidUnit(unit)) errors.push(`Invalid Unit "${unit}"`);

  // Pack size
  const packRaw = s(rowObj.pack_size);
  if (!packRaw) errors.push('Pack Size is required');
  else if (Number.isNaN(Number(packRaw)) || Number(packRaw) <= 0)
    errors.push('Pack Size must be a positive number');

  // Prices
  const cost = s(rowObj.cost_price);
  const sell = s(rowObj.selling_price);
  const costNum = Number(cost);
  const sellNum = Number(sell);
  if (!cost) errors.push('Cost Price is required');
  else if (Number.isNaN(costNum) || costNum < 0) errors.push('Cost Price must be a number >= 0');
  if (!sell) errors.push('Selling Price is required');
  else if (Number.isNaN(sellNum) || sellNum < 0) errors.push('Selling Price must be a number >= 0');
  if (!Number.isNaN(costNum) && !Number.isNaN(sellNum) && cost && sell && sellNum < costNum)
    errors.push('Selling Price cannot be lower than Cost Price');

  // Stock (optional)
  const stock = s(rowObj.stock_qty);
  if (stock && (Number.isNaN(Number(stock)) || Number(stock) < 0))
    errors.push('Opening Stock must be a number >= 0');

  // Reorder (optional)
  const reorder = s(rowObj.reorder_level);
  if (reorder && (Number.isNaN(Number(reorder)) || Number(reorder) < 0))
    errors.push('Reorder Level must be a number >= 0');

  // Need at least a barcode or an SKU to identify the product
  if (!s(rowObj.barcode) && !s(rowObj.sku))
    errors.push('Either Barcode or SKU is required');

  return errors;
}

// Normalise one raw spreadsheet row into the shape the server import expects.
// Barcode/SKU are forced to trimmed strings so Excel numeric coercion and
// leading zeros are handled consistently.
export function normaliseImportRow(rowObj) {
  const s = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const num = (v) => {
    const t = s(v);
    return t === '' ? null : Number(t);
  };
  const department = s(rowObj.department);
  const section = s(rowObj.section);
  const built = {
    sku: s(rowObj.sku),
    barcode: s(rowObj.barcode),
    department,
    section,
    brand: s(rowObj.brand),
    product_type: s(rowObj.product_type),
    variant: s(rowObj.variant),
    pack_size: num(rowObj.pack_size),
    unit: s(rowObj.unit),
    cost_price: num(rowObj.cost_price),
    selling_price: num(rowObj.selling_price),
    stock_qty: num(rowObj.stock_qty) ?? 0,
    reorder_level: num(rowObj.reorder_level) ?? 10,
    // Section is the till-facing category, for backward compatibility.
    category: section,
  };
  built.product_name =
    s(rowObj.product_name) ||
    composeProductName({
      brand: built.brand,
      product_type: built.product_type,
      variant: built.variant,
      pack_size: built.pack_size,
      unit: built.unit,
    });
  return built;
}