// Workbook layout: every tab, column, dropdown and calculated column lives here.
// setupWorkbook() builds the spreadsheet from this, so change the layout here, not in Sheets.
//
// Formula columns hold an expression that fills rows 2+. Placeholders:
//   [[key]]       this tab's column, rows 2 to the bottom (e.g. K2:K)
//   [[Tab.key]]   another tab's column (e.g. 'Clients'!A2:A)
// Settings columns are named ranges: set_<Table>_<key>. Dropdown sources: list_<List>.

import {
  BENEFICIARY_TYPES,
  CARRIERS,
  EXPENSE_CATEGORIES,
  HOURS_ACTIVITIES,
  IRS_MILEAGE_RATES,
  LEAD_TYPES,
  MEDICARE_PLAN_TYPES,
  OK_COUNTIES,
  PERSISTENCY_START,
  PAYMENT_METHODS,
  PAYMENT_MODES,
  POLICY_STATUSES,
  PRODUCT_TYPES,
  SMOKER_OPTIONS,
  STATES,
} from './lists';

export type ColumnType =
  | 'id'
  | 'text'
  | 'date'
  | 'currency'
  | 'number'
  | 'percent'
  | 'checkbox'
  | 'list'
  | 'ref'
  | 'formula'
  | 'timestamp'
  | 'time';

export interface Column {
  key: string;
  header: string;
  type: ColumnType;
  /** Dropdown source for `list` columns. */
  list?: ListName;
  /** Tab whose ID column a `ref` column must match. */
  refTab?: DataTabName;
  /** Expression for `formula` columns (see placeholders above). */
  formula?: string;
  /** Number format for `formula` columns (other types get one from their type). */
  format?: string;
  /** Formula columns: red when the value is not 100% / is below zero. */
  warn?: 'notOne' | 'negative';
  /** Hidden from the assistant view (Phase 7). */
  sensitive?: boolean;
  width?: number;
  note?: string;
}

export type DataTabName =
  'Clients' | 'Policies' | 'Beneficiaries' | 'Leads' | 'Hours' | 'Mileage' | 'Expenses';

export interface DataTab {
  name: DataTabName;
  idPrefix: string;
  color: string;
  columns: Column[];
}

const createdAt: Column = { key: 'createdAt', header: 'Created', type: 'timestamp', width: 130 };

// ---- Formula helpers -----------------------------------------------------------

/** The first filled-in date of PERSISTENCY_START, as nested IFs. */
const PERSISTENCY_START_FORMULA = PERSISTENCY_START.reduceRight(
  (rest, key) => `IF([[${key}]]<>"",[[${key}]],${rest})`,
  '',
);
/** Status groups of issued policies (regex for REGEXMATCH). */
const ISSUED_GROUPS = '"^(active|at_risk|inactive)$"';

/** Whole months from `from` to `to`; works on whole columns inside ARRAYFORMULA. */
export function months(from: string, to: string): string {
  return `((YEAR(${to})-YEAR(${from}))*12+MONTH(${to})-MONTH(${from})-(DAY(${to})<DAY(${from})))`;
}

