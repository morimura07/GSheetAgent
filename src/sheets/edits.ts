// Fills the columns the user should not have to type: IDs, Created, lead Cost
// and Status date. Runs from the onEdit trigger, and directly after script writes
// (script writes do not fire onEdit).

import {
  DATA_TABS,
  SETTINGS_TAB,
  columnNumber,
  settingsTableStart,
  type DataTab,
} from '../config/schema';
import { formatId, nextIdNumber, rowNeedsId } from '../lib/ids';
import { leadCostOn } from '../lib/rates';
import { getMeta, setMeta, toIsoDate, today, withDocumentLock } from './util';

type Sheet = GoogleAppsScript.Spreadsheet.Sheet;

const COMPUTED = new Set(['id', 'formula', 'timestamp']);

export function handleEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  const sheet = e.range.getSheet();
  const tab = DATA_TABS.find((t) => t.name === sheet.getName());
  if (!tab) return;

  const first = Math.max(e.range.getRow(), 2);
  const last = e.range.getLastRow();
  if (last < first) return;

  const statusCol = tab.columns.some((c) => c.key === 'statusDate')
    ? columnNumber(tab, 'status')
    : 0;
  const statusEdited =
    statusCol > 0 && e.range.getColumn() <= statusCol && statusCol <= e.range.getLastColumn();

  fillAutoColumns(sheet, tab, first, last, { statusEdited });
}

export function fillAutoColumns(
  sheet: Sheet,
  tab: DataTab,
  first: number,
  last: number,
  opts: { statusEdited: boolean },
): void {
  withDocumentLock(() => {
    const n = last - first + 1;
    const rows = sheet.getRange(first, 1, n, tab.columns.length).getValues();
    const changed = computeAutoColumns(sheet, tab, rows, opts);

    // Write back only the columns this function owns, so formulas and user input are untouched.
    for (const i of changed) {
      sheet.getRange(first, i + 1, n, 1).setValues(rows.map((row) => [row[i]]));
    }
  });
}

/**
 * Fills IDs, Created, lead Cost and Status date in `rows` (in place) and returns
 * the indexes of the columns it changed. Call under the document lock.
 */
export function computeAutoColumns(
  sheet: Sheet,
  tab: DataTab,
  rows: unknown[][],
  opts: { statusEdited: boolean },
): Set<number> {
  const ss = sheet.getParent();
  const idx = (key: string) => columnNumber(tab, key) - 1;
  const has = (key: string) => tab.columns.some((c) => c.key === key);
  const changed = new Set<number>();
  const set = (r: number, i: number, v: unknown) => {
    rows[r][i] = v;
    changed.add(i);
  };

  const idIndex = tab.columns.findIndex((c) => c.type === 'id');
  const entryIndexes = tab.columns.flatMap((c, i) => (COMPUTED.has(c.type) ? [] : [i]));
  const needsId = rows.map((row) => rowNeedsId(row, idIndex, entryIndexes));

  if (needsId.some(Boolean)) {
    const key = `nextId:${tab.name}`;
    const existing =
      sheet.getLastRow() > 1
        ? sheet
            .getRange(2, idIndex + 1, sheet.getLastRow() - 1, 1)
            .getValues()
            .map((r) => r[0])
        : [];
    let next = nextIdNumber(tab.idPrefix, existing, Number(getMeta(ss, key) ?? 0));
    const now = new Date();
    needsId.forEach((needs, r) => {
      if (!needs) return;
      set(r, idIndex, formatId(tab.idPrefix, next++));
      if (has('createdAt') && rows[r][idx('createdAt')] === '') set(r, idx('createdAt'), now);
    });
    setMeta(ss, key, String(next));
  }

  if (tab.name === 'Leads') {
    const costs = readLeadCosts(ss);
    rows.forEach((row, r) => {
      const date = row[idx('dateReceived')];
      const type = String(row[idx('leadType')]);
      if (row[idx('cost')] !== '' || !type || !(date instanceof Date)) return;
      const cost = leadCostOn(costs, type, toIsoDate(ss, date));
      if (cost !== undefined) set(r, idx('cost'), cost);
    });
  }

  if (opts.statusEdited && has('statusDate')) {
    const d = today();
    rows.forEach((row, r) => {
      if (row[idx('status')] !== '') set(r, idx('statusDate'), d);
    });
  }
  return changed;
}

function readLeadCosts(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
  const sheet = ss.getSheetByName(SETTINGS_TAB);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const start = settingsTableStart('LeadCosts');
  return sheet
    .getRange(2, start, sheet.getLastRow() - 1, 3)
    .getValues()
    .filter(([type, cost, from]) => type !== '' && cost !== '' && from instanceof Date)
    .map(([type, cost, from]) => ({
      leadType: String(type),
      cost: Number(cost),
      from: toIsoDate(ss, from as Date),
    }));
}
