// Phone app forms. Field keys are column keys of the tab each form writes to
// (checked in test/forms.test.ts), so the app and the workbook cannot drift apart.

import type { FieldSpec } from '../lib/forms';

export const LEAD_FORM: FieldSpec[] = [
  {
    key: 'dateReceived',
    label: 'Date received',
    kind: 'date',
    required: true,
    today: true,
    notFuture: true,
  },
  { key: 'leadType', label: 'Lead type', kind: 'list', list: 'LeadTypes', required: true },
  { key: 'firstName', label: 'First name', kind: 'text', required: true },
  { key: 'lastName', label: 'Last name', kind: 'text' },
  { key: 'phone', label: 'Phone', kind: 'phone' },
  { key: 'referredBy', label: 'Referred by', kind: 'client' },
  { key: 'notes', label: 'Notes', kind: 'longtext' },
];

export const CLIENT_FORM: FieldSpec[] = [
  { key: 'firstName', label: 'First name', kind: 'text', required: true },
  { key: 'lastName', label: 'Last name', kind: 'text', required: true },
  { key: 'phone', label: 'Phone', kind: 'phone' },
  { key: 'email', label: 'Email', kind: 'email' },
  { key: 'street', label: 'Street', kind: 'text' },
  { key: 'city', label: 'City', kind: 'text' },
  { key: 'state', label: 'State', kind: 'list', list: 'States', default: 'OK' },
  { key: 'zip', label: 'ZIP', kind: 'text' },
  { key: 'county', label: 'County', kind: 'list', list: 'Counties' },
  { key: 'birthday', label: 'Birthday', kind: 'date', notFuture: true },
  { key: 'smoker', label: 'Smoker', kind: 'list', list: 'Smoker' },
  { key: 'height', label: 'Height', kind: 'text' },
  { key: 'weightLbs', label: 'Weight (lbs)', kind: 'number' },
  { key: 'existingCoverage', label: 'Existing coverage', kind: 'text' },
  { key: 'medicarePlan', label: 'Medicare plan', kind: 'list', list: 'MedicarePlanTypes' },
  { key: 'medicareId', label: 'Medicare ID', kind: 'text' },
  { key: 'referredBy', label: 'Referred by', kind: 'client' },
  { key: 'notes', label: 'Notes', kind: 'longtext' },
];

/** Optional policy written with a new client. */
export const POLICY_FORM: FieldSpec[] = [
  { key: 'carrier', label: 'Carrier', kind: 'list', list: 'Carriers', required: true },
  { key: 'productType', label: 'Product type', kind: 'list', list: 'ProductTypes' },
  { key: 'policyNumber', label: 'Policy #', kind: 'text' },
  { key: 'faceAmount', label: 'Face amount', kind: 'money' },
  { key: 'premium', label: 'Premium', kind: 'money' },
  {
    key: 'paymentMode',
    label: 'Payment mode',
    kind: 'list',
    list: 'PaymentModes',
    default: 'Monthly',
  },
  { key: 'applicationDate', label: 'Application date', kind: 'date', today: true, notFuture: true },
  { key: 'issueDate', label: 'Issue date', kind: 'date' },
  { key: 'draftDay', label: 'Draft day', kind: 'text' },
  { key: 'status', label: 'Status', kind: 'list', list: 'PolicyStatuses', default: 'Pending' },
];

/** Beneficiaries of the new policy (any number). Share is a percent, 1-100. */
export const BENEFICIARY_FORM: FieldSpec[] = [
  { key: 'name', label: 'Beneficiary name', kind: 'text', required: true },
  { key: 'relationship', label: 'Relationship', kind: 'text' },
  { key: 'kind', label: 'Type', kind: 'list', list: 'BeneficiaryTypes', default: 'Primary' },
  { key: 'share', label: 'Share %', kind: 'percent' },
  { key: 'phone', label: 'Phone', kind: 'phone' },
];