export const DATA_TABS: DataTab[] = [
  {
    name: 'Clients',
    idPrefix: 'CL',
    color: '#1a73e8',
    columns: [
      { key: 'clientId', header: 'Client ID', type: 'id' },
      { key: 'firstName', header: 'First name', type: 'text' },
      { key: 'lastName', header: 'Last name', type: 'text' },
      { key: 'phone', header: 'Phone', type: 'text' },
      { key: 'email', header: 'Email', type: 'text', width: 180 },
      { key: 'street', header: 'Street', type: 'text', width: 180 },
      { key: 'city', header: 'City', type: 'text' },
      { key: 'state', header: 'State', type: 'list', list: 'States', width: 60 },
      { key: 'zip', header: 'ZIP', type: 'text', width: 70 },
      { key: 'county', header: 'County', type: 'list', list: 'Counties' },
      { key: 'birthday', header: 'Birthday', type: 'date' },
      {
        key: 'age',
        header: 'Age',
        type: 'formula',
        width: 90,
        note: 'Shows "Check year" when the birthday looks saved without a birth year',
        // Contacts saved without a birth year come through as this year (age 0, or a
        // future date that DATEDIF rejects). No client is under 18, so flag those.
        formula:
          'ARRAYFORMULA(IF([[birthday]]="",,IFERROR(IF(DATEDIF([[birthday]],TODAY(),"Y")<18,"Check year",DATEDIF([[birthday]],TODAY(),"Y")),"Check year")))',
      },
      {
        key: 'birthdayThisMonth',
        header: 'Birthday this month',
        type: 'formula',
        formula:
          'ARRAYFORMULA(IF([[birthday]]="",,IF(MONTH([[birthday]])=MONTH(TODAY()),"Yes","")))',
      },
      { key: 'smoker', header: 'Smoker', type: 'list', list: 'Smoker' },
      { key: 'height', header: 'Height', type: 'text', width: 70, note: `e.g. 5'10"` },
      { key: 'weightLbs', header: 'Weight (lbs)', type: 'number', width: 90 },
      { key: 'existingCoverage', header: 'Existing coverage', type: 'text', width: 160 },
      { key: 'medicarePlan', header: 'Medicare plan', type: 'list', list: 'MedicarePlanTypes' },
      { key: 'medicareId', header: 'Medicare ID', type: 'text', sensitive: true },
      {
        key: 'leadSource',
        header: 'Lead source',
        type: 'formula',
        note: 'From the lead linked to this client on the Leads tab',
        formula:
          'ARRAYFORMULA(IF([[clientId]]="",,IFERROR(VLOOKUP([[clientId]],{[[Leads.clientId]],[[Leads.leadType]]},2,FALSE),"")))',
      },
      { key: 'referredBy', header: 'Referred by (Client ID)', type: 'ref', refTab: 'Clients' },
      { key: 'notes', header: 'Notes', type: 'text', width: 240 },
      createdAt,
    ],
  },
  {
    name: 'Policies',
    idPrefix: 'PO',
    color: '#188038',
    columns: [
      { key: 'policyId', header: 'Policy ID', type: 'id' },
      { key: 'clientId', header: 'Client ID', type: 'ref', refTab: 'Clients' },
      {
        key: 'clientName',
        header: 'Client name',
        type: 'formula',
        width: 160,
        formula:
          'ARRAYFORMULA(IF([[clientId]]="",,IFERROR(VLOOKUP([[clientId]],{[[Clients.clientId]],[[Clients.firstName]]&" "&[[Clients.lastName]]},2,FALSE),"Unknown client")))',
      },
      { key: 'carrier', header: 'Carrier', type: 'list', list: 'Carriers', width: 170 },
      {
        key: 'productType',
        header: 'Product type',
        type: 'list',
        list: 'ProductTypes',
        width: 190,
      },
      { key: 'policyNumber', header: 'Policy #', type: 'text' },
      { key: 'faceAmount', header: 'Face amount', type: 'currency' },
      { key: 'premium', header: 'Premium', type: 'currency' },
      { key: 'paymentMode', header: 'Payment mode', type: 'list', list: 'PaymentModes' },
      {
        key: 'monthlyPremium',
        header: 'Monthly premium',
        type: 'formula',
        note: 'Premium converted to monthly; blank payment mode counts as monthly',
        format: '$#,##0.00',
        formula:
          'ARRAYFORMULA(IF([[premium]]="",,ROUND([[premium]]*IFERROR(VLOOKUP([[paymentMode]],{set_PaymentModes_mode,set_PaymentModes_perYear},2,FALSE),12)/12,2)))',
      },
      { key: 'applicationDate', header: 'Application date', type: 'date' },
      { key: 'issueDate', header: 'Issue date', type: 'date' },
      { key: 'effectiveDate', header: 'Effective date', type: 'date' },
      { key: 'firstDraftDate', header: 'First draft date', type: 'date' },
      {
        key: 'draftDay',
        header: 'Draft day',
        type: 'text',
        width: 90,
        note: 'Monthly draft day, e.g. "4th Wed" (Social Security schedule) or "3rd"',
      },
      { key: 'status', header: 'Status', type: 'list', list: 'PolicyStatuses', width: 140 },
      {
        key: 'statusDate',
        header: 'Status date',
        type: 'date',
        note: 'Filled in automatically when Status changes',
      },
      {
        key: 'statusGroup',
        header: 'Status group',
        type: 'formula',
        formula:
          'ARRAYFORMULA(IF([[status]]="",,IFERROR(VLOOKUP([[status]],{set_PolicyStatuses_status,set_PolicyStatuses_group},2,FALSE),"?")))',
      },
      // Persistency helpers (Phase 3). "Issued" means status group active, at_risk or
      // inactive; pending, declined and death claims are left out.
      {
        key: 'persistencyStart',
        header: 'Persistency start',
        type: 'formula',
        format: 'mm/dd/yyyy',
        note: 'First draft date, else the effective date, else the issue date',
        formula: `ARRAYFORMULA(IF([[policyId]]="",,${PERSISTENCY_START_FORMULA}))`,
      },
      {
        key: 'monthsSinceStart',
        header: 'Months since start',
        type: 'formula',
        format: '0',
        note: 'Whole months from persistency start to the report date (Dashboard > As of)',
        formula: `ARRAYFORMULA(IF(([[persistencyStart]]="")+NOT(REGEXMATCH([[statusGroup]]&"",${ISSUED_GROUPS})),,${months('[[persistencyStart]]', 'rep_asOf')}))`,
      },
      {
        key: 'monthsInForce',
        header: 'Months in force',
        type: 'formula',
        format: '0',
        note: 'Whole months from persistency start until it lapsed or was cancelled (Status date), or to the report date',
        formula: `ARRAYFORMULA(IF([[monthsSinceStart]]="",,${months('[[persistencyStart]]', `IF(([[statusGroup]]="inactive")*([[statusDate]]<>"")*([[statusDate]]<rep_asOf),[[statusDate]],rep_asOf)`)}))`,
      },
      {
        key: 'assistantNotes',
        header: 'Assistant notes',
        type: 'text',
        width: 240,
        note: 'Shared with the assistant workbook; the assistant can change it',
      },
      { key: 'notes', header: 'Notes', type: 'text', width: 240 },
      createdAt,
    ],
  },
  {
    name: 'Beneficiaries',
    idPrefix: 'BN',
    color: '#9334e6',
    columns: [
      { key: 'beneficiaryId', header: 'Beneficiary ID', type: 'id' },
      { key: 'policyId', header: 'Policy ID', type: 'ref', refTab: 'Policies' },
      {
        key: 'clientName',
        header: 'Client name',
        type: 'formula',
        width: 160,
        formula:
          'ARRAYFORMULA(IF([[policyId]]="",,IFERROR(VLOOKUP([[policyId]],{[[Policies.policyId]],[[Policies.clientName]]},2,FALSE),"Unknown policy")))',
      },
      { key: 'name', header: 'Beneficiary name', type: 'text', sensitive: true, width: 170 },
      { key: 'relationship', header: 'Relationship', type: 'text', sensitive: true },
      { key: 'kind', header: 'Type', type: 'list', list: 'BeneficiaryTypes', width: 100 },
      { key: 'share', header: 'Share %', type: 'percent', sensitive: true, width: 80 },
      { key: 'phone', header: 'Phone', type: 'text', sensitive: true },
      {
        key: 'policyShareTotal',
        header: 'Policy total %',
        type: 'formula',
        note: 'Should be 100% for each policy: primary and contingent beneficiaries separately',
        format: '0%',
        warn: 'notOne',
        formula:
          'ARRAYFORMULA(IF([[policyId]]="",,SUMIF([[policyId]]&"|"&IF([[kind]]="","Primary",[[kind]]),[[policyId]]&"|"&IF([[kind]]="","Primary",[[kind]]),[[share]])))',
      },
      createdAt,
    ],
  },
  {
    name: 'Leads',
    idPrefix: 'LD',
    color: '#e37400',
    columns: [
      { key: 'leadId', header: 'Lead ID', type: 'id' },
      { key: 'dateReceived', header: 'Date received', type: 'date' },
      { key: 'leadType', header: 'Lead type', type: 'list', list: 'LeadTypes' },
      { key: 'firstName', header: 'First name', type: 'text' },
      { key: 'lastName', header: 'Last name', type: 'text' },
      { key: 'phone', header: 'Phone', type: 'text' },
      {
        key: 'cost',
        header: 'Cost',
        type: 'currency',
        note: 'Filled from Settings > lead costs on the date received; you can overwrite it',
      },
      { key: 'contacted', header: 'Contacted', type: 'checkbox', width: 85 },
      { key: 'appointmentSet', header: 'Appointment set', type: 'checkbox', width: 85 },
      { key: 'applicationWritten', header: 'Application written', type: 'checkbox', width: 85 },
      {
        key: 'clientId',
        header: 'Client ID (if application)',
        type: 'ref',
        refTab: 'Clients',
      },
      {
        key: 'clientName',
        header: 'Client name',
        type: 'formula',
        width: 160,
        formula:
          'ARRAYFORMULA(IF([[clientId]]="",,IFERROR(VLOOKUP([[clientId]],{[[Clients.clientId]],[[Clients.firstName]]&" "&[[Clients.lastName]]},2,FALSE),"Unknown client")))',
      },
      { key: 'referredBy', header: 'Referred by (Client ID)', type: 'ref', refTab: 'Clients' },
      {
        key: 'assistantNotes',
        header: 'Assistant notes',
        type: 'text',
        width: 240,
        note: 'Shared with the assistant workbook; the assistant can change it',
      },
      { key: 'notes', header: 'Notes', type: 'text', width: 240 },
      createdAt,
    ],
  },
  {
    // One row per work shift. The phone app clocks in/out and tracks breaks.
    name: 'Hours',
    idPrefix: 'HR',
    color: '#d93025',
    columns: [
      { key: 'shiftId', header: 'Shift ID', type: 'id' },
      { key: 'date', header: 'Date', type: 'date' },
      { key: 'start', header: 'Clock in', type: 'time', width: 100 },
      { key: 'end', header: 'Clock out', type: 'time', width: 100 },
      { key: 'breakMinutes', header: 'Break (min)', type: 'number', width: 90 },
      {
        key: 'breakStartedAt',
        header: 'On break since',
        type: 'time',
        width: 100,
        note: 'Set by the phone app while a break is running',
      },
      {
        key: 'hours',
        header: 'Hours worked',
        type: 'formula',
        format: '0.00',
        warn: 'negative',
        note: 'Clock out minus clock in, minus breaks',
        // MOD(...,1) handles both full date-times (phone app) and plain typed times.
        formula:
          'ARRAYFORMULA(IF(([[start]]="")+([[end]]=""),,ROUND(MOD([[end]]-[[start]],1)*24-IF([[breakMinutes]]="",0,[[breakMinutes]])/60,2)))',
      },
      { key: 'activity', header: 'Activity', type: 'list', list: 'HoursActivities' },
      { key: 'notes', header: 'Notes', type: 'text', width: 240 },
      createdAt,
    ],
  },
  {
    // One row per business trip, from odometer readings.
    name: 'Mileage',
    idPrefix: 'MI',
    color: '#007b83',
    columns: [
      { key: 'tripId', header: 'Trip ID', type: 'id' },
      { key: 'date', header: 'Date', type: 'date' },
      { key: 'startOdometer', header: 'Start odometer', type: 'number', width: 110 },
      { key: 'endOdometer', header: 'End odometer', type: 'number', width: 110 },
      {
        key: 'miles',
        header: 'Miles',
        type: 'formula',
        format: '#,##0.0',
        warn: 'negative',
        width: 80,
        formula:
          'ARRAYFORMULA(IF(([[startOdometer]]="")+([[endOdometer]]=""),,[[endOdometer]]-[[startOdometer]]))',
      },
      { key: 'purpose', header: 'Purpose', type: 'text', width: 200 },
      {
        key: 'rate',
        header: 'IRS rate',
        type: 'formula',
        format: '$0.000',
        width: 80,
        note: 'From Settings > IRS mileage rates on the trip date',
        formula:
          'ARRAYFORMULA(IF([[date]]="",,IFERROR(VLOOKUP([[date]],SORT(FILTER({set_MileageRates_from,set_MileageRates_rate},set_MileageRates_from<>"")),2,TRUE),"?")))',
      },
      {
        key: 'deduction',
        header: 'Deduction',
        type: 'formula',
        format: '$#,##0.00',
        formula:
          'ARRAYFORMULA(IF(([[miles]]="")+([[rate]]=""),,IFERROR(ROUND([[miles]]*[[rate]],2),"")))',
      },
      { key: 'notes', header: 'Notes', type: 'text', width: 240 },
      createdAt,
    ],
  },
  {
    name: 'Expenses',
    idPrefix: 'EX',
    color: '#b06000',
    columns: [
      { key: 'expenseId', header: 'Expense ID', type: 'id' },
      { key: 'date', header: 'Date', type: 'date' },
      { key: 'category', header: 'Category', type: 'list', list: 'ExpenseCategories' },
      { key: 'amount', header: 'Amount', type: 'currency' },
      { key: 'vendor', header: 'Vendor', type: 'text', width: 160 },
      { key: 'paymentMethod', header: 'Paid with', type: 'list', list: 'PaymentMethods' },
      {
        key: 'receipt',
        header: 'Receipt',
        type: 'text',
        width: 200,
        note: 'Link to the receipt photo in Google Drive (optional)',
      },
      { key: 'notes', header: 'Notes', type: 'text', width: 240 },
      createdAt,
    ],
  },
];

