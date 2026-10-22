type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
type Sheet = GoogleAppsScript.Spreadsheet.Sheet;

export function ensureSheet(ss: Spreadsheet, name: string): Sheet {
  return ss.getSheetByName(name) ?? ss.insertSheet(name);
}

/** Grows the sheet to at least `rows` x `cols`; never shrinks it. */
export function ensureSize(sheet: Sheet, rows: number, cols: number): void {
  const maxRows = sheet.getMaxRows();
  if (maxRows < rows) sheet.insertRowsAfter(maxRows, rows - maxRows);
  const maxCols = sheet.getMaxColumns();
  if (maxCols < cols) sheet.insertColumnsAfter(maxCols, cols - maxCols);
}

export function toIsoDate(ss: Spreadsheet, d: Date): string {
  return Utilities.formatDate(d, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
}

export function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Key/value state stored on the spreadsheet itself (travels with copies of the
// workbook, unlike script properties which belong to the bound script).
function findMeta(ss: Spreadsheet, key: string) {
  return ss
    .createDeveloperMetadataFinder()
    .withKey(key)
    .withLocationType(SpreadsheetApp.DeveloperMetadataLocationType.SPREADSHEET)
    .find()[0];
}

export function getMeta(ss: Spreadsheet, key: string): string | null {
  return findMeta(ss, key)?.getValue() ?? null;
}

export function setMeta(ss: Spreadsheet, key: string, value: string): void {
  const existing = findMeta(ss, key);
  if (existing) existing.setValue(value);
  else ss.addDeveloperMetadata(key, value);
}

/** Runs `fn` under the document lock when one is available (it is in bound scripts). */
export function withDocumentLock<T>(fn: () => T): T {
  const lock = LockService.getDocumentLock();
  if (!lock) return fn();
  lock.waitLock(10_000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
