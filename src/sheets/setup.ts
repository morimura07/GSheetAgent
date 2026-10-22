// Builds or repairs the workbook from config/schema.ts. Safe to run again:
// it never deletes entered data, and seeds Lists/Settings only when they are empty.

import {
  DATA_ROWS,
  DATA_TABS,
  LISTS_TAB,
  SETTINGS_LISTS,
  SETTINGS_TAB,
  SETTINGS_TABLES,
  SIMPLE_LISTS,
  columnNumber,
  dataTab,
  settingsTableStart,
  type Column,
  type ColumnType,
  type DataTab,
} from '../config/schema';
import { headerFormula } from '../lib/columns';
import { DASHBOARD, REPORT_TABS, setupReportInputs, setupReports } from './reports';
import { isoToDate } from '../lib/rows';
import { ensureSheet, ensureSize } from './util';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
type Sheet = GoogleAppsScript.Spreadsheet.Sheet;
type Range = GoogleAppsScript.Spreadsheet.Range;

const PROTECTION_TAG = 'gsa:auto';
export const TAB_ORDER: string[] = [
  ...REPORT_TABS,
  ...DATA_TABS.map((t) => t.name),
  LISTS_TAB,
  SETTINGS_TAB,
];

const FORMATS: Partial<Record<ColumnType, string>> = {
  id: '@',
  text: '@',
  ref: '@',
  list: '@',
  date: 'mm/dd/yyyy',
  timestamp: 'mm/dd/yyyy h:mm am/pm',
  time: 'h:mm am/pm',
  currency: '$#,##0.00',
  number: '0',
  percent: '0%',
};

/** `lap(step)` is called after each step (the self-test uses it to time setup). */
export function setupWorkbook(ss: Spreadsheet, lap: (step: string) => void = () => {}): void {
  const named = new Map(ss.getNamedRanges().map((n) => [n.getName(), n]));
  const nameRange = (name: string, range: Range) => {
    const existing = named.get(name);
    if (existing) existing.setRange(range);
    else ss.setNamedRange(name, range);
  };

  // A first setup (e.g. in the client's copy of the template) takes the script's
  // time zone (Oklahoma). Later setups leave it: changing it moves typed times.
  if (!ss.getSheetByName(DATA_TABS[0].name)) ss.setSpreadsheetTimeZone(Session.getScriptTimeZone());

  setupLists(ensureSheet(ss, LISTS_TAB), nameRange);
  lap('lists');
  setupSettings(ss, ensureSheet(ss, SETTINGS_TAB), nameRange);
  setupReportInputs(ss, nameRange); // rep_asOf: used by Policies formulas
  lap('settings');

  // Every data tab needs its headers before any cross-tab formula is written.
  const sheets = DATA_TABS.map((tab) => {
    const sheet = ensureSheet(ss, tab.name);
    ensureSize(sheet, DATA_ROWS + 1, tab.columns.length);
    sheet.getRange(1, 1, 1, tab.columns.length).setValues([tab.columns.map((c) => c.header)]);
    return sheet;
  });
  lap('headers');
  DATA_TABS.forEach((tab, i) => setupDataTab(ss, sheets[i], tab, lap));
  setupReports(ss, lap);

  TAB_ORDER.forEach((name, i) => {
    ss.setActiveSheet(ensureSheet(ss, name));
    ss.moveActiveSheet(i + 1);
  });
  removeEmptyDefaultSheet(ss);
  ss.setActiveSheet(ss.getSheetByName(DASHBOARD)!);
  lap('order');
}

function setupLists(sheet: Sheet, nameRange: (name: string, range: Range) => void): void {
  const entries = Object.entries(SIMPLE_LISTS);
  const longest = Math.max(...entries.map(([, l]) => l.seed.length));
  ensureSize(sheet, Math.max(DATA_ROWS, longest) + 1, entries.length);

  entries.forEach(([name, list], i) => {
    const col = i + 1;
    sheet.getRange(1, col).setValue(list.header);
    if (sheet.getRange(2, col).isBlank() && list.seed.length) {
      sheet.getRange(2, col, list.seed.length, 1).setValues(list.seed.map((v) => [v]));
    }
    nameRange(`list_${name}`, sheet.getRange(2, col, sheet.getMaxRows() - 1, 1));
    sheet.setColumnWidth(col, 190);
  });

  styleHeader(sheet.getRange(1, 1, 1, entries.length), '#5f6368');
  sheet.setFrozenRows(1);
  sheet.setTabColor('#5f6368');
}

function setupSettings(
  ss: Spreadsheet,
  sheet: Sheet,
  nameRange: (name: string, range: Range) => void,
): void {
  const width = SETTINGS_TABLES.reduce((n, t) => n + t.columns.length + 1, 0);
  ensureSize(sheet, 200, width);
  const bodyRows = sheet.getMaxRows() - 1;

  for (const table of SETTINGS_TABLES) {
    const start = settingsTableStart(table.key);
    sheet
      .getRange(1, start, 1, table.columns.length)
      .setValues([table.columns.map((c) => c.header)]);
    styleHeader(sheet.getRange(1, start, 1, table.columns.length), '#5f6368');

    table.columns.forEach((c, j) => {
      const body = sheet.getRange(2, start + j, bodyRows, 1);
      formatBody(ss, body, c);
      nameRange(`set_${table.key}_${c.key}`, body);
      sheet.setColumnWidth(start + j, 150);
    });

    if (sheet.getRange(2, start).isBlank() && table.seed.length) {
      const rows = table.seed.map((row) =>
        row.map((v, j) => (table.columns[j].type === 'date' ? isoToDate(String(v)) : v)),
      );
      sheet.getRange(2, start, rows.length, table.columns.length).setValues(rows);
    }
    sheet.setColumnWidth(start + table.columns.length, 24);
  }

  for (const [name, src] of Object.entries(SETTINGS_LISTS)) {
    const table = SETTINGS_TABLES.find((t) => t.key === src.table)!;
    const col =
      settingsTableStart(table.key) + table.columns.findIndex((c) => c.key === src.column);
    nameRange(`list_${name}`, sheet.getRange(2, col, bodyRows, 1));
  }

  sheet.setFrozenRows(1);
  sheet.setTabColor('#5f6368');
}