// ---- Settings tab: small tables side by side -------------------------------

export interface SettingsTable {
  key: string;
  title: string;
  columns: { key: string; header: string; type: ColumnType; list?: ListName; format?: string }[];
  seed: unknown[][];
}

export const SETTINGS_TABLES: SettingsTable[] = [
  {
    key: 'Carriers',
    title: 'Carriers',
    columns: [
      { key: 'name', header: 'Carrier', type: 'text' },
      { key: 'aliases', header: 'Shorthand in notes', type: 'text' },
      { key: 'medicareOnly', header: 'Medicare only', type: 'checkbox' },
    ],
    seed: CARRIERS.map((c) => [c.name, c.aliases.join(', '), !c.lines.includes('life')]),
  },
  {
    key: 'PolicyStatuses',
    title: 'Policy statuses',
    columns: [
      { key: 'status', header: 'Status', type: 'text' },
      { key: 'group', header: 'Group', type: 'text' },
    ],
    seed: POLICY_STATUSES.map((s) => [s.name, s.group]),
  },
  {
    key: 'PaymentModes',
    title: 'Payment modes',
    columns: [
      { key: 'mode', header: 'Payment mode', type: 'text' },
      { key: 'perYear', header: 'Payments per year', type: 'number' },
    ],
    seed: PAYMENT_MODES.map((m) => [m.name, m.perYear]),
  },
  {
    key: 'LeadCosts',
    title: 'Lead costs',
    columns: [
      { key: 'leadType', header: 'Lead type', type: 'list', list: 'LeadTypes' },
      { key: 'cost', header: 'Cost per lead', type: 'currency' },
      { key: 'from', header: 'From date', type: 'date' },
      { key: 'confirmed', header: 'Confirmed', type: 'checkbox' },
    ],
    seed: LEAD_TYPES.map((l) => [l.name, l.costPerLead, l.from, l.confirmed]),
  },
  {
    key: 'MileageRates',
    title: 'IRS mileage rates',
    columns: [
      { key: 'from', header: 'From date', type: 'date' },
      { key: 'rate', header: 'Rate per mile', type: 'currency', format: '$0.000' },
      { key: 'verified', header: 'Verified on IRS.gov', type: 'checkbox' },
    ],
    seed: IRS_MILEAGE_RATES.map((r) => [r.from, r.dollarsPerMile, r.verified]),
  },
];

