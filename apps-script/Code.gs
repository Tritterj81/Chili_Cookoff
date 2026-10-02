/**
 * Soup Cook Off sign-up: the back end for the sign-up page (Index.html).
 *
 * Every sign-up becomes one row on the "Sign-ups" tab of the Google Sheet this
 * script is attached to, so the sheet is the live list. A "Totals" tab counts
 * cooks per category. Delete a row in the sheet to remove someone; type a row
 * in by hand to add someone (put anything, such as a check mark, under each
 * category they chose).
 *
 * Setup steps are in SETUP.md.
 */

var SPREADSHEET_ID = '';   // leave blank when this script was opened from the sheet (Extensions > Apps Script)
var SHEET_NAME = 'Sign-ups';
var TOTALS_NAME = 'Totals';
var MAX_ROWS = 400;        // stops runaway sign-ups

var CATS = [
  { id: 'classic', name: 'Classic Comfort', color: '#B3232F', ink: '#FFFFFF' },
  { id: 'spicy',   name: 'Spicy and Bold',  color: '#F0AE1B', ink: '#2A1B05' },
  { id: 'creamy',  name: 'Creamy',          color: '#1E4C94', ink: '#FFFFFF' },
  { id: 'wild',    name: 'Wild Card',       color: '#2F7A33', ink: '#FFFFFF' }
];
var COLS = 8; // Signed up | Name | Making | 4 categories | Edit key
var KEY_COL = 8;
var CACHE_KEY = 'rows';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Soup Cook Off Sign-Up')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** The list the page shows. `key` is this browser's private edit key, used only to mark "you". */
function getSignups(key) {
  return listResult_(key);
}

/** Add a sign-up, or change the one that already carries this edit key. */
function saveSignup(p) {
  p = p || {};
  if (p.hp) return { ok: false, error: 'spam' };
  var key = String(p.key || '');
  if (!/^[a-f0-9]{16,64}$/.test(key)) return { ok: false, error: 'key' };
  var name = clip_(p.name, 60);
  var dish = clip_(p.dish, 80);
  if (!name) return { ok: false, error: 'name' };
  var picked = [];
  (Array.isArray(p.categories) ? p.categories : []).forEach(function (id) {
    if (CATS.some(function (c) { return c.id === id; }) && picked.indexOf(id) === -1) picked.push(id);
  });
  if (!picked.length) return { ok: false, error: 'cats' };

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'busy' };
  try {
    var sh = sheet_();
    var cells = CATS.map(function (c) { return picked.indexOf(c.id) !== -1 ? '✓' : ''; });
    var row = findRow_(sh, key);
    if (row) {
      sh.getRange(row, 2, 1, 2 + CATS.length).setValues([[name, dish].concat(cells)]);
    } else {
      var last = sh.getLastRow();
      if (last - 1 >= MAX_ROWS) return { ok: false, error: 'full' };
      sh.getRange(last + 1, 1, 1, COLS).setValues([[new Date(), name, dish].concat(cells, [key])]);
    }
    CacheService.getScriptCache().remove(CACHE_KEY);
  } finally {
    lock.releaseLock();
  }
  return listResult_(key);
}

/** Remove the sign-up that carries this edit key. */
function removeSignup(key) {
  key = String(key || '');
  if (!/^[a-f0-9]{16,64}$/.test(key)) return { ok: false, error: 'key' };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { ok: false, error: 'busy' };
  try {
    var sh = sheet_();
    var row = findRow_(sh, key);
    if (row) sh.deleteRow(row);
    CacheService.getScriptCache().remove(CACHE_KEY);
  } finally {
    lock.releaseLock();
  }
  return listResult_(key);
}

/* ---- helpers ---- */

function clip_(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function idFor_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').slice(0, 10);
}

function listResult_(key) {
  key = String(key || '');
  var entries = readRows_().map(function (r) {
    return {
      id: r.id, name: r.name, dish: r.dish, categories: r.categories, createdAt: r.createdAt,
      mine: !!key && !!r.key && r.key === key
    };
  });
  return { ok: true, entries: entries };
}

