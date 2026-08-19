import { useMemo, useRef, useState } from 'react';
import { UploadCloud, Download, FileSpreadsheet, X, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  IMPORT_COLUMNS,
  IMPORT_HEADERS,
  DEPARTMENTS,
  SUPERMARKET_TAXONOMY,
  UNITS,
  validateProductRow,
} from '@nexus-pos/shared';
import { bulkImportProducts } from '../api/client.js';

// header (lowercased) -> our internal key
const HEADER_TO_KEY = IMPORT_COLUMNS.reduce((m, c) => {
  m[c.header.toLowerCase()] = c.key;
  return m;
}, {});

// A couple of example rows so the template isn't intimidating.
const EXAMPLE_ROWS = [
  ['DF-LL-500', '0612345678901', 'Dairy Fresh Long Life Milk 500ml', 'Food & Grocery', 'Dairy & Eggs', 'Dairy Fresh', 'Long Life Milk', '', 500, 'ml', 55, 70, 100, 20],
  ['DF-LL-1L', '0612345678902', 'Dairy Fresh Long Life Milk 1L', 'Food & Grocery', 'Dairy & Eggs', 'Dairy Fresh', 'Long Life Milk', '', 1, 'L', 105, 130, 80, 15],
  ['', '049000028904', '', 'Food & Grocery', 'Beverages', 'Coca-Cola', 'Soft Drink', '', 500, 'ml', 50, 70, 120, 25],
];

