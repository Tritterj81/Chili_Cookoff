/**
 * Soup Cook Off sign-up: the back end for the sign-up page (Index.html).
 *
 * Tabs in the Google Sheet this script is attached to (all created on first load):
 *   Sign-ups   One row per soup: when, cook, category, soup name. This is the full
 *              roster and only people with access to the sheet can see it.
 *   Totals     Soups and cooks per category.
 *   Organizers One row per organizer: a name and a passcode. Add a row to add an
 *              organizer, delete a row to remove one.
 *
 * Blind tasting: the public page only ever receives soup names and counts. Cook
 * names are sent only to a visitor who enters a passcode from the Organizers tab
 * (the cook's own name goes back to that cook so they can edit their sign-up).
 *
 * Setup steps are in SETUP.md.
 */

var SPREADSHEET_ID = '';        // leave blank when this script was opened from the sheet (Extensions > Apps Script)
var SHEET_NAME = 'Sign-ups';
var TOTALS_NAME = 'Totals';
var ORGANIZERS_NAME = 'Organizers';
var MAX_ROWS = 400;             // soups in total; stops runaway sign-ups
var MAX_SOUPS_PER_COOK = 12;
var MAX_ORGANIZER_FAILS = 30;   // wrong passcodes allowed per 10 minutes before organizer sign-in pauses

var CATS = [
  { id: 'classic', name: 'Classic Comfort', color: '#B3232F', ink: '#FFFFFF' },
  { id: 'spicy',   name: 'Spicy and Bold',  color: '#F0AE1B', ink: '#2A1B05' },
  { id: 'creamy',  name: 'Creamy',          color: '#1E4C94', ink: '#FFFFFF' },
  { id: 'wild',    name: 'Wild Card',       color: '#2F7A33', ink: '#FFFFFF' }
];
var COLS = 5;     // Signed up | Cook | Category | Soup name | Edit key
var KEY_COL = 5;
var CACHE_KEY = 'rows';
var KEY_RE = /^[a-f0-9]{16,64}$/;

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Soup Cook Off Sign-Up')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ---- public: what anyone with the link can call ---- */

/** Soups and counts only. `key` is this browser's private edit key, used to mark and return the visitor's own sign-up. */
function getSignups(key) {
  return listResult_(String(key || ''));
}

/** Add or change a cook's sign-up (everything under this edit key is replaced). */
function saveSignup(p) {
  p = p || {};
  if (p.hp) return fail_('spam');
  var key = String(p.key || '');
  if (!KEY_RE.test(key)) return fail_('key');
  var name = clip_(p.name, 60);
  if (!name) return fail_('name');
  var soups = cleanSoups_(p.soups);
  if (!soups.length) return fail_('soups');
  if (soups.some(function (s) { return !s.dish; })) return fail_('dish');

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return fail_('busy');
  try {
    var sh = sheet_();
    var mine = rowsForKey_(sh, key);
    var total = Math.max(0, sh.getLastRow() - 1);
    if (total - mine.length + soups.length > MAX_ROWS) return fail_('full');
    var created = mine.length ? sh.getRange(mine[0], 1).getValue() : new Date();
    for (var i = mine.length - 1; i >= 0; i--) sh.deleteRow(mine[i]);
    var values = soups.map(function (s) { return [created, name, catName_(s.cat), s.dish, key]; });
    sh.getRange(sh.getLastRow() + 1, 1, values.length, COLS).setValues(values);
    sortByCategory_(sh);
    CacheService.getScriptCache().remove(CACHE_KEY);
  } finally {
    lock.releaseLock();
  }
  return listResult_(key);
}

/** Remove everything signed up under this edit key. */
function removeSignup(key) {
  key = String(key || '');
  if (!KEY_RE.test(key)) return fail_('key');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return fail_('busy');
  try {
    var sh = sheet_();
    var mine = rowsForKey_(sh, key);
    for (var i = mine.length - 1; i >= 0; i--) sh.deleteRow(mine[i]);
    CacheService.getScriptCache().remove(CACHE_KEY);
  } finally {
    lock.releaseLock();
  }
  return listResult_(key);
}

/* ---- organizers: every call needs a passcode from the Organizers tab ---- */

