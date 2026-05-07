/**
 * Ascend Deals — Apps Script JSONP endpoint
 * Sheet: https://docs.google.com/spreadsheets/d/1ktyPwnafJveCU_9RAIrTWfZiHEMKMbLf075vtXUFk0c/edit
 *
 * Walks every month tab in the active spreadsheet and returns rows as JSONP.
 * Tabs whose name does NOT look like a month (Jan, January, Jan 2026, etc.)
 * are skipped — that lets you keep helper tabs like "Roster", "Notes", etc.
 *
 * DEPLOY:
 *   1. Open the sheet → Extensions → Apps Script
 *   2. Replace any existing Code.gs content with this file
 *   3. Save (disk icon)
 *   4. Run doGet() once manually to grant the script permission
 *   5. Deploy → New deployment → Type: Web app
 *      - Description: Ascend Deals API v1
 *      - Execute as: Me (your account)
 *      - Who has access: Anyone
 *   6. Copy the Web app URL — that's the endpoint the dashboard will call
 *   7. Send the URL back to Claude
 *
 * NOTE: token below is a soft gate, not real auth. Keep the URL out of public posts.
 */

const TOKEN = 'ascend-2026';

const HEADER_ALIASES = {
  'first name':       ['first name', 'first', 'firstname'],
  'last name':        ['last name', 'last', 'lastname'],
  'email':            ['email', 'client email', 'e-mail'],
  'address':          ['address', 'property address'],
  'zip code':         ['zip code', 'zip', 'postal code'],
  'executed':         ['executed', 'execution date', 'effective date', 'contract date'],
  'option':           ['option', 'option period', 'option date', 'option deadline', 'option ends'],
  'financing':        ['financing', 'financing deadline', 'finance deadline', 'financing date'],
  'close date':       ['close date', 'closing date', 'close'],
  'price':            ['price', 'sales price', 'purchase price'],
  'market':           ['market', 'city', 'metro'],
  'agent':            ['agent', 'listing agent', 'buyer agent', 'agent name'],
  'lender':           ['lender'],
  'title':            ['title', 'title company'],
  'source':           ['source', 'lead source'],
  'total commission': ['total commission', 'gross commission', 'gross commission income', 'gci'],
  'agency commission':['agency commission', 'company dollar', 'agency $'],
  'status':           ['status', 'deal status'],
  'notes':            ['notes', 'note', 'comments']
};

const MONTH_NAMES = {
  jan:0, january:0,
  feb:1, february:1,
  mar:2, march:2,
  apr:3, april:3,
  may:4,
  jun:5, june:5,
  jul:6, july:6,
  aug:7, august:7,
  sep:8, sept:8, september:8,
  oct:9, october:9,
  nov:10, november:10,
  dec:11, december:11
};

function isMonthTab(name) {
  if (!name) return false;
  const cleaned = String(name).trim().toLowerCase();
  // Match "jan", "january", "jan 2026", "january 2026", "jan-26", "1/2026", "01"
  const tokens = cleaned.replace(/[-_/]/g, ' ').split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (MONTH_NAMES[t] !== undefined) return true;
  }
  return false;
}

function tabToYearMonth(name) {
  const cleaned = String(name).trim().toLowerCase().replace(/[-_/]/g, ' ');
  const parts = cleaned.split(/\s+/).filter(Boolean);
  let month = null;
  let year = null;
  for (const p of parts) {
    if (MONTH_NAMES[p] !== undefined) month = MONTH_NAMES[p];
    else if (/^\d{4}$/.test(p)) year = parseInt(p);
    else if (/^\d{2}$/.test(p)) year = 2000 + parseInt(p);
  }
  if (year === null) year = new Date().getFullYear();
  return { year, month };
}

function buildHeaderMap(headerRow) {
  // Returns { canonical: actualHeaderString } for headers we recognize.
  const map = {};
  const cleaned = headerRow.map(h => String(h || '').trim().toLowerCase());
  Object.keys(HEADER_ALIASES).forEach(canonical => {
    const aliases = HEADER_ALIASES[canonical];
    for (let i = 0; i < cleaned.length; i++) {
      if (aliases.indexOf(cleaned[i]) !== -1) {
        map[canonical] = i;
        return;
      }
    }
  });
  return map;
}

function readSheet(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headerMap = buildHeaderMap(values[0]);
  const tab = sheet.getName();
  const ym = tabToYearMonth(tab);
  const rows = [];
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    // Skip blank rows
    const hasAny = row.some(v => v !== '' && v !== null && v !== undefined);
    if (!hasAny) continue;
    const obj = { _tab: tab, _tabYear: ym.year, _tabMonth: ym.month };
    Object.keys(headerMap).forEach(canonical => {
      const idx = headerMap[canonical];
      const v = row[idx];
      if (v instanceof Date) {
        // ISO so the client can parse reliably
        obj[canonical] = v.toISOString();
      } else {
        obj[canonical] = v === null || v === undefined ? '' : String(v);
      }
    });
    rows.push(obj);
  }
  return rows;
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const cb = params.callback || 'callback';

  if (TOKEN && params.token !== TOKEN) {
    return jsonp(cb, { error: 'unauthorized' });
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    let allRows = [];
    const tabsRead = [];
    sheets.forEach(s => {
      const name = s.getName();
      if (!isMonthTab(name)) return;
      tabsRead.push(name);
      const rows = readSheet(s);
      allRows = allRows.concat(rows);
    });

    return jsonp(cb, {
      rows: allRows,
      tabs: tabsRead,
      generatedAt: new Date().toISOString(),
      count: allRows.length
    });
  } catch (err) {
    return jsonp(cb, { error: String(err && err.message || err) });
  }
}

function jsonp(cb, payload) {
  const safeCb = String(cb).replace(/[^A-Za-z0-9_]/g, '');
  const body = safeCb + '(' + JSON.stringify(payload) + ');';
  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
