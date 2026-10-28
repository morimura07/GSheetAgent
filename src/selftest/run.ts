// Runs the integration tests against a dedicated SELF-TEST spreadsheet that is
// wiped at the start of every run. It never touches the workbook the script is bound to.

import { runCases, type TestResult } from './harness';
import { PHASE1_CASES } from './phase1';
import { PHASE2_CASES } from './phase2';
import { PHASE3_CASES } from './phase3';
import { PHASE4_CASES } from './phase4';
import { PHASE5_CASES } from './phase5';
import { PHASE6_CASES } from './phase6';
import { PHASE7_CASES } from './phase7';

declare const __BUILD_VERSION__: string;

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

const SPREADSHEET_KEY = 'SELFTEST_SPREADSHEET_ID';

const SUITES = {
  phase1: PHASE1_CASES,
  phase2: PHASE2_CASES,
  phase3: PHASE3_CASES,
  phase4: PHASE4_CASES,
  phase5: PHASE5_CASES,
  phase6: PHASE6_CASES,
  phase7: PHASE7_CASES,
};
export type Suite = keyof typeof SUITES;

export interface SelfTestReport {
  suite: Suite;
  build: string;
  spreadsheetUrl: string;
  passed: number;
  failed: number;
  ms: number;
  results: TestResult[];
}

export function runSelfTest(suite: Suite): SelfTestReport {
  const start = Date.now();
  const ss = selfTestSpreadsheet();
  resetSpreadsheet(ss);
  const results = runCases(ss, SUITES[suite]);
  return {
    suite,
    build: __BUILD_VERSION__,
    spreadsheetUrl: ss.getUrl(),
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    ms: Date.now() - start,
    results,
  };
}

function selfTestSpreadsheet(): Spreadsheet {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(SPREADSHEET_KEY);
  if (id) {
    try {
      return SpreadsheetApp.openById(id);
    } catch {
      // Deleted or no access: make a new one.
    }
  }
  const ss = SpreadsheetApp.create('Agent Tracker (SELF-TEST - wiped on every run)');
  props.setProperty(SPREADSHEET_KEY, ss.getId());
  return ss;
}

/** Back to a blank spreadsheet: one empty Sheet1, no named ranges, no metadata. */
function resetSpreadsheet(ss: Spreadsheet): void {
  if (ss.getId() === SpreadsheetApp.getActiveSpreadsheet()?.getId()) {
    throw new Error('Refusing to reset the bound workbook');
  }
  const blank = ss.insertSheet(`reset-${Date.now()}`);
  for (const sheet of ss.getSheets())
    if (sheet.getSheetId() !== blank.getSheetId()) ss.deleteSheet(sheet);
  blank.setName('Sheet1');
  for (const n of ss.getNamedRanges()) n.remove();
  for (const m of ss.createDeveloperMetadataFinder().find()) m.remove();
  // Times are written in the script's zone; read them back in the same one.
  ss.setSpreadsheetTimeZone(Session.getScriptTimeZone());
  SpreadsheetApp.flush();
}
