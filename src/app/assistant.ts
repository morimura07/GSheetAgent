// The assistant workbook (Phase 7): a separate spreadsheet the agent shares with
// an assistant, holding only the columns in src/lib/assistant.ts. Each sync
// copies the assistant's changes and new leads into the main workbook (logged on
// the "Assistant log" tab), then rewrites the assistant's views from it.
// Syncs run when the agent opens the phone app, or from the menu.

import {
  LEAD_VIEW,
  NEW_LEAD_VIEW,
  POLICY_VIEW,
  SENT_HEADER,
  findEdits,
  newLeadRows,
  normalize,
  viewRows,
  type ViewColumn,
} from '../lib/assistant';
import { REMINDER_LABELS } from '../lib/reminders';
import { createSpreadsheetFile, getFile } from '../sheets/drive';
import { appendRecords, readRecords, updateRecord } from '../sheets/records';
import { ensureSize, getMeta, setMeta, toIsoDate } from '../sheets/util';
import { FormError, leadCells, readLists, readReminders } from './service';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
type Sheet = GoogleAppsScript.Spreadsheet.Sheet;
type Rec = Record<string, unknown>;

const META_KEY = 'assistantWorkbookId';
export const ASSISTANT_LOG_TAB = 'Assistant log';
export const ASSISTANT_TABS = {
  readMe: 'Read me',
  toDo: 'To do',
  leads: 'Leads',
  policies: 'Policies',
  newLeads: 'New leads',
} as const;
const NEW_LEAD_ROWS = 40;
/** Rows made editable on Leads and Policies (protection ranges are fixed when made). */
const VIEW_ROWS = 3000;
const PROTECTION = 'Assistant workbook';
const DATE = 'mm/dd/yyyy';

export interface AssistantSync {
  url: string;
  /** Changes copied from the assistant workbook. */
  changes: number;
  /** New leads added. */
  added: number;
  /** New-lead rows left in place because something is wrong with them. */
  problems: number;
}

/** The assistant workbook, or null when there is none (or it was deleted). */
export function assistantWorkbook(ss: Spreadsheet): Spreadsheet | null {
  const id = getMeta(ss, META_KEY);
  if (!id) return null;
  try {
    if (getFile(id).trashed) return null;
    return SpreadsheetApp.openById(id);
  } catch {
    return null;
  }
}

/** Makes the assistant workbook (if there is none) and fills it. */
export function createAssistantWorkbook(ss: Spreadsheet): AssistantSync {
  let book = assistantWorkbook(ss);
  if (!book) {
    const file = createSpreadsheetFile(`Assistant - ${ss.getName()}`);
    setMeta(ss, META_KEY, file.id);
    book = SpreadsheetApp.openById(file.id);
    book.setSpreadsheetTimeZone(ss.getSpreadsheetTimeZone());
  }
  return syncWith(ss, book);
}

/** Copies changes both ways; null when there is no assistant workbook. */
export function syncAssistant(ss: Spreadsheet): AssistantSync | null {
  const book = assistantWorkbook(ss);
  return book ? syncWith(ss, book) : null;
}

function syncWith(ss: Spreadsheet, book: Spreadsheet): AssistantSync {
  const sheets = layout(book);
  const log: unknown[][] = [];
  const stamp = new Date();

  // 1. The assistant's changes, then their new leads.
  const changes =
    applyEdits(ss, 'Leads', LEAD_VIEW, sheets.leads, stamp, log) +
    applyEdits(ss, 'Policies', POLICY_VIEW, sheets.policies, stamp, log);
  const { added, problems } = addNewLeads(ss, sheets.newLeads, stamp, log);
  if (log.length) writeLog(ss, log);

  // 2. Fresh views from the main workbook.
  const leads = readRecords(ss, 'Leads')
    .map((r) => r.rec)
    .reverse();
  const phones = new Map(
    readRecords(ss, 'Clients').map(({ rec }) => [String(rec.clientId), rec.phone]),
  );
  const policies = readRecords(ss, 'Policies')
    .map(({ rec }) => ({ ...rec, phone: phones.get(String(rec.clientId)) ?? '' }))
    .reverse();
  writeView(sheets.leads, LEAD_VIEW, leads);
  writeView(sheets.policies, POLICY_VIEW, policies);
  writeToDo(ss, sheets.toDo);
  sheets.newLeads.getRange(2, 2, NEW_LEAD_ROWS, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(readLists(ss).LeadTypes ?? [], true)
      .build(),
  );
  sheets.readMe
    .getRange('A3')
    .setValue(
      `Last updated ${Utilities.formatDate(stamp, ss.getSpreadsheetTimeZone(), 'M/d/yyyy h:mm a')}`,
    );
  SpreadsheetApp.flush();
  return { url: book.getUrl(), changes, added, problems };
}

