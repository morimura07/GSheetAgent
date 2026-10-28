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
  COMMISSION_RATES,
  EXPENSE_CATEGORIES,
  HOURS_ACTIVITIES,
  IRS_MILEAGE_RATES,
  LEAD_TYPES,
  MEDICARE_PLAN_TYPES,
  OK_COUNTIES,
  PERSISTENCY_START,
  PAYMENT_METHODS,
  PAYMENT_MODES,
  PLANS,
  POLICY_STATUSES,
  PREMIUM_PAID_BY,
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
  /** Formula columns: red when the value is not 100% / is below zero / is above zero. */
  warn?: 'notOne' | 'negative' | 'positive';
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

// Commissions (Phase 5). A policy's rates come from Settings > Commission rates: the
// row of its plan whose age band holds the client's age at issue (blank ages = any age).

/** Status groups that end a policy: the unearned advance is charged back. */
const ENDED_GROUPS = '"^(inactive|claim)$"';
const ended = `REGEXMATCH([[statusGroup]]&"",${ENDED_GROUPS})`;

/** `column` of the policy's commission-rate row, per row; `missing` when there is none. */
function rateLookup(column: string, missing: string): string {
  const band = (bound: string, op: string) =>
    `((set_CommissionRates_${bound}="")+ISNUMBER(a)*(a${op}set_CommissionRates_${bound}))`;
  const row = `FILTER(set_CommissionRates_${column},set_CommissionRates_plan=p,${band('fromAge', '>=')}*${band('toAge', '<=')})`;
  return `IFERROR(INDEX(${row},1),${missing})`;
}

/** Year-1 rate, or a message: unknown plan, plan of another carrier, no age or no band. */
const YEAR1_RATE = `MAP([[plan]],[[carrier]],[[ageAtIssue]],LAMBDA(p,c,a,IF(p="",,LET(pc,IFERROR(VLOOKUP(p,{set_Plans_plan,set_Plans_carrier},2,FALSE),"#"),r,${rateLookup('year1', '"#"')},IF(pc="#","Unknown plan",IF((pc<>"")*(c<>"")*(pc<>c),"Check carrier: plan is "&pc,IF(r<>"#",r,IF(ISNUMBER(a),"? No rate at age "&a,"Check age"))))))))`;

const renewalRate = (column: string) =>
  `MAP([[plan]],[[ageAtIssue]],LAMBDA(p,a,IF(p="",,${rateLookup(column, '""')})))`;

/** Months paid that fall in policy months from-to (to = null: no end), per row. */
function monthsIn(from: number, to: number | null): string {
  const p = '[[monthsPaid]]';
  const upper = to === null ? p : `IF(${p}>${to},${to},${p})`;
  return `IF(${p}<=${from},0,${upper}-${from})`;
}
const rateOr0 = (key: string) => `IF(ISNUMBER([[${key}]]),[[${key}]],0)`;

/** Shown only when the policy has months paid and a year-1 rate. */
const commissionIf = (expr: string) =>
  `ARRAYFORMULA(IF(([[monthsPaid]]="")+NOT(ISNUMBER([[commissionRate]])),,${expr}))`;

