// Reading and writing data-tab rows as `{ key: value }` records.

import { columnNumber, dataTab, type DataTab, type DataTabName } from '../config/schema';
import { rowFromObject } from '../lib/rows';
import { computeAutoColumns } from './edits';
import { withDocumentLock } from './util';

type Rec = Record<string, unknown>;
type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
type Sheet = GoogleAppsScript.Spreadsheet.Sheet;

/**
 * Appends records with IDs and other automatic columns filled, and returns them
 * with their IDs. Everything is worked out first and written in one pass, so the
 * sheet is not read back (each read after a write waits for a recalculation).
 */
export function appendRecords(ss: Spreadsheet, tabName: DataTabName, records: Rec[]): Rec[] {
  const tab = dataTab(tabName);
  const sheet = ss.getSheetByName(tab.name)!;
  const idIndex = idColumn(tab) - 1;
  return withDocumentLock(() => {
    const first = lastIdRow(sheet, tab) + 1;
    // Unticked checkboxes hold FALSE, as Sheets itself stores them.
    const rows = records.map((rec) =>
      rowFromObject(tab, rec).map((v, i) =>
        v === '' && tab.columns[i].type === 'checkbox' ? false : v,
      ),
    );
    computeAutoColumns(sheet, tab, rows, { statusEdited: true });

    // Formula columns are skipped so their array formulas are left intact: one
    // write per run of side-by-side non-formula columns.
    for (const [from, to] of writableRuns(tab)) {
      const values = rows.map((row) => row.slice(from, to + 1));
      if (values.some((row) => row.some((v) => v !== ''))) {
        sheet.getRange(first, from + 1, records.length, to - from + 1).setValues(values);
      }
    }
    return records.map((rec, r) => ({ ...rec, [tab.columns[idIndex].key]: rows[r][idIndex] }));
  });
}

/** Every row that has an ID, with its sheet row number. One read of the tab. */
export function readRecords(ss: Spreadsheet, tabName: DataTabName): { row: number; rec: Rec }[] {
  const tab = dataTab(tabName);
  const sheet = ss.getSheetByName(tab.name)!;
  const idIndex = idColumn(tab) - 1;
  return sheet
    .getRange(2, 1, sheet.getMaxRows() - 1, tab.columns.length)
    .getValues()
    .flatMap((row, r) =>
      row[idIndex] === ''
        ? []
        : [{ row: r + 2, rec: Object.fromEntries(tab.columns.map((c, i) => [c.key, row[i]])) }],
    );
}

/** Writes the given entry columns of one existing row; other cells are untouched. */
export function updateRecord(
  ss: Spreadsheet,
  tabName: DataTabName,
  row: number,
  values: Rec,
): void {
  const tab = dataTab(tabName);
  const sheet = ss.getSheetByName(tab.name)!;
  rowFromObject(tab, values); // throws on unknown keys
  for (const [key, value] of Object.entries(values)) {
    const c = tab.columns[columnNumber(tab, key) - 1];
    if (c.type === 'formula' || c.type === 'id') throw new Error(`${key} is filled automatically`);
    sheet.getRange(row, columnNumber(tab, key)).setValue(value ?? '');
  }
}

/** [first, last] 0-based indexes of each run of adjacent non-formula columns. */
function writableRuns(tab: DataTab): [number, number][] {
  const runs: [number, number][] = [];
  tab.columns.forEach((c, i) => {
    if (c.type === 'formula') return;
    const last = runs[runs.length - 1];
    if (last && last[1] === i - 1) last[1] = i;
    else runs.push([i, i]);
  });
  return runs;
}

const idColumn = (tab: DataTab) => columnNumber(tab, tab.columns.find((c) => c.type === 'id')!.key);

/**
 * Last row with an ID (1 if none). getLastRow() is no good here: unticked
 * checkboxes hold FALSE all the way down the sheet.
 */
export function lastIdRow(sheet: Sheet, tab: DataTab): number {
  const ids = sheet.getRange(2, idColumn(tab), sheet.getMaxRows() - 1, 1).getValues();
  for (let r = ids.length - 1; r >= 0; r--) if (ids[r][0] !== '') return r + 2;
  return 1;
}
