// Apps Script entry points. Every export becomes a top-level function in
// dist/Code.js (see build.mjs), so menus and triggers can call it by name.

import { loadBoot, rememberWorkbook, respond, workbook } from './app/api';
import { createAssistantWorkbook, syncAssistant, type AssistantSync } from './app/assistant';
import type { ApiResult, Boot, HousekeepingResult, ReadResult, ReceiptUpload } from './app/forms';
import {
  housekeeping,
  readContactScreenshots,
  readReminders,
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
import { exportToExcel } from './sheets/export';
import { ocrImage } from './sheets/ocr';
import { setupWorkbook } from './sheets/setup';
import { loadTestData as loadTestDataImpl } from './sheets/testData';

declare const __BUILD_VERSION__: string;
/** True in the copy handed to the client (`node build.mjs --release`). */
declare const __RELEASE__: boolean;

export function onOpen(): void {
  const menu = SpreadsheetApp.getUi()
    .createMenu('Agent Tracker')
    .addItem('Set up workbook', 'runSetup')
    .addItem('Phone app link', 'showPhoneAppLink')
    .addItem('Reminders', 'showReminders')
    .addItem('Save an Excel copy now', 'saveExcelCopy')
    .addItem('Assistant workbook', 'showAssistantWorkbook')
    .addSeparator();
  if (!__RELEASE__) {
    menu
      .addItem('Load test data (DEV only)', 'loadTestData')
      .addItem('Run self-test (DEV only)', 'selfTest');
  }
  menu.addItem('About', 'showAbout').addToUi();
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

export function showReminders(): void {
  const list = readReminders(SpreadsheetApp.getActiveSpreadsheet());
  const items = list.map((r) => `<li>${escapeHtml(r.text)} <small>(${r.ref})</small></li>`);
  const html = HtmlService.createHtmlOutput(
    `<div style="font-family:sans-serif">${
      items.length ? `<ul>${items.join('')}</ul>` : '<p>Nothing needs attention today.</p>'
    }</div>`,
  )
    .setWidth(520)
    .setHeight(Math.min(560, 120 + items.length * 44));
  SpreadsheetApp.getUi().showModalDialog(html, `Reminders (${list.length})`);
}

export function saveExcelCopy(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Saving an Excel copy…', 'Agent Tracker', -1);
  const file = exportToExcel(ss);
  const html = HtmlService.createHtmlOutput(
    `<p style="font-family:sans-serif">Saved <a href="${file.webViewLink}" target="_blank">${escapeHtml(
      file.name ?? 'the Excel copy',
    )}</a> in your Drive folder "Excel copies".</p>`,
  )
    .setWidth(420)
    .setHeight(140);
  ss.toast('Excel copy saved.', 'Agent Tracker', 3);
  SpreadsheetApp.getUi().showModalDialog(html, 'Excel copy');
}

/** Makes the assistant workbook if needed, syncs it, and shows how to share it. */
export function showAssistantWorkbook(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Updating the assistant workbook…', 'Agent Tracker', -1);
  const sync = createAssistantWorkbook(ss);
  ss.toast(assistantNews(sync) ?? 'Assistant workbook is up to date.', 'Agent Tracker', 5);
  const html = HtmlService.createHtmlOutput(
    `<div style="font-family:sans-serif;font-size:14px">
      <p><a href="${sync.url}" target="_blank">Open the assistant workbook</a></p>
      <p>It holds names, phones, lead follow-ups, carrier, policy number and status only.
      Notes, health, Medicare IDs, beneficiaries and money stay here.</p>
      <p><b>To give your assistant access:</b> open it, tap <b>Share</b>, add their email as
      <b>Editor</b>. To stop it, remove them there.</p>
      <p>It updates each time you open the phone app, or when you choose this menu item.
      Their changes are listed on the "Assistant log" tab.</p>
    </div>`,
  )
    .setWidth(460)
    .setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, 'Assistant workbook');
}

/** One line about what a sync brought in; null when nothing came in. */
function assistantNews(sync: AssistantSync): string | null {
  const parts = [
    sync.changes && `${sync.changes} change${sync.changes === 1 ? '' : 's'}`,
    sync.added && `${sync.added} new lead${sync.added === 1 ? '' : 's'}`,
    sync.problems && `${sync.problems} new lead${sync.problems === 1 ? '' : 's'} to fix there`,
  ].filter(Boolean);
  return parts.length ? `From your assistant: ${parts.join(', ')}.` : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function loadTestData(): void {
  if (__RELEASE__) throw new Error('Test data is for the DEV workbook only');
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

/**
 * After the home screen shows: the assistant workbook sync (first, so the
 * reminders include the assistant's changes), reminders, and the month's Excel
 * copy when it is due.
 */
export function appHousekeeping(): HousekeepingResult {
  try {
    const ss = workbook();
    let assistant: string | null;
    try {
      const sync = syncAssistant(ss);
      assistant = sync && assistantNews(sync);
    } catch (err) {
      assistant = `The assistant workbook could not be updated: ${(err as Error).message}`;
    }
    return { ...housekeeping(ss), assistant };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
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
  if (__RELEASE__) throw new Error('The self-test is for the DEV workbook only');
  const reports = (['phase7'] as Suite[]).map(runSelfTest);
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

export function runSelfTestPhase3Json(): string {
  return JSON.stringify(runSelfTest('phase3'));
}

export function runSelfTestPhase4Json(): string {
  return JSON.stringify(runSelfTest('phase4'));
}

export function runSelfTestPhase6Json(): string {
  return JSON.stringify(runSelfTest('phase6'));
}

export function runSelfTestPhase7Json(): string {
  return JSON.stringify(runSelfTest('phase7'));
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
