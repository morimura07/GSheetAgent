// What google.script.run calls from the phone app. Errors come back as results
// (not thrown) so the app can show them next to the right fields.

import type { ApiResult, Boot } from './forms';
import { FormError, boot } from './service';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

const WORKBOOK_KEY = 'WORKBOOK_ID';

/** Remembers which spreadsheet the phone app writes to (set by "Set up workbook"). */
export function rememberWorkbook(ss: Spreadsheet): void {
  PropertiesService.getScriptProperties().setProperty(WORKBOOK_KEY, ss.getId());
}

/** The workbook: a web app has no active spreadsheet, so it is opened by its saved ID. */
export function workbook(): Spreadsheet {
  const id = PropertiesService.getScriptProperties().getProperty(WORKBOOK_KEY);
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  throw new Error('Open the workbook and run Agent Tracker > Set up workbook once.');
}

export function loadBoot(): Boot {
  return boot(workbook());
}

export function respond(action: (ss: Spreadsheet) => string): ApiResult {
  try {
    const ss = workbook();
    const message = action(ss);
    SpreadsheetApp.flush();
    return { ok: true, message, boot: boot(ss, { reuseLists: true }) };
  } catch (err) {
    if (err instanceof FormError) return { ok: false, errors: err.errors };
    console.error(err);
    return { ok: false, error: (err as Error).message };
  }
}