// ---- Lists tab: plain dropdown lists, one per column -----------------------

export const SIMPLE_LISTS = {
  ProductTypes: { header: 'Product types', seed: PRODUCT_TYPES },
  MedicarePlanTypes: { header: 'Medicare plan types', seed: MEDICARE_PLAN_TYPES },
  Smoker: { header: 'Smoker', seed: SMOKER_OPTIONS },
  BeneficiaryTypes: { header: 'Beneficiary types', seed: BENEFICIARY_TYPES },
  LeadTypes: { header: 'Lead types', seed: LEAD_TYPES.map((l) => l.name) },
  ExpenseCategories: { header: 'Expense categories', seed: EXPENSE_CATEGORIES },
  PaymentMethods: { header: 'Payment methods', seed: PAYMENT_METHODS },
  HoursActivities: { header: 'Hours activities', seed: HOURS_ACTIVITIES },
  States: { header: 'States', seed: STATES },
  Counties: { header: 'Counties', seed: OK_COUNTIES },
} as const;

/** Dropdowns sourced from a Settings table column instead of the Lists tab. */
export const SETTINGS_LISTS = {
  Carriers: { table: 'Carriers', column: 'name' },
  PolicyStatuses: { table: 'PolicyStatuses', column: 'status' },
  PaymentModes: { table: 'PaymentModes', column: 'mode' },
} as const;

export type ListName = keyof typeof SIMPLE_LISTS | keyof typeof SETTINGS_LISTS;

export const LISTS_TAB = 'Lists';
export const SETTINGS_TAB = 'Settings';
export const DATA_ROWS = 1000;

export function dataTab(name: DataTabName): DataTab {
  const tab = DATA_TABS.find((t) => t.name === name);
  if (!tab) throw new Error(`Unknown tab ${name}`);
  return tab;
}

/** 1-based column number of `key` in `tab`. */
export function columnNumber(tab: DataTab, key: string): number {
  const i = tab.columns.findIndex((c) => c.key === key);
  if (i < 0) throw new Error(`${tab.name} has no column ${key}`);
  return i + 1;
}

/** 1-based first column of each Settings table (one blank column between tables). */
export function settingsTableStart(key: string): number {
  let col = 1;
  for (const table of SETTINGS_TABLES) {
    if (table.key === key) return col;
    col += table.columns.length + 1;
  }
  throw new Error(`Unknown settings table ${key}`);
}
