// Server side of the phone app. Each action takes the workbook explicitly so the
// self-test can run it against the SELF-TEST spreadsheet.

import {
  LISTS_TAB,
  SETTINGS_LISTS,
  SETTINGS_TAB,
  SETTINGS_TABLES,
  SIMPLE_LISTS,
  settingsTableStart,
} from '../config/schema';
import { parseContact, type ReaderCarrier } from '../lib/contactReader';
import {
  cleanForm,
  formatPhone,
  type CleanValues,
  type FieldSpec,
  type FormContext,
} from '../lib/forms';
import { isoToDate } from '../lib/rows';
import { appendRecords, readRecords, updateRecord } from '../sheets/records';
import { ocrImage } from '../sheets/ocr';
import { saveReceipt } from '../sheets/receipts';
import { toIsoDate } from '../sheets/util';
import {
  APP_LISTS,
  BENEFICIARY_FORM,
  CLIENT_FORM,
  CLIENT_LEAD_FIELD,
  CLOCK_IN_FORM,
  EXPENSE_FORM,
  LEAD_FORM,
  POLICY_FORM,
  TRIP_END_FORM,
  TRIP_FORM,
  TRIP_START_FORM,
  type Boot,
  type ContactDraft,
  type Option,
  type ReceiptUpload,
  type ShiftView,
  type TripView,
} from './forms';

declare const __BUILD_VERSION__: string;

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
type Input = Record<string, unknown>;

/** Bad form input: shown next to the fields instead of as a general error. */
export class FormError extends Error {
  constructor(readonly errors: Record<string, string>) {
    super(Object.values(errors).join('; '));
  }
}

// ---- Start-up data ---------------------------------------------------------

/** `reuseLists`: after a save, skip re-reading the dropdown lists (a save never changes them). */
export function boot(ss: Spreadsheet, opts: { reuseLists?: boolean } = {}): Boot {
  return {
    build: __BUILD_VERSION__,
    ...basics(ss, opts.reuseLists),
    shift: openShift(ss)?.view ?? null,
    trip: openTrip(ss)?.view ?? null,
  };
}

/** Everything in Boot except what is running (all a form check needs). */
function basics(
  ss: Spreadsheet,
  reuseLists = false,
): Pick<Boot, 'today' | 'lists' | 'clients' | 'openLeads'> {
  return {
    today: toIsoDate(ss, new Date()),
    lists: reuseLists && listCache?.id === ss.getId() ? listCache.lists : readLists(ss),
    clients: clientOptions(ss),
    openLeads: openLeadOptions(ss),
  };
}

// Lists from the last read in this execution (each google.script.run call is a new one).
let listCache: { id: string; lists: Record<string, string[]> } | undefined;

function readTab(ss: Spreadsheet, name: string): unknown[][] {
  const sheet = ss.getSheetByName(name);
  return sheet
    ? sheet.getRange(2, 1, sheet.getMaxRows() - 1, sheet.getMaxColumns()).getValues()
    : [];
}

/** Column index (0-based) of a Settings table column on the Settings tab. */
function settingsColumn(tableKey: string, columnKey: string): number {
  const table = SETTINGS_TABLES.find((t) => t.key === tableKey)!;
  return settingsTableStart(table.key) - 1 + table.columns.findIndex((c) => c.key === columnKey);
}

/** The app's dropdown lists, from one read of Lists and one of Settings. */
function readLists(ss: Spreadsheet): Record<string, string[]> {
  const read = (name: string) => readTab(ss, name);
  const listRows = read(LISTS_TAB);
  const settingsRows = read(SETTINGS_TAB);
  const column = (rows: unknown[][], col: number) =>
    rows.map((r) => String(r[col] ?? '').trim()).filter(Boolean);

  const simple = Object.keys(SIMPLE_LISTS);
  const lists: Record<string, string[]> = {};
  for (const name of APP_LISTS) {
    if (name in SETTINGS_LISTS) {
      const src = SETTINGS_LISTS[name as keyof typeof SETTINGS_LISTS];
      lists[name] = column(settingsRows, settingsColumn(src.table, src.column));
    } else {
      lists[name] = column(listRows, simple.indexOf(name));
    }
  }
  listCache = { id: ss.getId(), lists };
  return lists;
}