function buildTemplateWorkbook() {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Products — header + examples. Barcode cells are forced to text so
  // leading zeros survive.
  const aoa = [IMPORT_HEADERS, ...EXAMPLE_ROWS];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const barcodeCol = IMPORT_COLUMNS.findIndex((c) => c.key === 'barcode');
  const skuCol = IMPORT_COLUMNS.findIndex((c) => c.key === 'sku');
  for (let r = 1; r <= EXAMPLE_ROWS.length; r++) {
    for (const col of [barcodeCol, skuCol]) {
      const addr = XLSX.utils.encode_cell({ r, c: col });
      if (ws[addr]) { ws[addr].t = 's'; ws[addr].z = '@'; }
    }
  }
  ws['!cols'] = IMPORT_COLUMNS.map((c) =>
    ({ wch: Math.max(c.header.length + 2, c.key === 'product_name' ? 34 : 14) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Products');

  // Sheet 2: Reference — every valid Department -> Section pair, plus units.
  const refAoa = [['Department', 'Section']];
  for (const dept of DEPARTMENTS) {
    for (const section of SUPERMARKET_TAXONOMY[dept]) refAoa.push([dept, section]);
  }
  refAoa.push([], ['Valid Units']);
  for (const u of UNITS) refAoa.push([u]);
  const refWs = XLSX.utils.aoa_to_sheet(refAoa);
  refWs['!cols'] = [{ wch: 32 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, refWs, 'Reference');

  // Sheet 3: Instructions.
  const notes = [
    ['How to fill this template'],
    [''],
    ['1. Fill one product variant per row on the "Products" sheet.'],
    ['2. Department and Section must match a pair on the "Reference" sheet.'],
    ['3. Unit must be one of the units listed on the "Reference" sheet.'],
    ['4. Pack Size is a number only (e.g. 500). The Unit is separate (e.g. ml).'],
    ['5. Product Name can be left blank — it is built from Brand + Product Type + Size.'],
    ['6. SKU can be left blank — the system will assign PRD-#### automatically.'],
    ['7. Format the Barcode column as TEXT so long barcodes keep their leading zeros.'],
    ['8. Selling Price is the VAT-inclusive shelf price. It cannot be lower than Cost Price.'],
    [''],
    ['Columns:'],
    ...IMPORT_COLUMNS.map((c) => [`${c.header}${c.required ? ' (required)' : ''}`, c.note]),
  ];
  const noteWs = XLSX.utils.aoa_to_sheet(notes);
  noteWs['!cols'] = [{ wch: 26 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, noteWs, 'Instructions');

  return wb;
}

export function ImportInventory({ onClose, onImported, onNotify }) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState(null);      // parsed + validated rows
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);  // server result
  const inputRef = useRef(null);

  function downloadTemplate() {
    try {
      const wb = buildTemplateWorkbook();
      XLSX.writeFile(wb, 'nexus-inventory-template.xlsx');
    } catch (err) {
      onNotify?.(`Could not build template: ${err.message}`, 'error');
    }
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setResult(null);
    setRows(null);
    setFileName(file.name);

    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      setParseError('That is not an Excel file. Please upload a .xlsx or .xls file.');
      return;
    }

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames.includes('Products') ? 'Products' : wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      if (!ws) { setParseError('The workbook has no sheets.'); return; }

      // raw:false → values come back as their displayed text, which keeps
      // barcodes as strings. defval:'' → blank cells become ''.
      const json = XLSX.utils.sheet_to_json(ws, { raw: false, defval: '' });
      if (json.length === 0) { setParseError('The "Products" sheet has no data rows.'); return; }

      // Check the required headers are present.
      const presentHeaders = Object.keys(json[0]).map((h) => h.toLowerCase());
      const missing = IMPORT_COLUMNS
        .filter((c) => c.required && !presentHeaders.includes(c.header.toLowerCase()))
        .map((c) => c.header);
      if (missing.length > 0) {
        setParseError(`The file is missing required columns: ${missing.join(', ')}. Download the template and use its headers.`);
        return;
      }

      const seenBarcode = new Map();
      const seenSku = new Map();
      const parsed = json.map((raw, i) => {
        const rowNo = i + 2; // header is row 1
        const obj = { __row: rowNo };
        for (const [header, val] of Object.entries(raw)) {
          const key = HEADER_TO_KEY[header.toLowerCase()];
          if (key) obj[key] = typeof val === 'string' ? val.trim() : val;
        }
        const errors = validateProductRow(obj);

        // In-file duplicate detection (barcode + SKU).
        const bc = String(obj.barcode || '').trim().toLowerCase();
        if (bc) {
          if (seenBarcode.has(bc)) errors.push(`Duplicate Barcode in file (row ${seenBarcode.get(bc)})`);
          else seenBarcode.set(bc, rowNo);
        }
        const sk = String(obj.sku || '').trim().toLowerCase();
        if (sk) {
          if (seenSku.has(sk)) errors.push(`Duplicate SKU in file (row ${seenSku.get(sk)})`);
          else seenSku.set(sk, rowNo);
        }

        return { rowNo, obj, errors };
      });

      setRows(parsed);
    } catch (err) {
      setParseError(`Could not read that file — it may be corrupted. (${err.message})`);
    } finally {
      // allow re-selecting the same file
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const stats = useMemo(() => {
    if (!rows) return null;
    const valid = rows.filter((r) => r.errors.length === 0);
    return { total: rows.length, valid: valid.length, invalid: rows.length - valid.length };
  }, [rows]);

  async function runImport() {
    if (!rows) return;
    const valid = rows.filter((r) => r.errors.length === 0);
    if (valid.length === 0) {
      onNotify?.('There are no valid rows to import.', 'error');
      return;
    }
    setImporting(true);
    try {
      const payload = valid.map((r) => r.obj);
      const res = await bulkImportProducts(payload);
      setResult(res);
      if (res.created > 0) {
        onImported?.(res.products || []);
        onNotify?.(
          res.skipped > 0
            ? `${res.created} products imported. ${res.skipped} rows were not imported.`
            : `Successfully imported ${res.created} products.`,
          res.skipped > 0 ? 'info' : 'success'
        );
      } else {
        onNotify?.('No products were imported.', 'error');
      }
    } catch (err) {
      onNotify?.(err.message, 'error');
    } finally {
      setImporting(false);
    }
  }

  const invalidRows = rows ? rows.filter((r) => r.errors.length > 0) : [];

  return (
    <div className="import-overlay" onClick={onClose}>
      <div className="import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="import-modal__head">
          <h3><FileSpreadsheet size={18} /> Import Inventory from Excel</h3>
          <button className="import-modal__close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="import-modal__body">
          {/* Steps */}
          <ol className="import-steps">
            <li><strong>1.</strong> Download the template</li>
            <li><strong>2.</strong> Fill in your products</li>
            <li><strong>3.</strong> Upload the file</li>
            <li><strong>4.</strong> Review &amp; import</li>
          </ol>

          <div className="import-actions">
            <button className="import-btn import-btn--ghost" onClick={downloadTemplate}>
              <Download size={15} /> Download template
            </button>
            <button className="import-btn import-btn--primary" onClick={() => inputRef.current?.click()}>
              <UploadCloud size={15} /> Choose Excel file
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={onFile}
              style={{ display: 'none' }}
            />
            {fileName && <span className="import-filename">{fileName}</span>}
          </div>

          {parseError && (
            <div className="import-alert import-alert--bad">
              <AlertTriangle size={15} /> {parseError}
            </div>
          )}

          {/* Preview */}
          {stats && !result && (
            <>
              <div className="import-summary">
                <div className="import-stat"><span>{stats.total}</span>rows found</div>
                <div className="import-stat import-stat--ok"><span>{stats.valid}</span>valid</div>
                <div className="import-stat import-stat--bad"><span>{stats.invalid}</span>invalid</div>
              </div>

              {invalidRows.length > 0 && (
                <div className="import-errors">
                  <div className="import-errors__head">Rows that need fixing before they can import:</div>
                  <ul>
                    {invalidRows.slice(0, 200).map((r) => (
                      <li key={r.rowNo}>
                        <strong>Row {r.rowNo}:</strong> {r.errors.join('; ')}
                      </li>
                    ))}
                  </ul>
                  {invalidRows.length > 200 && (
                    <div className="import-errors__more">…and {invalidRows.length - 200} more.</div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Result */}
          {result && (
            <div className="import-result">
              <div className="import-alert import-alert--ok">
                <CheckCircle2 size={16} />
                {result.skipped > 0
                  ? `${result.created} products imported. ${result.skipped} rows were not imported.`
                  : `Successfully imported ${result.created} products.`}
              </div>
              {result.errors?.length > 0 && (
                <div className="import-errors">
                  <div className="import-errors__head">Rejected rows:</div>
                  <ul>
                    {result.errors.slice(0, 200).map((e) => (
                      <li key={e.row}><strong>Row {e.row}:</strong> {e.messages.join('; ')}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="import-modal__foot">
          {!result ? (
            <>
              <button className="import-btn import-btn--ghost" onClick={onClose} disabled={importing}>Cancel</button>
              <button
                className="import-btn import-btn--primary"
                onClick={runImport}
                disabled={!stats || stats.valid === 0 || importing}
              >
                {importing
                  ? <><Loader2 size={15} className="import-spin" /> Importing…</>
                  : <>Import {stats ? stats.valid : 0} products</>}
              </button>
            </>
          ) : (
            <button className="import-btn import-btn--primary" onClick={onClose}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}