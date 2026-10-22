// The assistant workbook: a separate spreadsheet the agent shares with an
// assistant. It only ever holds the columns listed here (names, phones, carrier,
// policy number, status, follow-up fields); notes, health, Medicare IDs,
// beneficiaries, premiums and commissions never leave the main workbook.
//
// Each sync reads the assistant's edits back, then rewrites the views. Every
// view row carries a hidden, protected copy of its editable values as they were
// written ("sent"), so a sync can tell what the assistant changed from what the
// agent changed in the meantime. Pure, so it is unit tested.

export type ViewKind = 'text' | 'date' | 'checkbox';

export interface ViewColumn {
  key: string;
  header: string;
  kind?: ViewKind;
  /** The assistant may change it; changes are copied to the main workbook. */
  editable?: boolean;
  width?: number;
}

export const LEAD_VIEW: ViewColumn[] = [
  { key: 'leadId', header: 'Lead ID', width: 80 },
  { key: 'dateReceived', header: 'Date received', kind: 'date' },
  { key: 'leadType', header: 'Lead type' },
  { key: 'firstName', header: 'First name' },
  { key: 'lastName', header: 'Last name' },
  { key: 'phone', header: 'Phone', width: 120 },
  { key: 'contacted', header: 'Contacted', kind: 'checkbox', editable: true, width: 85 },
  { key: 'appointmentSet', header: 'Appointment set', kind: 'checkbox', editable: true, width: 85 },
  { key: 'applicationWritten', header: 'Application written', kind: 'checkbox', width: 85 },
  { key: 'assistantNotes', header: 'Assistant notes', editable: true, width: 280 },
];

/** `phone` is the client's phone, looked up from Clients. */
export const POLICY_VIEW: ViewColumn[] = [
  { key: 'policyId', header: 'Policy ID', width: 80 },
  { key: 'clientName', header: 'Client', width: 160 },
  { key: 'phone', header: 'Phone', width: 120 },
  { key: 'carrier', header: 'Carrier', width: 170 },
  { key: 'policyNumber', header: 'Policy #' },
  { key: 'status', header: 'Status', width: 140 },
  { key: 'statusDate', header: 'Status date', kind: 'date' },
  { key: 'firstDraftDate', header: 'First draft date', kind: 'date' },
  { key: 'draftDay', header: 'Draft day', width: 90 },
  { key: 'assistantNotes', header: 'Assistant notes', editable: true, width: 280 },
];

/** Rows the assistant types in to add leads; each sync moves them to the main workbook. */
export const NEW_LEAD_VIEW: ViewColumn[] = [
  { key: 'dateReceived', header: 'Date received', kind: 'date' },
  { key: 'leadType', header: 'Lead type' },
  { key: 'firstName', header: 'First name' },
  { key: 'lastName', header: 'Last name' },
  { key: 'phone', header: 'Phone', width: 120 },
  { key: 'assistantNotes', header: 'Notes', width: 280 },
];

export const SENT_HEADER = 'Sent (do not edit)';

type Rec = Record<string, unknown>;

/** A cell value as the view compares it: booleans for checkboxes, trimmed text otherwise. */
export function normalize(column: ViewColumn, value: unknown): string | boolean {
  if (column.kind === 'checkbox') return value === true || value === 'TRUE';
  return String(value ?? '').trim();
}

/** View rows for `records`: the view's columns, then the JSON of the editable values. */
export function viewRows(view: ViewColumn[], records: Rec[]): unknown[][] {
  const editable = view.filter((c) => c.editable);
  return records.map((rec) => [
    ...view.map((c) => (c.kind === 'checkbox' ? rec[c.key] === true : (rec[c.key] ?? ''))),
    JSON.stringify(Object.fromEntries(editable.map((c) => [c.key, normalize(c, rec[c.key])]))),
  ]);
}

export interface ViewEdit {
  /** The row's ID (first view column). */
  id: string;
  key: string;
  value: string | boolean;
}

/**
 * The assistant's changes: editable cells that differ from what was sent. Rows
 * without an ID or without a readable "sent" copy are skipped.
 */
export function findEdits(view: ViewColumn[], rows: unknown[][]): ViewEdit[] {
  const edits: ViewEdit[] = [];
  for (const row of rows) {
    const id = String(row[0] ?? '').trim();
    if (!id) continue;
    let sent: Rec;
    try {
      sent = JSON.parse(String(row[view.length] ?? ''));
    } catch {
      continue;
    }
    view.forEach((c, i) => {
      if (!c.editable || !(c.key in sent)) return;
      const value = normalize(c, row[i]);
      if (value !== sent[c.key]) edits.push({ id, key: c.key, value });
    });
  }
  return edits;
}

/** Typed-in new-lead rows that have anything in them, as records (with their row index). */
export function newLeadRows(rows: unknown[][]): { index: number; rec: Rec }[] {
  return rows.flatMap((row, index) =>
    NEW_LEAD_VIEW.some((_, i) => String(row[i] ?? '').trim() !== '')
      ? [{ index, rec: Object.fromEntries(NEW_LEAD_VIEW.map((c, i) => [c.key, row[i]])) }]
      : [],
  );
}