/** The lead a new client came from (not a Clients column: it updates the Leads row). */
export const CLIENT_LEAD_FIELD: FieldSpec = { key: 'leadId', label: 'From lead', kind: 'lead' };

export const EXPENSE_FORM: FieldSpec[] = [
  { key: 'date', label: 'Date', kind: 'date', required: true, today: true, notFuture: true },
  { key: 'category', label: 'Category', kind: 'list', list: 'ExpenseCategories', required: true },
  { key: 'amount', label: 'Amount', kind: 'money', required: true },
  { key: 'vendor', label: 'Vendor', kind: 'text' },
  { key: 'paymentMethod', label: 'Paid with', kind: 'list', list: 'PaymentMethods' },
  { key: 'notes', label: 'Notes', kind: 'longtext' },
];

export const CLOCK_IN_FORM: FieldSpec[] = [
  { key: 'activity', label: 'Activity', kind: 'list', list: 'HoursActivities' },
  { key: 'notes', label: 'Notes', kind: 'text' },
];

export const TRIP_START_FORM: FieldSpec[] = [
  { key: 'startOdometer', label: 'Odometer now', kind: 'number', required: true },
  { key: 'purpose', label: 'Purpose', kind: 'text' },
];

export const TRIP_END_FORM: FieldSpec[] = [
  { key: 'endOdometer', label: 'Odometer now', kind: 'number', required: true },
];

/** A trip entered afterwards, all at once. */
export const TRIP_FORM: FieldSpec[] = [
  { key: 'date', label: 'Date', kind: 'date', required: true, today: true, notFuture: true },
  { key: 'startOdometer', label: 'Start odometer', kind: 'number', required: true },
  { key: 'endOdometer', label: 'End odometer', kind: 'number', required: true },
  { key: 'purpose', label: 'Purpose', kind: 'text' },
  { key: 'notes', label: 'Notes', kind: 'longtext' },
];

/** Lists the app needs to fill its dropdowns. */
export const APP_LISTS = [
  ...new Set(
    [LEAD_FORM, CLIENT_FORM, POLICY_FORM, BENEFICIARY_FORM, EXPENSE_FORM, CLOCK_IN_FORM]
      .flat()
      .flatMap((f) => (f.list ? [f.list] : [])),
  ),
];

// ---- What the server sends the app ----------------------------------------

export interface Option {
  id: string;
  label: string;
  /** Leads: values to pre-fill on the new-client form. */
  fill?: Record<string, string>;
}

export interface ShiftView {
  shiftId: string;
  /** Epoch ms (Dates cannot cross google.script.run). */
  start: number;
  breakMinutes: number;
  onBreakSince: number | null;
}

export interface TripView {
  tripId: string;
  startOdometer: number;
  purpose: string;
}

export interface Boot {
  build: string;
  today: string;
  lists: Record<string, string[]>;
  clients: Option[];
  /** Leads with no client yet, newest first. */
  openLeads: Option[];
  shift: ShiftView | null;
  trip: TripView | null;
}

export type ApiResult =
  | { ok: true; message: string; boot: Boot }
  | { ok: false; error?: string; errors?: Record<string, string> };

/**
 * What the screenshot reader found, as form values for the new-client screen
 * (dates "yyyy-mm-dd", numbers as text). Nothing is saved until the agent
 * checks it and taps Save.
 */
export interface ContactDraft {
  client: Record<string, string>;
  policy: Record<string, string> | null;
  beneficiaries: Record<string, string>[];
  /** An open lead with the same phone or name. */
  leadId: string;
  /** Things to check before saving. */
  warnings: string[];
  /** Note lines the reader did not use: shown for review, never saved. */
  unread: string[];
  /** Lines left out because they hold SSN, card, bank or license numbers. */
  removed: number;
}

export type ReadResult = { ok: true; draft: ContactDraft } | { ok: false; error: string };

export interface ReceiptUpload {
  base64: string;
  mimeType: string;
  name: string;
}