/** The advance less the year-1 commission earned on the months paid, when positive. */
const UNEARNED = `IF(ROUND([[advance]]-[[monthlyPremium]]*[[commissionRate]]*[[monthsPaid]],2)>0,ROUND([[advance]]-[[monthlyPremium]]*[[commissionRate]]*[[monthsPaid]],2),)`;

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
      // Commissions (Phase 5).
      {
        key: 'plan',
        header: 'Plan',
        type: 'list',
        list: 'Plans',
        width: 180,
        note: 'The carrier plan the commission rates come from (Settings > Plans)',
      },
      {
        key: 'paidBy',
        header: 'Premium paid by',
        type: 'list',
        list: 'PremiumPaidBy',
        note: 'Some carriers (CICA) only pay an advance when the premium comes by bank draft',
      },
      {
        key: 'ageAtIssue',
        header: 'Age at issue',
        type: 'formula',
        format: '0',
        width: 90,
        note: "Client's age on the effective date, else the issue date, else the application date",
        formula:
          'ARRAYFORMULA(IF([[clientId]]="",,LET(b,IFERROR(VLOOKUP([[clientId]],{[[Clients.clientId]],[[Clients.birthday]]},2,FALSE),""),dt,IF([[effectiveDate]]<>"",[[effectiveDate]],IF([[issueDate]]<>"",[[issueDate]],[[applicationDate]])),IF((b="")+(dt=""),"",IFERROR(IF(DATEDIF(b,dt,"Y")<18,"Check year",DATEDIF(b,dt,"Y")),"Check year")))))',
      },
      {
        key: 'commissionRate',
        header: 'Commission year 1',
        type: 'formula',
        format: '0.0#%',
        width: 130,
        sensitive: true,
        note: 'Settings > Commission rates for the plan and age at issue. A message here means no rate was found.',
        formula: YEAR1_RATE,
      },
      {
        key: 'rate2to5',
        header: 'Renewal years 2-5',
        type: 'formula',
        format: '0.0#%',
        sensitive: true,
        formula: renewalRate('years2to5'),
      },
      {
        key: 'rate6to10',
        header: 'Renewal years 6-10',
        type: 'formula',
        format: '0.0#%',
        sensitive: true,
        formula: renewalRate('years6to10'),
      },
      {
        key: 'rate11on',
        header: 'Renewal years 11+',
        type: 'formula',
        format: '0.0#%',
        sensitive: true,
        formula: renewalRate('years11on'),
      },
      {
        key: 'advanceMonths',
        header: 'Advance months',
        type: 'formula',
        format: '0',
        width: 90,
        note: 'Months of year-1 commission paid up front (Settings > Plans); 0 = paid as earned',
        formula:
          'ARRAYFORMULA(IF([[plan]]="",,IFERROR(VLOOKUP([[plan]],{set_Plans_plan,set_Plans_advanceMonths},2,FALSE)*IF(VLOOKUP([[plan]],{set_Plans_plan,set_Plans_bankDraftOnly},2,FALSE)=TRUE,[[paidBy]]="Bank draft",1),0)))',
      },
      {
        key: 'monthsPaidOverride',
        header: 'Months paid (if different)',
        type: 'number',
        width: 110,
        note: 'Type the months the client really paid when the estimate next to it is wrong',
      },
      {
        key: 'monthsPaid',
        header: 'Months paid',
        type: 'formula',
        format: '0',
        width: 90,
        note: 'Months of premium paid up to the report date (Dashboard > As of), counted from the persistency start. A lapsed or cancelled policy counts up to its Status date, without the draft that failed.',
        formula: `ARRAYFORMULA(IF(([[persistencyStart]]="")+NOT(REGEXMATCH([[statusGroup]]&"","^(active|at_risk|inactive|claim)$")),,IF([[monthsPaidOverride]]<>"",[[monthsPaidOverride]],LET(k,12/IFERROR(VLOOKUP([[paymentMode]],{set_PaymentModes_mode,set_PaymentModes_perYear},2,FALSE),12),m,${months('[[persistencyStart]]', `IF(${ended}*([[statusDate]]<>"")*([[statusDate]]<rep_asOf),[[statusDate]],rep_asOf)`)},IF(m<0,0,(FLOOR(m/k)+([[statusGroup]]="active"))*k)))))`,
      },
      {
        key: 'advance',
        header: 'Advance',
        type: 'formula',
        format: '$#,##0.00',
        sensitive: true,
        note: 'Monthly premium x year-1 rate x advance months, up to the plan advance limit, paid when the policy starts',
        formula: commissionIf(
          'ROUND(LET(a,[[monthlyPremium]]*[[commissionRate]]*[[advanceMonths]],l,IFERROR(1/(1/VLOOKUP([[plan]],{set_Plans_plan,set_Plans_advanceLimit},2,FALSE)),9E+99),IF(a>l,l,a)),2)',
        ),
      },
      {
        key: 'commissionEarned',
        header: 'Commission earned',
        type: 'formula',
        format: '$#,##0.00',
        sensitive: true,
        note: 'Earned on the months paid: year-1 rate on months 1-12, then the renewal rates',
        formula: commissionIf(
          `ROUND([[monthlyPremium]]*([[commissionRate]]*IF([[monthsPaid]]>12,12,[[monthsPaid]])+${rateOr0('rate2to5')}*${monthsIn(12, 60)}+${rateOr0('rate6to10')}*${monthsIn(60, 120)}+${rateOr0('rate11on')}*${monthsIn(120, null)}),2)`,
        ),
      },
      {
        key: 'unearnedAdvance',
        header: 'Advance not yet earned',
        type: 'formula',
        format: '$#,##0.00',
        sensitive: true,
        note: 'Part of the advance the client has not paid for yet: owed back if the policy lapses now',
        formula: commissionIf(`IF(${ended},,${UNEARNED})`),
      },
      {
        key: 'chargeback',
        header: 'Chargeback',
        type: 'formula',
        format: '$#,##0.00',
        sensitive: true,
        warn: 'positive',
        note: 'Lapsed, cancelled or death claim: the part of the advance not earned (paid 2 of 9 months: 7 months back)',
        formula: commissionIf(`IF(${ended},${UNEARNED},)`),
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

/** Commission rates can be over 100% (a percent column would cap them at 100%). */
const PERCENT = '0.0#%';

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
  {
    key: 'Plans',
    title: 'Plans',
    columns: [
      { key: 'plan', header: 'Plan', type: 'text' },
      { key: 'carrier', header: 'Carrier', type: 'text' },
      { key: 'advanceMonths', header: 'Advance months (0 = as earned)', type: 'number' },
      { key: 'bankDraftOnly', header: 'Advance only with bank draft', type: 'checkbox' },
      { key: 'confirmed', header: 'Confirmed', type: 'checkbox' },
      { key: 'advanceLimit', header: 'Advance limit $ (blank = none)', type: 'number' },
    ],
    seed: PLANS.map((p) => [
      p.name,
      p.carrier,
      p.advanceMonths,
      p.bankDraftOnly,
      p.confirmed,
      p.advanceLimit ?? '',
    ]),
  },
  {
    key: 'CommissionRates',
    title: 'Commission rates',
    columns: [
      { key: 'plan', header: 'Plan', type: 'text' },
      { key: 'fromAge', header: 'From age (blank = any)', type: 'number' },
      { key: 'toAge', header: 'To age (blank = any)', type: 'number' },
      { key: 'year1', header: 'Year 1', type: 'number', format: PERCENT },
      { key: 'years2to5', header: 'Years 2-5', type: 'number', format: PERCENT },
      { key: 'years6to10', header: 'Years 6-10', type: 'number', format: PERCENT },
      { key: 'years11on', header: 'Years 11+', type: 'number', format: PERCENT },
    ],
    seed: COMMISSION_RATES.map((r) =>
      [r.plan, r.fromAge, r.toAge, r.year1, r.years2to5, r.years6to10, r.years11on].map(
        (v) => v ?? '',
      ),
    ),
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
  PremiumPaidBy: { header: 'Premium paid by', seed: PREMIUM_PAID_BY },
} as const;

/** Dropdowns sourced from a Settings table column instead of the Lists tab. */
export const SETTINGS_LISTS = {
  Carriers: { table: 'Carriers', column: 'name' },
  PolicyStatuses: { table: 'PolicyStatuses', column: 'status' },
  PaymentModes: { table: 'PaymentModes', column: 'mode' },
  Plans: { table: 'Plans', column: 'plan' },
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