/** The full roster, with cook names. */
function getRoster(code) {
  var who = checkOrganizer_(code);
  if (!who.ok) return who;
  return rosterResult_(who.name);
}

/** Remove one soup (by the id shown in the roster). */
function organizerRemove(code, id) {
  var who = checkOrganizer_(code);
  if (!who.ok) return who;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return fail_('busy');
  try {
    var sh = sheet_();
    var hit = parseRows_(sh).filter(function (r) { return r.id === String(id); })[0];
    if (hit) sh.deleteRow(hit.row);
    CacheService.getScriptCache().remove(CACHE_KEY);
  } finally {
    lock.releaseLock();
  }
  return rosterResult_(who.name);
}

/** Change one soup's cook, category or soup name. */
function organizerEdit(code, id, change) {
  var who = checkOrganizer_(code);
  if (!who.ok) return who;
  change = change || {};
  var name = clip_(change.name, 60), cat = catId_(change.cat), dish = clip_(change.dish, 80);
  if (!name) return fail_('name');
  if (!cat) return fail_('soups');
  if (!dish) return fail_('dish');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return fail_('busy');
  try {
    var sh = sheet_();
    var hit = parseRows_(sh).filter(function (r) { return r.id === String(id); })[0];
    if (hit) {
      sh.getRange(hit.row, 2, 1, 3).setValues([[name, catName_(cat), dish]]);
      sortByCategory_(sh);
    }
    CacheService.getScriptCache().remove(CACHE_KEY);
  } finally {
    lock.releaseLock();
  }
  return rosterResult_(who.name);
}

function checkOrganizer_(code) {
  code = String(code || '').trim();
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('orgfails') || 0);
  if (fails >= MAX_ORGANIZER_FAILS) return fail_('locked');
  if (code.length >= 4) {
    var sh = organizersSheet_();
    var last = sh.getLastRow();
    if (last >= 2) {
      var rows = sh.getRange(2, 1, last - 1, 2).getValues();
      for (var i = 0; i < rows.length; i++) {
        var pass = String(rows[i][1] == null ? '' : rows[i][1]).trim();
        if (pass && pass === code) return { ok: true, name: clip_(rows[i][0], 60) || 'Organizer' };
      }
    }
  }
  cache.put('orgfails', String(fails + 1), 600);
  return fail_('passcode');
}

function rosterResult_(organizerName) {
  var all = parseRows_(sheet_());
  var rows = all.map(function (r) {
    return { id: r.id, name: r.name, cat: r.cat, dish: r.dish, created: r.created };
  }).sort(function (a, b) {
    return (catIndex_(a.cat) - catIndex_(b.cat)) || (a.created - b.created) || a.name.localeCompare(b.name);
  });
  var res = summary_(all);
  res.ok = true;
  res.organizer = organizerName;
  res.rows = rows;
  return res;
}

/* ---- helpers ---- */

function fail_(code) { return { ok: false, error: code }; }

function clip_(v, max) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function catIndex_(text) {
  var id = catId_(text);
  for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return i;
  return CATS.length;   // unknown categories go last
}

/** Keep the Sign-ups tab grouped by category (in the order on the flyer), then by sign-up time. */
function sortByCategory_(sh) {
  var last = sh.getLastRow();
  if (last < 3) return;
  var range = sh.getRange(2, 1, last - 1, COLS);
  var rows = range.getValues().map(function (v, i) { return { v: v, i: i }; });
  rows.sort(function (a, b) {
    var ta = a.v[0] instanceof Date ? a.v[0].getTime() : 0, tb = b.v[0] instanceof Date ? b.v[0].getTime() : 0;
    return (catIndex_(a.v[2]) - catIndex_(b.v[2])) || (ta - tb) || (a.i - b.i);
  });
  range.setValues(rows.map(function (r) { return r.v; }));
}

function catName_(id) {
  for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i].name;
  return '';
}

/** A category cell holds the category's name (typed by hand) or its id. */
function catId_(text) {
  var t = clip_(text, 40).toLowerCase();
  for (var i = 0; i < CATS.length; i++) {
    if (t === CATS[i].name.toLowerCase() || t === CATS[i].id) return CATS[i].id;
  }
  return '';
}