function setupDataTab(
  ss: Spreadsheet,
  sheet: Sheet,
  tab: DataTab,
  lap: (step: string) => void,
): void {
  const bodyRows = sheet.getMaxRows() - 1;
  const header = sheet.getRange(1, 1, 1, tab.columns.length);
  styleHeader(header, tab.color);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  sheet.setTabColor(tab.color);

  tab.columns.forEach((c, i) => {
    const col = i + 1;
    const body = sheet.getRange(2, col, bodyRows, 1);
    if (c.type === 'formula') {
      // Stray values under an array formula break it (#REF!); these cells are computed anyway.
      body.clearContent();
      sheet.getRange(1, col).setFormula(headerFormula(c.header, c.formula!, tab));
    }
    formatBody(ss, body, c);
    sheet.setColumnWidth(col, c.width ?? 120);
  });
  header.setNotes([tab.columns.map((c) => c.note ?? '')]);
  lap(`${tab.name} columns`);

  sheet.setConditionalFormatRules(warningRules(sheet, tab));
  protectComputedColumns(sheet, tab);
  lap(`${tab.name} protect`);
}

type CellSpec = Pick<Column, 'type' | 'list' | 'refTab' | 'format'>;

function formatBody(ss: Spreadsheet, body: Range, c: CellSpec): void {
  const format = c.format || FORMATS[c.type];
  if (format) body.setNumberFormat(format);

  const rule = validationFor(ss, c);
  if (rule) body.setDataValidation(rule);
  else body.clearDataValidations();
}

function validationFor(
  ss: Spreadsheet,
  c: CellSpec,
): GoogleAppsScript.Spreadsheet.DataValidation | null {
  const v = SpreadsheetApp.newDataValidation().setAllowInvalid(false);
  switch (c.type) {
    case 'date':
      return v.requireDate().setHelpText('Enter a date, e.g. 10/21/2026').build();
    case 'currency':
    case 'number':
      return v.requireNumberGreaterThanOrEqualTo(0).setHelpText('Enter a number').build();
    case 'percent':
      return v.requireNumberBetween(0, 1).setHelpText('Enter a percentage, e.g. 50%').build();
    case 'checkbox':
      return v.requireCheckbox().build();
    case 'list':
      return v.requireValueInRange(ss.getRangeByName(`list_${c.list}`)!, true).build();
    case 'ref': {
      const target = dataTab(c.refTab!);
      const idCol = columnNumber(target, target.columns.find((x) => x.type === 'id')!.key);
      const ids = ss.getSheetByName(target.name)!.getRange(2, idCol, DATA_ROWS, 1);
      return v
        .requireValueInRange(ids, true)
        .setHelpText(`Pick an existing ${target.name} ID`)
        .build();
    }
    default:
      return null;
  }
}

/** Red cells for lookups that failed or need checking. */
function warningRules(
  sheet: Sheet,
  tab: DataTab,
): GoogleAppsScript.Spreadsheet.ConditionalFormatRule[] {
  const rules: GoogleAppsScript.Spreadsheet.ConditionalFormatRule[] = [];
  const bodyRows = sheet.getMaxRows() - 1;
  tab.columns.forEach((c, i) => {
    if (c.type !== 'formula') return;
    const body = sheet.getRange(2, i + 1, bodyRows, 1);
    for (const text of ['Unknown', 'Check', '?']) {
      rules.push(
        SpreadsheetApp.newConditionalFormatRule()
          .whenTextStartsWith(text)
          .setBackground('#fce8e6')
          .setFontColor('#c5221f')
          .setRanges([body])
          .build(),
      );
    }
    if (c.warn) {
      const rule = SpreadsheetApp.newConditionalFormatRule();
      if (c.warn === 'notOne') rule.whenNumberNotEqualTo(1);
      else rule.whenNumberLessThan(0);
      rules.push(rule.setBackground('#fce8e6').setFontColor('#c5221f').setRanges([body]).build());
    }
  });
  return rules;
}

/** Warning-only protection: the header row and columns the script or formulas fill. */
function protectComputedColumns(sheet: Sheet, tab: DataTab): void {
  for (const p of sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE)) {
    if (p.getDescription().startsWith(PROTECTION_TAG)) p.remove();
  }
  const protect = (range: Range, what: string) =>
    range.protect().setDescription(`${PROTECTION_TAG} ${what}`).setWarningOnly(true);

  protect(sheet.getRange(1, 1, 1, tab.columns.length), 'header');
  tab.columns.forEach((c, i) => {
    if (c.type === 'id' || c.type === 'formula' || c.type === 'timestamp') {
      protect(sheet.getRange(2, i + 1, sheet.getMaxRows() - 1, 1), c.key);
    }
  });
}

function styleHeader(range: Range, color: string): void {
  range
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground(color)
    .setWrap(true)
    .setVerticalAlignment('middle');
}

/** Deletes the blank "Sheet1" a new spreadsheet starts with; leaves any other tab alone. */
function removeEmptyDefaultSheet(ss: Spreadsheet): void {
  const sheet = ss.getSheetByName('Sheet1');
  if (sheet && sheet.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sheet);
}