// ---- Reading the assistant's work ----------------------------------------------

function applyEdits(
  ss: Spreadsheet,
  tab: 'Leads' | 'Policies',
  view: ViewColumn[],
  sheet: Sheet,
  stamp: Date,
  log: unknown[][],
): number {
  const rows = sheet.getRange(2, 1, sheet.getMaxRows() - 1, view.length + 1).getValues();
  const edits = findEdits(view, rows);
  if (!edits.length) return 0;
  const byId = new Map(readRecords(ss, tab).map((r) => [String(r.rec[view[0].key]), r]));
  let count = 0;
  for (const edit of edits) {
    const target = byId.get(edit.id);
    const column = view.find((c) => c.key === edit.key)!;
    if (!target) continue; // deleted in the main workbook since the last sync
    const was = normalize(column, target.rec[edit.key]);
    if (was === edit.value) continue;
    updateRecord(ss, tab, target.row, { [edit.key]: edit.value });
    log.push([stamp, 'Changed', edit.id, column.header, was, edit.value]);
    count++;
  }
  return count;
}

function addNewLeads(
  ss: Spreadsheet,
  sheet: Sheet,
  stamp: Date,
  log: unknown[][],
): { added: number; problems: number } {
  const width = NEW_LEAD_VIEW.length + 1;
  const range = sheet.getRange(2, 1, NEW_LEAD_ROWS, width);
  const typed = newLeadRows(range.getValues());
  if (!typed.length) return { added: 0, problems: 0 };

  const keep: unknown[][] = [];
  let added = 0;
  for (const { rec } of typed) {
    const date = rec.dateReceived;
    const input = {
      ...rec,
      dateReceived:
        date instanceof Date
          ? toIsoDate(ss, date)
          : String(date ?? '').trim() || toIsoDate(ss, stamp),
    };
    try {
      const cells = leadCells(ss, input);
      const [lead] = appendRecords(ss, 'Leads', [
        { ...cells, assistantNotes: String(rec.assistantNotes ?? '').trim() },
      ]);
      const name = `${cells.firstName ?? ''} ${cells.lastName ?? ''}`.trim();
      log.push([stamp, 'New lead', lead.leadId, '', '', name]);
      added++;
    } catch (err) {
      const problem = err instanceof FormError ? Object.values(err.errors).join('; ') : String(err);
      keep.push([...NEW_LEAD_VIEW.map((c) => rec[c.key] ?? ''), problem]);
    }
  }
  // Rows with a problem move to the top, the rest of the area is emptied.
  range.clearContent();
  if (keep.length) sheet.getRange(2, 1, keep.length, width).setValues(keep);
  return { added, problems: keep.length };
}

function writeLog(ss: Spreadsheet, rows: unknown[][]): void {
  let sheet = ss.getSheetByName(ASSISTANT_LOG_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(ASSISTANT_LOG_TAB, ss.getNumSheets());
    sheet
      .getRange(1, 1, 1, 6)
      .setValues([['When', 'What', 'ID', 'Field', 'Was', 'Now']])
      .setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.getRange('A:A').setNumberFormat('mm/dd/yyyy h:mm am/pm');
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidths(5, 2, 220);
  }
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
}

// ---- Writing the views ---------------------------------------------------------

function writeView(sheet: Sheet, view: ViewColumn[], records: Rec[]): void {
  const width = view.length + 1;
  ensureSize(sheet, records.length + 1, width);
  const old = sheet.getRange(2, 1, sheet.getMaxRows() - 1, width);
  old.clearContent().clearDataValidations();
  if (!records.length) return;
  sheet.getRange(2, 1, records.length, width).setValues(viewRows(view, records));
  view.forEach((c, i) => {
    if (c.kind === 'checkbox') sheet.getRange(2, i + 1, records.length, 1).insertCheckboxes();
  });
}

function writeToDo(ss: Spreadsheet, sheet: Sheet): void {
  const rows = readReminders(ss).map((r) => [REMINDER_LABELS[r.kind], r.date, r.text]);
  sheet.getRange(2, 1, Math.max(1, sheet.getMaxRows() - 1), 3).clearContent();
  if (!rows.length) {
    sheet.getRange('A2').setValue('Nothing needs attention today.');
    return;
  }
  ensureSize(sheet, rows.length + 1, 3);
  sheet.getRange(2, 1, rows.length, 3).setValues(rows);
}

// ---- Tabs and protection -------------------------------------------------------

interface AssistantSheets {
  readMe: Sheet;
  toDo: Sheet;
  leads: Sheet;
  policies: Sheet;
  newLeads: Sheet;
}

