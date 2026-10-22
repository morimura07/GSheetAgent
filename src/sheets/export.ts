// The monthly Excel copy: every tab's values (reports included, as they are on
// the day of the copy) written as an .xlsx file into a Drive folder the script
// owns. Made the first time the phone app opens in a new month, or any time from
// the menu. No formulas: the copy is a snapshot that opens anywhere.

import { excelSerial, xlsxParts, XLSX_MIME, type XlsxCell, type XlsxSheet } from '../lib/xlsx';
import { appFolder, createFile, type DriveFile } from './drive';
import { TAB_ORDER } from './setup';
import { getMeta, setMeta, withDocumentLock } from './util';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

const FOLDER_KEY = 'exportsFolderId';
const LAST_EXPORT_KEY = 'lastExportMonth';

export function exportToExcel(ss: Spreadsheet, now = new Date()): DriveFile {
  const { blob, name } = excelFile(ss, now);
  return createFile(appFolder(ss, FOLDER_KEY, 'Excel copies'), blob, name, XLSX_MIME);
}

/** The .xlsx file itself (the self-test unzips and checks it). */
export function excelFile(
  ss: Spreadsheet,
  now = new Date(),
): { blob: GoogleAppsScript.Base.Blob; name: string } {
  const tz = ss.getSpreadsheetTimeZone();
  const sheets: XlsxSheet[] = [];
  for (const name of TAB_ORDER) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) continue;
    const values = trim(sheet.getDataRange().getValues());
    sheets.push({
      name,
      rows: values.map((row) => row.map((v) => cell(v, tz))),
      widths: widths(values),
    });
  }
  const stamp = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const fileName = `${ss.getName()} ${stamp}.xlsx`;
  const blobs = Object.entries(xlsxParts(sheets)).map(([path, xml]) =>
    Utilities.newBlob(xml, 'application/xml', path),
  );
  return { blob: Utilities.zip(blobs, fileName).setContentType(XLSX_MIME), name: fileName };
}

/** Makes this month's copy if there is none yet; returns it, or null if it already existed. */
export function monthlyExportIfDue(ss: Spreadsheet, now = new Date()): DriveFile | null {
  const month = Utilities.formatDate(now, ss.getSpreadsheetTimeZone(), 'yyyy-MM');
  // Claim the month under the lock, then export without holding it, so saves
  // from the phone are not kept waiting while the copy is written.
  const previous = withDocumentLock(() => {
    const last = getMeta(ss, LAST_EXPORT_KEY);
    if (last !== month) setMeta(ss, LAST_EXPORT_KEY, month);
    return last;
  });
  if (previous === month) return null;
  try {
    return exportToExcel(ss, now);
  } catch (err) {
    withDocumentLock(() => setMeta(ss, LAST_EXPORT_KEY, previous ?? ''));
    throw err;
  }
}

/** Column widths (characters) from the longest text in each column, 8 to 40. */
function widths(values: unknown[][]): number[] {
  return (values[0] ?? []).map((_, c) => {
    const longest = Math.max(...values.slice(0, 200).map((r) => String(r[c] ?? '').length));
    return Math.min(40, Math.max(8, longest + 2));
  });
}

/** Sheet values as Excel cells; dates keep the wall-clock time of the workbook's time zone. */
function cell(v: unknown, tz: string): XlsxCell {
  if (v instanceof Date) {
    const [y, m, d, h, min, s] = Utilities.formatDate(v, tz, 'yyyy,M,d,H,m,s')
      .split(',')
      .map(Number);
    const serial = excelSerial(y, m, d, h, min, s);
    return { serial, time: h + min + s > 0 };
  }
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v;
  return null;
}

/** Drops empty rows and columns at the end (array formulas leave blank cells). */
function trim(values: unknown[][]): unknown[][] {
  const blank = (v: unknown) => v === '' || v === null;
  let rows = values.length;
  while (rows > 1 && values[rows - 1].every(blank)) rows--;
  let cols = values[0]?.length ?? 0;
  while (cols > 1 && values.slice(0, rows).every((r) => blank(r[cols - 1]))) cols--;
  return values.slice(0, rows).map((r) => r.slice(0, cols));
}