function clientOptions(ss: Spreadsheet): Option[] {
  return readRecords(ss, 'Clients')
    .map(({ rec }) => ({
      id: String(rec.clientId),
      label: `${rec.firstName} ${rec.lastName}`.trim() + ` (${rec.clientId})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function openLeadOptions(ss: Spreadsheet): Option[] {
  return readRecords(ss, 'Leads')
    .filter(({ rec }) => rec.clientId === '')
    .reverse()
    .map(({ rec }) => ({
      id: String(rec.leadId),
      label: [
        `${rec.firstName} ${rec.lastName}`.trim(),
        rec.leadType,
        rec.dateReceived instanceof Date ? toIsoDate(ss, rec.dateReceived) : '',
      ]
        .filter(Boolean)
        .join(' · '),
      fill: {
        firstName: String(rec.firstName),
        lastName: String(rec.lastName),
        phone: String(rec.phone),
        referredBy: String(rec.referredBy),
      },
    }));
}

function context(ss: Spreadsheet): FormContext {
  const b = basics(ss);
  return {
    lists: b.lists,
    clientIds: b.clients.map((c) => c.id),
    leadIds: b.openLeads.map((l) => l.id),
    today: b.today,
  };
}

/** Form values as cell values: ISO dates become Dates. */
function toCells(specs: FieldSpec[], values: CleanValues): Input {
  const cells: Input = {};
  for (const s of specs) {
    if (!(s.key in values)) continue;
    const v = values[s.key];
    cells[s.key] =
      s.kind === 'date' ? isoToDate(String(v)) : s.kind === 'percent' ? Number(v) / 100 : v;
  }
  return cells;
}

function clean(specs: FieldSpec[], input: unknown, ctx: FormContext, prefix = ''): CleanValues {
  const { values, errors } = cleanForm(specs, (input ?? {}) as Input, ctx);
  if (Object.keys(errors).length) {
    throw new FormError(
      Object.fromEntries(Object.entries(errors).map(([k, v]) => [prefix + k, v])),
    );
  }
  return values;
}

// ---- Clients and leads -----------------------------------------------------

export function saveLead(ss: Spreadsheet, input: unknown): string {
  const values = clean(LEAD_FORM, input, context(ss));
  const [lead] = appendRecords(ss, 'Leads', [toCells(LEAD_FORM, values)]);
  return `Lead ${lead.leadId} saved`;
}

export function saveClient(
  ss: Spreadsheet,
  input: { client?: unknown; policy?: unknown; leadId?: unknown; beneficiaries?: unknown },
): string {
  const ctx = context(ss);
  const errors: Record<string, string> = {};
  const attempt = <T>(fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (err) {
      if (!(err instanceof FormError)) throw err;
      Object.assign(errors, err.errors);
      return undefined;
    }
  };
  const client = attempt(() => clean(CLIENT_FORM, input.client, ctx));
  const policy = input.policy
    ? attempt(() => clean(POLICY_FORM, input.policy, ctx, 'policy.'))
    : null;
  const link = attempt(() => clean([CLIENT_LEAD_FIELD], { leadId: input.leadId }, ctx));
  const benInput = Array.isArray(input.beneficiaries) ? input.beneficiaries : [];
  const beneficiaries = benInput.map((b, i) =>
    attempt(() => clean(BENEFICIARY_FORM, b, ctx, `ben.${i}.`)),
  );
  if (benInput.length && !input.policy) {
    errors.beneficiaries = 'Beneficiaries belong to a policy: add the policy';
  }
  if (Object.keys(errors).length) throw new FormError(errors);

  const [saved] = appendRecords(ss, 'Clients', [toCells(CLIENT_FORM, client!)]);
  const clientId = String(saved.clientId);
  const parts = [`Client ${clientId} saved`];

  if (policy) {
    const [p] = appendRecords(ss, 'Policies', [{ ...toCells(POLICY_FORM, policy), clientId }]);
    parts.push(`policy ${p.policyId}`);
    if (beneficiaries.length) {
      appendRecords(
        ss,
        'Beneficiaries',
        beneficiaries.map((b) => ({ ...toCells(BENEFICIARY_FORM, b!), policyId: p.policyId })),
      );
      parts.push(`${beneficiaries.length} beneficiar${beneficiaries.length === 1 ? 'y' : 'ies'}`);
    }
  }
  if (link?.leadId) {
    const lead = readRecords(ss, 'Leads').find(({ rec }) => rec.leadId === link.leadId)!;
    updateRecord(ss, 'Leads', lead.row, {
      clientId,
      contacted: true,
      ...(policy ? { applicationWritten: true } : {}),
    });
    parts.push(`linked to lead ${link.leadId}`);
  }
  return parts.join(', ');
}

// ---- Contact screenshots ---------------------------------------------------

export interface Screenshot {
  base64: string;
  mimeType: string;
}

export const MAX_SCREENSHOTS = 6;

/**
 * Reads a contact from 1-6 screenshots into new-client form values. Nothing is
 * saved: the agent checks the form and taps Save (saveClient).
 */
export function readContactScreenshots(ss: Spreadsheet, shots: Screenshot[]): ContactDraft {
  if (!Array.isArray(shots) || !shots.length) throw new Error('Pick at least one screenshot');
  if (shots.length > MAX_SCREENSHOTS) {
    throw new Error(`Pick up to ${MAX_SCREENSHOTS} screenshots of one contact`);
  }
  const texts = shots.map((s) => ocrImage(s.base64, s.mimeType));
  return draftFromText(ss, texts);
}

/** The reader on text already recognised (the self-test also uses it). */
export function draftFromText(ss: Spreadsheet, texts: string[]): ContactDraft {
  const b = basics(ss);
  const parsed = parseContact(texts, {
    lists: b.lists,
    carriers: readCarriers(ss),
    today: b.today,
  });
  const { referredByName, ...draft } = parsed;
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (referredByName) {
    const match = b.clients.find(
      (c) => norm(c.label.replace(/\s*\([^)]*\)$/, '')) === norm(referredByName),
    );
    if (match) draft.client.referredBy = match.id;
    else {
      draft.client.notes = [draft.client.notes, `Referred by ${referredByName}`]
        .filter(Boolean)
        .join('; ');
      draft.warnings.push(
        `Referred by ${referredByName}: no client with that name yet (put in notes)`,
      );
    }
  }
  const name = norm(`${draft.client.firstName ?? ''}${draft.client.lastName ?? ''}`);
  const lead = b.openLeads.find(
    (l) =>
      (draft.client.phone && formatPhone(l.fill?.phone ?? '') === draft.client.phone) ||
      (name && norm(`${l.fill?.firstName ?? ''}${l.fill?.lastName ?? ''}`) === name),
  );
  return { ...draft, leadId: lead?.id ?? '' };
}

/** Carrier names with the shorthand the client uses in notes (Settings > Carriers). */
function readCarriers(ss: Spreadsheet): ReaderCarrier[] {
  const rows = readTab(ss, SETTINGS_TAB);
  const name = settingsColumn('Carriers', 'name');
  const aliases = settingsColumn('Carriers', 'aliases');
  return rows
    .filter((r) => String(r[name] ?? '').trim())
    .map((r) => ({
      name: String(r[name]).trim(),
      aliases: String(r[aliases] ?? '')
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
    }));
}

// ---- Hours -----------------------------------------------------------------

function openShift(ss: Spreadsheet): { row: number; view: ShiftView } | undefined {
  const open = readRecords(ss, 'Hours')
    .reverse()
    .find(({ rec }) => rec.start instanceof Date && rec.end === '');
  if (!open) return undefined;
  const { rec } = open;
  return {
    row: open.row,
    view: {
      shiftId: String(rec.shiftId),
      start: (rec.start as Date).getTime(),
      breakMinutes: Number(rec.breakMinutes) || 0,
      onBreakSince: rec.breakStartedAt instanceof Date ? rec.breakStartedAt.getTime() : null,
    },
  };
}

export type ShiftAction = 'clockIn' | 'startBreak' | 'endBreak' | 'clockOut';

export function shiftAction(
  ss: Spreadsheet,
  action: ShiftAction,
  input: unknown = {},
  now = new Date(),
): string {
  const open = openShift(ss);
  const time = (ms: number) =>
    Utilities.formatDate(new Date(ms), ss.getSpreadsheetTimeZone(), 'h:mm a');

  if (action === 'clockIn') {
    if (open) throw new Error(`Already clocked in since ${time(open.view.start)}`);
    const values = clean(CLOCK_IN_FORM, input, context(ss));
    const day = isoToDate(toIsoDate(ss, now));
    const [shift] = appendRecords(ss, 'Hours', [
      { ...values, date: day, start: now, breakMinutes: 0 },
    ]);
    return `Clocked in at ${time(now.getTime())} (${shift.shiftId})`;
  }

  if (!open) throw new Error('Not clocked in');
  const { row, view } = open;
  const breakSoFar = () =>
    view.breakMinutes +
    (view.onBreakSince === null ? 0 : Math.round((now.getTime() - view.onBreakSince) / 60000));

  switch (action) {
    case 'startBreak':
      if (view.onBreakSince !== null) throw new Error('Already on a break');
      updateRecord(ss, 'Hours', row, { breakStartedAt: now });
      return `Break started at ${time(now.getTime())}`;
    case 'endBreak': {
      if (view.onBreakSince === null) throw new Error('Not on a break');
      const minutes = breakSoFar();
      updateRecord(ss, 'Hours', row, { breakMinutes: minutes, breakStartedAt: '' });
      return `Break ended (${minutes} min of breaks today)`;
    }
    case 'clockOut': {
      const minutes = breakSoFar();
      updateRecord(ss, 'Hours', row, { breakMinutes: minutes, breakStartedAt: '', end: now });
      const worked = Math.max(0, (now.getTime() - view.start) / 3600000 - minutes / 60);
      return `Clocked out at ${time(now.getTime())}: ${worked.toFixed(2)} hours worked`;
    }
  }
  throw new Error(`Unknown action ${action}`);
}

// ---- Mileage ---------------------------------------------------------------

function openTrip(ss: Spreadsheet): { row: number; view: TripView } | undefined {
  const open = readRecords(ss, 'Mileage')
    .reverse()
    .find(({ rec }) => rec.startOdometer !== '' && rec.endOdometer === '');
  if (!open) return undefined;
  return {
    row: open.row,
    view: {
      tripId: String(open.rec.tripId),
      startOdometer: Number(open.rec.startOdometer),
      purpose: String(open.rec.purpose),
    },
  };
}

export type TripAction = 'start' | 'end' | 'full';

export function tripAction(ss: Spreadsheet, action: TripAction, input: unknown): string {
  const ctx = context(ss);
  const open = openTrip(ss);
  const miles = (start: number, end: number) => {
    if (end < start) {
      throw new FormError({
        endOdometer: `Lower than the start reading (${start.toLocaleString('en-US')})`,
      });
    }
    return Math.round((end - start) * 10) / 10;
  };

  if (action === 'start') {
    if (open) throw new Error(`Trip ${open.view.tripId} is still running. End it first.`);
    const values = clean(TRIP_START_FORM, input, ctx);
    const [trip] = appendRecords(ss, 'Mileage', [{ ...values, date: isoToDate(ctx.today) }]);
    return `Trip ${trip.tripId} started`;
  }
  if (action === 'end') {
    if (!open) throw new Error('No trip is running');
    const { endOdometer } = clean(TRIP_END_FORM, input, ctx);
    const m = miles(open.view.startOdometer, Number(endOdometer));
    updateRecord(ss, 'Mileage', open.row, { endOdometer });
    return `Trip ${open.view.tripId} ended: ${m} miles`;
  }
  const values = clean(TRIP_FORM, input, ctx);
  const m = miles(Number(values.startOdometer), Number(values.endOdometer));
  const [trip] = appendRecords(ss, 'Mileage', [toCells(TRIP_FORM, values)]);
  return `Trip ${trip.tripId} saved: ${m} miles`;
}

// ---- Expenses --------------------------------------------------------------

export function saveExpense(
  ss: Spreadsheet,
  input: unknown,
  receipt?: ReceiptUpload | null,
): string {
  const values = clean(EXPENSE_FORM, input, context(ss));
  const cells = toCells(EXPENSE_FORM, values);
  if (receipt?.base64) {
    const ext = receipt.mimeType === 'application/pdf' ? 'pdf' : receipt.mimeType.split('/')[1];
    const name = `${values.date} ${values.category} $${Number(values.amount).toFixed(2)}.${ext}`;
    cells.receipt = saveReceipt(ss, receipt, name).webViewLink ?? '';
  }
  const [expense] = appendRecords(ss, 'Expenses', [cells]);
  return `Expense ${expense.expenseId} saved${cells.receipt ? ' with receipt' : ''}`;
}