function cleanSoups_(raw) {
  var out = [], seen = {};
  (Array.isArray(raw) ? raw : []).forEach(function (s) {
    var cat = catId_(s && s.cat);
    if (!cat) return;
    var dish = clip_(s.dish, 80);
    var k = cat + '|' + dish.toLowerCase();
    if (dish && seen[k]) return;
    seen[k] = true;
    out.push({ cat: cat, dish: dish });
  });
  return out.slice(0, MAX_SOUPS_PER_COOK);
}

function idFor_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('').slice(0, 10);
}

/** Every complete row on the Sign-ups tab, with its row number. Rows missing a cook, a known category or a soup name are skipped. */
function parseRows_(sh) {
  var last = sh.getLastRow();
  var out = [];
  if (last < 2) return out;
  sh.getRange(2, 1, last - 1, COLS).getValues().forEach(function (v, i) {
    var name = clip_(v[1], 60), cat = catId_(v[2]), dish = clip_(v[3], 80);
    if (!name || !cat || !dish) return;
    var key = String(v[KEY_COL - 1] == null ? '' : v[KEY_COL - 1]).trim();
    var created = v[0] instanceof Date ? v[0].getTime() : (Date.parse(v[0]) || 0);
    out.push({
      row: i + 2,
      id: idFor_((key || ('m|' + name + '|' + created)) + '|' + cat + '|' + dish.toLowerCase()),
      name: name, cat: cat, dish: dish, key: key, created: created
    });
  });
  return out;
}

/** parseRows_ cached for a few seconds so many open pages do not each hit the sheet. */
function readRows_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_KEY);
  if (hit) {
    try { return JSON.parse(hit); } catch (e) { /* fall through and re-read */ }
  }
  var rows = parseRows_(sheet_());
  try { cache.put(CACHE_KEY, JSON.stringify(rows), 5); } catch (e) { /* too big to cache: fine */ }
  return rows;
}

/** Soups and counts per category. Never contains a cook's name. */
function summary_(rows) {
  var counts = {}, everyone = {};
  CATS.forEach(function (c) { counts[c.id] = { soups: 0, who: {} }; });
  rows.forEach(function (r) {
    var who = r.name.toLowerCase();
    counts[r.cat].soups++;
    counts[r.cat].who[who] = 1;
    everyone[who] = 1;
  });
  var out = {};
  CATS.forEach(function (c) { out[c.id] = { soups: counts[c.id].soups, cooks: Object.keys(counts[c.id].who).length }; });
  return { counts: out, cooks: Object.keys(everyone).length, soupTotal: rows.length };
}

function listResult_(key) {
  var rows = readRows_();
  var soups = rows.map(function (r) {
    return { id: r.id, cat: r.cat, dish: r.dish, mine: !!key && r.key === key };
  }).sort(function (a, b) {
    var x = a.dish.toLowerCase(), y = b.dish.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
  var me = null;
  if (key) {
    var mine = rows.filter(function (r) { return r.key === key; });
    if (mine.length) me = { name: mine[0].name, soups: mine.map(function (r) { return { cat: r.cat, dish: r.dish }; }) };
  }
  var res = summary_(rows);
  res.ok = true;
  res.soups = soups;
  res.me = me;
  return res;
}

function rowsForKey_(sh, key) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var keys = sh.getRange(2, KEY_COL, last - 1, 1).getValues();
  var out = [];
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).trim() === key) out.push(i + 2);
  }
  return out;
}

function spreadsheet_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_() {
  var ss = spreadsheet_();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (sh && String(sh.getRange(1, 3).getValue()) !== 'Category') {
    // An earlier layout of this tab: keep it as a backup and start a fresh one.
    var stamp = Math.floor(Date.now() / 1000);
    sh.setName('Old sign-ups ' + stamp);
    var oldTotals = ss.getSheetByName(TOTALS_NAME);
    if (oldTotals) oldTotals.setName('Old totals ' + stamp);
    sh = null;
  }
  return sh || createSheet_(ss);
}

function organizersSheet_() {
  var ss = spreadsheet_();
  return ss.getSheetByName(ORGANIZERS_NAME) || createOrganizers_(ss);
}