/** All rows, newest read cached for a few seconds so many open pages do not each hit the sheet. */
function readRows_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_KEY);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* fall through and re-read */ }
  }
  var sh = sheet_();
  var last = sh.getLastRow();
  var out = [];
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, COLS).getValues().forEach(function (v) {
      var name = clip_(v[1], 60);
      if (!name) return;
      var key = String(v[KEY_COL - 1] || '').trim();
      var created = v[0] instanceof Date ? v[0].getTime() : (Date.parse(v[0]) || 0);
      out.push({
        id: idFor_(key || ('m|' + name + '|' + created)),
        name: name,
        dish: clip_(v[2], 80),
        categories: CATS.filter(function (c, i) { return String(v[3 + i]).trim() !== ''; })
          .map(function (c) { return c.id; }),
        createdAt: created,
        key: key
      });
    });
  }
  try { cache.put(CACHE_KEY, JSON.stringify(out), 5); } catch (e) { /* too big to cache: fine */ }
  return out;
}

function findRow_(sh, key) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var keys = sh.getRange(2, KEY_COL, last - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).trim() === key) return i + 2;
  }
  return 0;
}

function sheet_() {
  var ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || createSheet_(ss);
}

/** First run: lay out the sign-up tab and a Totals tab. */
function createSheet_(ss) {
  var sheets = ss.getSheets();
  var sh;
  if (sheets.length === 1 && sheets[0].getLastRow() === 0) {
    sh = sheets[0];
    sh.setName(SHEET_NAME);
  } else {
    sh = ss.insertSheet(SHEET_NAME, 0);
  }
  var headers = ['Signed up', 'Name', 'What they are making']
    .concat(CATS.map(function (c) { return c.name; }), ['Edit key (page use only)']);
  sh.getRange(1, 1, 1, COLS).setValues([headers])
    .setFontWeight('bold').setFontColor('#FBF5E6').setBackground('#14264A').setVerticalAlignment('middle');
  CATS.forEach(function (c, i) {
    sh.getRange(1, 4 + i).setBackground(c.color).setFontColor(c.ink).setHorizontalAlignment('center');
  });
  sh.getRange('B:C').setNumberFormat('@');            // plain text, so nothing typed on the page can run as a formula
  sh.getRange('A:A').setNumberFormat('mmm d, h:mm AM/PM');
  sh.getRange('D:G').setHorizontalAlignment('center').setFontSize(14);
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 200); sh.setColumnWidth(3, 240);
  for (var i = 4; i <= 7; i++) sh.setColumnWidth(i, 120);
  sh.hideColumns(KEY_COL);                              // each person's private edit key lives here
  createTotals_(ss);
  return sh;
}

function createTotals_(ss) {
  if (ss.getSheetByName(TOTALS_NAME)) return;
  var t = ss.insertSheet(TOTALS_NAME);
  var q = "'" + SHEET_NAME + "'!";
  t.getRange('A1').setValue('Soup Cook Off · Monday, October 19 · 12:00 PM · QA Room')
    .setFontWeight('bold').setFontSize(14);
  t.getRange('A3:B3').setValues([['Category', 'Cooks']]).setFontWeight('bold');
  CATS.forEach(function (c, i) {
    var col = String.fromCharCode(68 + i); // D..G
    t.getRange(4 + i, 1).setValue(c.name).setBackground(c.color).setFontColor(c.ink).setFontWeight('bold');
    t.getRange(4 + i, 2).setFormula('=COUNTA(' + q + col + '2:' + col + ')');
  });
  t.getRange('A9').setValue('Cooks signed up').setFontWeight('bold');
  t.getRange('B9').setFormula('=COUNTA(' + q + 'B2:B)');
  t.setColumnWidth(1, 220);
  t.getRange('B3:B9').setHorizontalAlignment('center');
}
