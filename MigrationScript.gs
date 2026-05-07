/**
 * ONE-TIME MIGRATION
 * Pulls Jan-April 2026 deals from the two old sheets (TASA + Austin)
 * and writes them into the consolidated sheet's Jan/Feb/Mar/Apr tabs,
 * mapping each old schema to the consolidated schema.
 *
 * RUN THIS FROM THE CONSOLIDATED SHEET'S APPS SCRIPT EDITOR.
 *
 * 1. Open the consolidated sheet:
 *    https://docs.google.com/spreadsheets/d/1ktyPwnafJveCU_9RAIrTWfZiHEMKMbLf075vtXUFk0c/edit
 * 2. Extensions → Apps Script (you should see your existing AppsScript.gs).
 * 3. Click the + next to "Files" in the left sidebar → Script. Name the new file "MigrationScript".
 * 4. Paste the contents of THIS file into it. Save.
 * 5. In the function dropdown at the top, select `runMigration`. Click Run.
 * 6. First run will ask for permission — accept (it needs to read the two source sheets).
 * 7. When it finishes (1-2 minutes), the consolidated sheet will have Jan/Feb/Mar/Apr tabs
 *    populated with the historical data.
 * 8. After confirming the data looks right, you can delete this file from the editor.
 */

// IDs of the two source sheets
const TASA_SHEET_ID   = '145f3WpgD2IR1C6T1pmTcrhldAVegbM-jftIh_zOlYRU';
const AUSTIN_SHEET_ID = '1eJ_9RKGfzINQRTL7vmfXcRNJCmT47OYsUd7BPhiXErw';

// The consolidated sheet's canonical column order (matches your schema)
const CONSOLIDATED_HEADERS = [
  'First Name','Last Name','Email','Address','Zip Code','Executed','Option','Financing',
  'Close Date','Price','Market','Agent','Lender','Title','Source',
  'Total Commission','Agency Commission','Status','NOTES'
];

// Header alias map — left side is canonical (consolidated), right side is list of variants seen in old sheets.
const FIELD_ALIASES = {
  'First Name':         ['first name', 'first'],
  'Last Name':          ['last name', 'last', 'last name '],
  'Email':              ['email', 'email '],
  'Address':            ['address'],
  'Zip Code':           ['zip code', 'zip'],
  'Executed':           ['executed', 'executed date', 'execution date'],
  'Option':             ['option', 'option end date', 'option period', 'option deadline'],
  'Financing':          ['financing', 'finance cont date', 'finance approval date', 'financing deadline'],
  'Close Date':         ['close date', 'closing date', 'close'],
  'Price':              ['price', 'sales price', 'purchase price'],
  'Market':             ['market'],
  'Agent':              ['agent'],
  'Lender':             ['lender', 'lender '],
  'Title':              ['title', 'title ', 'title company'],
  'Source':             ['source', 'lead source'],
  'Total Commission':   ['total commission', 'commissions', 'gross commission'],
  'Agency Commission':  ['agency commission'],
  'Status':             ['status', 'da sheet'], // TASA tracks status across multiple TRUE/FALSE columns; we'll synthesize
  'NOTES':              ['notes', 'note', 'comments']
};

const MONTH_NAMES = {
  jan:0, january:0, feb:1, february:1, mar:2, march:2, apr:3, april:3,
  may:4, jun:5, june:5, jul:6, july:6, aug:7, august:7, sep:8, sept:8, september:8,
  oct:9, october:9, nov:10, november:10, dec:11, december:11
};

function tabToMonthIndex(name) {
  const cleaned = String(name || '').trim().toLowerCase().replace(/[-_/]/g,' ');
  for (const t of cleaned.split(/\s+/)) {
    if (MONTH_NAMES[t] !== undefined) return MONTH_NAMES[t];
  }
  return null;
}

function isMonthTab(name) {
  return tabToMonthIndex(name) !== null;
}

function buildHeaderMap(headerRow) {
  // Returns { canonicalField: indexInRow }
  const cleaned = headerRow.map(h => String(h || '').trim().toLowerCase());
  const map = {};
  Object.keys(FIELD_ALIASES).forEach(canonical => {
    const aliases = FIELD_ALIASES[canonical];
    for (let i = 0; i < cleaned.length; i++) {
      if (aliases.indexOf(cleaned[i]) !== -1) { map[canonical] = i; return; }
    }
  });
  return map;
}