const READ_ME = [
  ['Assistant workbook'],
  [
    "Kept up to date from the agent's tracker each time it syncs (when the agent opens the phone app).",
  ],
  [''],
  [''],
  ['What you can change'],
  ['• Leads: Contacted, Appointment set and Assistant notes.'],
  ['• Policies: Assistant notes.'],
  ['• New leads: type new leads in the empty rows. They move to the Leads tab at the next sync.'],
  ["  A row that can't be added stays, with the reason in the Problem column."],
  [''],
  ['Everything else is filled in by the tracker; changes there would be overwritten.'],
  ["Every change you make is copied to the tracker's log."],
];

/** Makes or repairs the tabs, headers and protection. */
function layout(book: Spreadsheet): AssistantSheets {
  const get = (name: string, index: number) => {
    const sheet = book.getSheetByName(name) ?? book.insertSheet(name, index);
    return {
      sheet,
      fresh:
        sheet.getLastRow() === 0 &&
        sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).length === 0,
    };
  };
  const readMe = get(ASSISTANT_TABS.readMe, 0);
  const toDo = get(ASSISTANT_TABS.toDo, 1);
  const leads = get(ASSISTANT_TABS.leads, 2);
  const policies = get(ASSISTANT_TABS.policies, 3);
  const newLeads = get(ASSISTANT_TABS.newLeads, 4);
  // The empty "Sheet1" of a new spreadsheet.
  for (const extra of book.getSheets()) {
    const ours = Object.values(ASSISTANT_TABS).includes(extra.getName() as never);
    if (!ours && extra.getLastRow() === 0) book.deleteSheet(extra);
  }

  if (readMe.fresh) {
    readMe.sheet.getRange(1, 1, READ_ME.length, 1).setValues(READ_ME);
    readMe.sheet.getRange('A1').setFontSize(16).setFontWeight('bold');
    readMe.sheet.getRange('A5').setFontWeight('bold');
    readMe.sheet.getRange('A3').setFontColor('#5f6368');
    readMe.sheet.setColumnWidth(1, 720);
    protect(readMe.sheet);
  }
  if (toDo.fresh) {
    header(toDo.sheet, ['Kind', 'Date', 'What to do'], [110, 100, 620]);
    toDo.sheet.getRange('B:B').setNumberFormat('@');
    protect(toDo.sheet);
  }
  for (const [s, view] of [
    [leads, LEAD_VIEW],
    [policies, POLICY_VIEW],
  ] as const) {
    if (!s.fresh) continue;
    ensureSize(s.sheet, VIEW_ROWS, view.length + 1);
    header(
      s.sheet,
      [...view.map((c) => c.header), SENT_HEADER],
      [...view.map((c) => c.width ?? 110), 100],
    );
    view.forEach(
      (c, i) =>
        c.kind === 'date' &&
        s.sheet.getRange(2, i + 1, s.sheet.getMaxRows() - 1, 1).setNumberFormat(DATE),
    );
    s.sheet.hideColumns(view.length + 1);
    protect(
      s.sheet,
      view.flatMap((c, i) =>
        c.editable ? [s.sheet.getRange(2, i + 1, s.sheet.getMaxRows() - 1, 1)] : [],
      ),
    );
  }
  if (newLeads.fresh) {
    header(
      newLeads.sheet,
      [...NEW_LEAD_VIEW.map((c) => c.header), 'Problem'],
      [...NEW_LEAD_VIEW.map((c) => c.width ?? 110), 260],
    );
    newLeads.sheet
      .getRange(2, 1, NEW_LEAD_ROWS, 1)
      .setNumberFormat(DATE)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().build());
    newLeads.sheet.getRange(2, NEW_LEAD_VIEW.length + 1, NEW_LEAD_ROWS, 1).setFontColor('#d93025');
    protect(newLeads.sheet, [newLeads.sheet.getRange(2, 1, NEW_LEAD_ROWS, NEW_LEAD_VIEW.length)]);
  }
  return {
    readMe: readMe.sheet,
    toDo: toDo.sheet,
    leads: leads.sheet,
    policies: policies.sheet,
    newLeads: newLeads.sheet,
  };
}

function header(sheet: Sheet, headers: string[], widths: number[]): void {
  sheet
    .getRange(1, 1, 1, headers.length)
    .setValues([headers])
    .setFontWeight('bold')
    .setBackground('#e8f0fe');
  sheet.setFrozenRows(1);
  widths.forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

/** Only the owner may edit outside `editable` (not just a warning: the assistant is an editor). */
function protect(sheet: Sheet, editable: GoogleAppsScript.Spreadsheet.Range[] = []): void {
  const p = sheet.protect().setDescription(PROTECTION).setUnprotectedRanges(editable);
  p.removeEditors(p.getEditors());
  if (p.canDomainEdit()) p.setDomainEdit(false);
}