/** First run: lay out the Sign-ups, Totals and Organizers tabs. */
function createSheet_(ss) {
  var sheets = ss.getSheets();
  var sh;
  if (sheets.length === 1 && sheets[0].getLastRow() === 0) {
    sh = sheets[0];
    sh.setName(SHEET_NAME);
  } else {
    sh = ss.insertSheet(SHEET_NAME, 0);
  }
  sh.getRange(1, 1, 1, COLS).setValues([['Signed up', 'Cook', 'Category', 'Soup name', 'Edit key (page use only)']])
    .setFontWeight('bold').setFontColor('#FBF5E6').setBackground('#14264A').setVerticalAlignment('middle');
  sh.getRange('B:D').setNumberFormat('@');            // plain text, so nothing typed on the page can run as a formula
  sh.getRange('A:A').setNumberFormat('mmm d, h:mm AM/PM');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 130); sh.setColumnWidth(2, 190); sh.setColumnWidth(3, 150); sh.setColumnWidth(4, 260);
  sh.getRange('C2:C').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(CATS.map(function (c) { return c.name; }), true).setAllowInvalid(false).build());
  sh.setConditionalFormatRules(CATS.map(function (c) {
    return SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(c.name)
      .setBackground(c.color).setFontColor(c.ink).setRanges([sh.getRange('C2:C')]).build();
  }));
  sh.hideColumns(KEY_COL);                              // each cook's private edit key lives here
  createTotals_(ss);
  organizersSheet_();
  return sh;
}

function createTotals_(ss) {
  if (ss.getSheetByName(TOTALS_NAME)) return;
  var t = ss.insertSheet(TOTALS_NAME);
  var q = "'" + SHEET_NAME + "'!";
  t.getRange('A1').setValue('Soup Cook Off · Monday, October 19 · 12:00 PM · QA Room')
    .setFontWeight('bold').setFontSize(14);
  t.getRange('A3:C3').setValues([['Category', 'Soups', 'Cooks']]).setFontWeight('bold');
  CATS.forEach(function (c, i) {
    var inCat = q + 'C2:C="' + c.name + '"';
    t.getRange(4 + i, 1).setValue(c.name).setBackground(c.color).setFontColor(c.ink).setFontWeight('bold');
    t.getRange(4 + i, 2).setFormula('=COUNTIF(' + q + 'C2:C,"' + c.name + '")');
    t.getRange(4 + i, 3).setFormula('=IFERROR(COUNTA(UNIQUE(FILTER(' + q + 'B2:B,' + inCat + '))),0)');
  });
  t.getRange('A9').setValue('Everyone').setFontWeight('bold');
  t.getRange('B9').setFormula('=COUNTA(' + q + 'D2:D)');
  t.getRange('C9').setFormula('=IFERROR(COUNTA(UNIQUE(FILTER(' + q + 'B2:B,' + q + 'B2:B<>""))),0)');
  t.setColumnWidth(1, 220);
  t.getRange('B3:C9').setHorizontalAlignment('center');
}

function createOrganizers_(ss) {
  var o = ss.insertSheet(ORGANIZERS_NAME);
  var id = Utilities.getUuid().replace(/-/g, '');
  o.getRange('A1:B1').setValues([['Organizer name', 'Passcode']])
    .setFontWeight('bold').setFontColor('#FBF5E6').setBackground('#14264A');
  o.getRange('B:B').setNumberFormat('@');             // keep passcodes like 004512 exactly as typed
  o.getRange('A2:B2').setValues([['You (change this name)', id.slice(0, 4) + '-' + id.slice(4, 8)]]);
  o.getRange('D1').setValue('How organizers work').setFontWeight('bold');
  o.getRange('D2').setValue('Each row is one organizer. Add a row with a name and a passcode (4 or more characters) to add someone. Delete a row to remove them.');
  o.getRange('D3').setValue('To see the roster with cook names, open the sign-up link, tap "Organizer sign-in" at the bottom, and enter a passcode from this tab.');
  o.getRange('D4').setValue('Anyone who can open this spreadsheet can read these passcodes, so share the sheet only with organizers.');
  o.setColumnWidth(1, 220); o.setColumnWidth(2, 140); o.setColumnWidth(4, 520);
  o.getRange('D2:D4').setWrap(true);
  return o;
}