function readSheetRows(sheet, defaultMarket) {
  // Returns { monthIdx: [rowObj, rowObj, ...] }
  const tabName = sheet.getName();
  const monthIdx = tabToMonthIndex(tabName);
  if (monthIdx === null) return null;
  // Only migrate Jan-April
  if (monthIdx > 3) return null;

  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;
  const headerMap = buildHeaderMap(values[0]);
  const rows = [];

  for (let r = 1; r < values.length; r++) {
    const raw = values[r];
    const hasAny = raw.some(v => v !== '' && v !== null && v !== undefined);
    if (!hasAny) continue;
    const obj = {};
    Object.keys(headerMap).forEach(field => {
      const idx = headerMap[field];
      const v = raw[idx];
      if (v instanceof Date) obj[field] = v;
      else obj[field] = (v === null || v === undefined) ? '' : v;
    });
    // Synthesize Market if not present
    if (!obj['Market'] && defaultMarket) obj['Market'] = defaultMarket;
    // Synthesize Status from TASA's "DA Sent to Title" / "Funded" / "Docs Approved" boolean columns if Status field is missing
    if (!obj['Status']) {
      const lookup = (label) => {
        const idx = values[0].findIndex(h => String(h||'').trim().toLowerCase() === label.toLowerCase());
        return idx >= 0 ? raw[idx] : '';
      };
      const funded = lookup('Funded');
      const dasentToTitle = lookup('DA Sent to Title');
      const docsApproved = lookup('Docs Approved');
      const daSheet = lookup('DA Sheet');
      if (String(funded).toUpperCase() === 'TRUE') obj['Status'] = 'Closed';
      else if (String(dasentToTitle).toUpperCase() === 'TRUE') obj['Status'] = 'DA sent';
      else if (String(daSheet).toUpperCase() === 'TRUE') obj['Status'] = 'DA review';
      else if (String(docsApproved).toUpperCase() === 'TRUE') obj['Status'] = 'in Zillow';
      else obj['Status'] = '';
    }
    // Synthesize First Name if missing — TASA only has Last; leave first blank
    if (!obj['First Name']) obj['First Name'] = '';
    rows.push(obj);
  }

  return { monthIdx, rows };
}

function getOrCreateMonthTab(consolidated, monthIdx) {
  // Look for existing tab matching this month; otherwise create one named e.g. "Jan 2026"
  const monthAbbrs = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const wanted = monthAbbrs[monthIdx];
  const allSheets = consolidated.getSheets();
  for (const s of allSheets) {
    if (tabToMonthIndex(s.getName()) === monthIdx) return s;
  }
  // Create new with consolidated headers
  const newSheet = consolidated.insertSheet(`${wanted} 2026`);
  newSheet.getRange(1, 1, 1, CONSOLIDATED_HEADERS.length).setValues([CONSOLIDATED_HEADERS]);
  newSheet.setFrozenRows(1);
  return newSheet;
}

function appendRowsToTab(tab, rowObjs) {
  if (!rowObjs.length) return 0;
  const headers = tab.getRange(1, 1, 1, tab.getLastColumn()).getValues()[0];
  // Use the consolidated header order; if the existing tab has a different
  // order we still write under the headers it actually has.
  const headerKeys = headers.map(h => String(h||'').trim());
  const matrix = rowObjs.map(obj => headerKeys.map(h => {
    // Try the canonical field exactly; if that's missing fall back to a case-insensitive lookup.
    if (obj[h] !== undefined) return obj[h];
    const k = Object.keys(obj).find(x => x.toLowerCase() === h.toLowerCase());
    return k ? obj[k] : '';
  }));
  tab.getRange(tab.getLastRow() + 1, 1, matrix.length, headerKeys.length).setValues(matrix);
  return matrix.length;
}

function runMigration() {
  const consolidated = SpreadsheetApp.getActiveSpreadsheet();
  const tasa = SpreadsheetApp.openById(TASA_SHEET_ID);
  const austin = SpreadsheetApp.openById(AUSTIN_SHEET_ID);

  const sources = [
    { ss: tasa,   defaultMarket: 'San Antonio', label: 'TASA' },
    { ss: austin, defaultMarket: 'Austin',      label: 'Austin' }
  ];

  const summary = [];
  for (const src of sources) {
    const sheets = src.ss.getSheets();
    for (const s of sheets) {
      if (!isMonthTab(s.getName())) continue;
      const result = readSheetRows(s, src.defaultMarket);
      if (!result || !result.rows.length) continue;
      const targetTab = getOrCreateMonthTab(consolidated, result.monthIdx);
      const wrote = appendRowsToTab(targetTab, result.rows);
      summary.push(`${src.label} ${s.getName()} → ${targetTab.getName()}: ${wrote} rows`);
      Logger.log(`${src.label} ${s.getName()} → ${targetTab.getName()}: ${wrote} rows`);
    }
  }
  Logger.log('Migration complete:\n' + summary.join('\n'));
  // Surface a summary to the user via a toast in the consolidated sheet
  consolidated.toast('Migration complete — see View → Logs for details', 'Migration', 30);
}
