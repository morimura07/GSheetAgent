// Apps Script entry points. Every export becomes a top-level function in
// dist/Code.js (see build.mjs), so menus and triggers can call it by name.

import { loadBoot, rememberWorkbook, respond, workbook } from './app/api';
import type { ApiResult, Boot, ReadResult, ReceiptUpload } from './app/forms';
import {
  readContactScreenshots,
  saveClient,
  saveExpense,
  saveLead,
  shiftAction,
  tripAction,
  type Screenshot,
  type ShiftAction,
  type TripAction,
} from './app/service';
import { runSelfTest, type Suite } from './selftest/run';
import { sampleImages } from './selftest/samples';
import { handleEdit } from './sheets/edits';
import { ocrImage } from './sheets/ocr';
import { setupWorkbook } from './sheets/setup';
import { loadTestData as loadTestDataImpl } from './sheets/testData';

declare const __BUILD_VERSION__: string;

export function onOpen(): void {
  SpreadsheetApp.getUi()
    .createMenu('Agent Tracker')
    .addItem('Set up workbook', 'runSetup')
    .addItem('Phone app link', 'showPhoneAppLink')
    .addSeparator()
    .addItem('Load test data (DEV only)', 'loadTestData')
    .addItem('Run self-test (DEV only)', 'selfTest')
    .addItem('About', 'showAbout')
    .addToUi();
}

export function onEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  handleEdit(e);
}

export function runSetup(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Building tabs, dropdowns and formulas…', 'Agent Tracker', -1);
  setupWorkbook(ss);
  rememberWorkbook(ss);
  ss.toast('Workbook is ready.', 'Agent Tracker', 5);
}

/** For `clasp run` (no spreadsheet is open there): set up the workbook with this ID. */
export function setupWorkbookById(id: string): string {
  const ss = SpreadsheetApp.openById(id);
  setupWorkbook(ss);
  rememberWorkbook(ss);
  return `Set up ${ss.getName()}`;
}

export function showPhoneAppLink(): void {
  const url = ScriptApp.getService().getUrl();
  const ui = SpreadsheetApp.getUi();
  if (!url) {
    ui.alert('The phone app is not deployed yet.');
    return;
  }
  const html = HtmlService.createHtmlOutput(
    `<p style="font-family:sans-serif">Open this on your phone in Chrome (signed in to this Google
     account), then tap &#8942; &gt; Add to Home screen:</p>
     <p style="font-family:sans-serif;word-break:break-all"><a href="${url}" target="_blank">${url}</a></p>`,
  )
    .setWidth(420)
    .setHeight(180);
  ui.showModalDialog(html, 'Phone app');
}

export function loadTestData(): void {
  const result = loadTestDataImpl(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getUi().alert(result.message);
}

export function showAbout(): void {
  const ui = SpreadsheetApp.getUi();
  ui.alert('Agent Tracker', `Build ${__BUILD_VERSION__}`, ui.ButtonSet.OK);
}

// ---- Phone app (web app) ----------------------------------------------------

export function doGet(): GoogleAppsScript.HTML.HtmlOutput {
  return HtmlService.createHtmlOutputFromFile('App')
    .setTitle('Agent Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

export function appBoot(): Boot {
  return loadBoot();
}

export function appSaveLead(input: unknown): ApiResult {
  return respond((ss) => saveLead(ss, input));
}

export function appSaveClient(input: {
  client?: unknown;
  policy?: unknown;
  leadId?: unknown;
  beneficiaries?: unknown;
}): ApiResult {
  return respond((ss) => saveClient(ss, input));
}

/** Contact screenshots → new-client form values (nothing is saved). */
export function appReadContact(shots: Screenshot[]): ReadResult {
  try {
    return { ok: true, draft: readContactScreenshots(workbook(), shots) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function appShift(action: ShiftAction, input: unknown): ApiResult {
  return respond((ss) => shiftAction(ss, action, input));
}

export function appTrip(action: TripAction, input: unknown): ApiResult {
  return respond((ss) => tripAction(ss, action, input));
}

export function appSaveExpense(input: unknown, receipt: ReceiptUpload | null): ApiResult {
  return respond((ss) => saveExpense(ss, input, receipt));
}

// ---- Self-test ----------------------------------------------------------------

/**
 * Integration tests on a separate SELF-TEST spreadsheet (menu version). Runs the
 * newest suite only: all of them together pass the 6-minute limit, so the full
 * run is `npm run test:remote`, one execution per suite.
 */
export function selfTest(): void {
  const reports = (['phase4'] as Suite[]).map(runSelfTest);
  const results = reports.flatMap((r) => r.results);
  const failures = results
    .filter((r) => !r.ok)
    .map((r) => `✗ ${r.name}\n   ${r.error}`)
    .join('\n\n');
  const passed = results.filter((r) => r.ok).length;
  SpreadsheetApp.getUi().alert(
    `Self-test: ${passed} passed, ${results.length - passed} failed`,
    `${failures || 'All tests passed.'}\n\nTest sheet: ${reports[0].spreadsheetUrl}`,
    SpreadsheetApp.getUi().ButtonSet.OK,
  );
}

// For `clasp run` (scripts/remote-test.mjs): one suite per run, so each stays
// well inside the 6-minute Apps Script limit. Returns the report as JSON text.
export function runSelfTestPhase1Json(): string {
  return JSON.stringify(runSelfTest('phase1'));
}

export function runSelfTestPhase2Json(): string {
  return JSON.stringify(runSelfTest('phase2'));
}

export function runSelfTestPhase4Json(): string {
  return JSON.stringify(runSelfTest('phase4'));
}

/**
 * DEV tool for `clasp run`: the OCR text of the client's test screenshots
 * (samples/), so the contact reader can be tuned on exactly what Drive returns.
 */
export function ocrSamplesJson(): string {
  return JSON.stringify(
    sampleImages().map((s) => ({ name: s.name, text: ocrImage(s.base64, s.mimeType) })),
  );
}
