// The calculated tabs (Phase 3): Dashboard, Carriers, Lead results, Tax & hours.
// Everything is a live formula over the data tabs, so the reports stay current
// whether data comes from the phone app or is typed into the sheet. Setup
// rewrites these tabs completely; only the Dashboard's Year and As of inputs are kept.
//
// Two named cells drive every report:
//   rep_asOf  the report date: Dashboard "As of", or today when blank
//   rep_year  the report year: Dashboard "Year", or the year of rep_asOf when blank

import { DATA_TABS } from '../config/schema';
import { PERSISTENCY_MONTHS } from '../config/lists';
import { resolveFormula } from '../lib/columns';
import { ensureSheet, ensureSize } from './util';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
type Sheet = GoogleAppsScript.Spreadsheet.Sheet;
type Range = GoogleAppsScript.Spreadsheet.Range;

export const DASHBOARD = 'Dashboard';
export const CARRIERS_REPORT = 'Carriers';
export const LEADS_REPORT = 'Lead results';
export const TAX_REPORT = 'Tax & hours';
export const REPORT_TABS = [DASHBOARD, CARRIERS_REPORT, LEADS_REPORT, TAX_REPORT];

const PROTECTION_TAG = 'gsa:report';
const COLOR = '#202124';
const MONEY = '$#,##0.00';
const MONEY0 = '$#,##0';
const PCT = '0%';
const COUNT = '0';
const DATE = 'mm/dd/yyyy';

/** Dashboard input cells (kept across setups) and the cells that resolve them. */
const YEAR_INPUT = 'B3';
const ASOF_INPUT = 'B4';

// ---- Formula pieces ------------------------------------------------------------

/** Resolves [[Tab.key]] placeholders to whole-column ranges. */
const r = (expr: string) => resolveFormula(expr, DATA_TABS[0]);
const P = (key: string) => r(`[[Policies.${key}]]`);
const L = (key: string) => r(`[[Leads.${key}]]`);

const yearStart = 'DATE(rep_year,1,1)';
const nextYear = 'DATE(rep_year+1,1,1)';
/** COUNTIFS/SUMIFS criteria: `range` within the report year. */
const inYear = (range: string) => `${range},">="&${yearStart},${range},"<"&${nextYear}`;
/** ... within the month starting at `cell`. */
const inMonth = (range: string, cell: string) =>
  `${range},">="&${cell},${range},"<="&EOMONTH(${cell},0)`;
const and = (criteria: string[]) => criteria.map((c) => `,${c}`).join('');

/**
 * COUNTIFS/SUMIFS over several status groups, one call per group: a {"a","b"}
 * criterion only expands inside an array formula in Sheets.
 */
function byGroups(fn: string, groups: string[], rest: string, sumRange = ''): string {
  const calls = groups.map((g) => `${fn}(${sumRange}${P('statusGroup')},"${g}"${rest})`);
  return `(${calls.join('+')})`;
}

/** Policies in force on `day`: issued by then, and not lapsed/cancelled/claimed by then. */
function inForce(fn: 'COUNTIFS' | 'SUMIFS', day: string, criteria: string[] = []): string {
  const sum = fn === 'SUMIFS' ? `${P('monthlyPremium')},` : '';
  const start = `,${P('persistencyStart')},"<="&${day}`;
  const ended = `,${P('statusDate')},">"&${day}`;
  return (
    byGroups(fn, ['active', 'at_risk'], `${start}${and(criteria)}`, sum) +
    '+' +
    byGroups(fn, ['inactive', 'claim'], `${start}${ended}${and(criteria)}`, sum)
  );
}

/** Share of issued policies that lasted N months, among those started N+ months ago. */
function persistency(n: number, criteria: string[] = []): string {
  const eligible = `COUNTIFS(${P('monthsSinceStart')},">="&${n}${and(criteria)})`;
  const kept = `COUNTIFS(${P('monthsInForce')},">="&${n}${and(criteria)})`;
  return `IF(${eligible}=0,"",${kept}/${eligible})`;
}

/**
 * Commission paid as earned in the month starting at `cell`: for each policy, the
 * month's commission when that policy month was paid, less what still pays back the advance.
 * Policy month 0 is the persistency start's month; its rate depends on the policy year.
 */
function asEarned(cell: string): string {
  const start = P('persistencyStart');
  const idx = `((YEAR(${cell})-YEAR(${start}))*12+MONTH(${cell})-MONTH(${start}))`;
  // Year 1: the year-1 commission earned over `months` months, beyond the advance.
  const beyondAdvance = (months: string) =>
    `IF(ROUND(${P('monthlyPremium')}*${P('commissionRate')}*${months}-${P('advance')},2)>0,${P('monthlyPremium')}*${P('commissionRate')}*${months}-${P('advance')},0)`;
  const year1 = `${beyondAdvance(`(${idx}+1)`)}-${beyondAdvance(idx)}`;
  const renewal = `${P('monthlyPremium')}*IF(${idx}<60,${P('rate2to5')},IF(${idx}<120,${P('rate6to10')},${P('rate11on')}))`;
  return `SUMPRODUCT(IFERROR((${idx}>=0)*(${idx}<${P('monthsPaid')})*IF(${idx}<12,${year1},${renewal}),0))`;
}

/** Column letter of the 0-based column `i` (A-Z). */
const col = (i: number) => String.fromCharCode(65 + i);

/** One row per non-blank entry of `list`: the entry, then each column for it (spills). */
function perItem(list: string, columns: ((x: string) => string)[]): string {
  const maps = columns.map((col) => `MAP(items,LAMBDA(x,${col('x')}))`).join(',');
  return `=LET(items,FILTER(${list},${list}<>""),HSTACK(items,${maps}))`;
}

// ---- Setup ---------------------------------------------------------------------

/** The Year / As of inputs and their named cells; run before any formula uses them. */
export function setupReportInputs(
  ss: Spreadsheet,
  nameRange: (name: string, range: Range) => void,
): void {
  const sheet = ensureSheet(ss, DASHBOARD);
  ensureSize(sheet, 60, DASHBOARD_COLS);
  writeInputs(sheet);
  nameRange('rep_year', sheet.getRange('C3'));
  nameRange('rep_asOf', sheet.getRange('C4'));
}

/** Builds the report tabs (after the data tabs exist). */
export function setupReports(ss: Spreadsheet, lap: (step: string) => void = () => {}): void {
  buildDashboard(ss.getSheetByName(DASHBOARD)!);
  lap('dashboard');
  buildCarriers(ensureSheet(ss, CARRIERS_REPORT));
  lap('carriers report');
  buildLeads(ensureSheet(ss, LEADS_REPORT));
  lap('lead results');
  buildTax(ensureSheet(ss, TAX_REPORT));
  lap('tax & hours');
}

/** Empties a report tab (keeping the Dashboard inputs) before it is rebuilt. */
function reset(sheet: Sheet, rows: number, cols: number): void {
  for (const chart of sheet.getCharts()) sheet.removeChart(chart);
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearFormat();
  ensureSize(sheet, rows, cols);
  sheet.setFrozenRows(0);
  sheet.setTabColor(COLOR);
}

/** Writes rows of values/formulas ("=" first) from `a1`, with an optional format per column. */
function put(sheet: Sheet, a1: string, rows: unknown[][], formats?: (string | null)[]): Range {
  const width = Math.max(...rows.map((row) => row.length));
  const full = rows.map((row) => [...row, ...Array(width - row.length).fill('')]);
  const range = sheet.getRange(a1).offset(0, 0, full.length, width);
  range.setValues(full);
  formats?.forEach((f, i) => {
    if (f) range.offset(0, i, full.length, 1).setNumberFormat(f);
  });
  return range;
}

function title(sheet: Sheet, a1: string, text: string): void {
  sheet.getRange(a1).setValue(text).setFontSize(18).setFontWeight('bold');
}

function heading(range: Range): void {
  range.setFontWeight('bold').setFontColor('#ffffff').setBackground(COLOR).setWrap(true);
}

function note(sheet: Sheet, a1: string, text: string): void {
  sheet.getRange(a1).setValue(text).setFontColor('#5f6368').setFontStyle('italic');
}

/** Warning-only protection for a whole report tab, except `editable`. */
function protect(sheet: Sheet, editable: Range[] = []): void {
  for (const p of sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET)) {
    if (p.getDescription().startsWith(PROTECTION_TAG)) p.remove();
  }
  sheet
    .protect()
    .setDescription(`${PROTECTION_TAG} ${sheet.getName()}`)
    .setWarningOnly(true)
    .setUnprotectedRanges(editable);
}

// ---- Dashboard -----------------------------------------------------------------

/** Commission money in a period: also the last columns of the month table. */
const COMMISSION_ROWS = [
  'Commission advances',
  'Commission as earned',
  'Chargebacks',
  'Net commission',
];

/** Labels of the Dashboard's year figures, in order (the self-test reads them by label). */
export const DASHBOARD_ROWS = [
  'Applications written',
  'Annual premium written',
  'Policies issued',
  'Monthly premium in force',
  ...PERSISTENCY_MONTHS.map((n) => `Persistency ${n} months`),
  'Leads bought',
  'Lead cost',
  'Lead cost per application',
  'Hours worked',
  'Annual premium per hour',
  'Miles driven',
  'Mileage deduction',
  'Expenses',
  ...COMMISSION_ROWS,
  'Advance not yet earned',
];

/** Columns of the Dashboard's month table. */
export const MONTH_COLUMNS = [
  'Month',
  'Applications',
  'Monthly premium written',
  'Policies issued',
  'Premium in force (month end)',
  'Premium lost (lapses)',
  'Leads',
  'Lead cost',
  'Hours',
  'Miles',
  'Mileage deduction',
  'Expenses',
  ...COMMISSION_ROWS,
];

const MONTH_TABLE_ROW = 30;
const DASHBOARD_COLS = 18;

function buildDashboard(sheet: Sheet): void {
  const inputs = sheet.getRange(`${YEAR_INPUT}:${ASOF_INPUT}`).getValues();
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getMaxColumns()).clearContent();
  reset(sheet, 60, DASHBOARD_COLS);
  sheet.getRange(`${YEAR_INPUT}:${ASOF_INPUT}`).setValues(inputs);
  writeInputs(sheet);
  styleInputs(sheet);

  title(sheet, 'A1', 'Dashboard');
  note(sheet, 'D3', 'Blank = this year');
  note(sheet, 'D4', 'Blank = today');

  const apps = `COUNTIFS(${inYear(P('applicationDate'))})`;
  const ap = `SUMIFS(${P('monthlyPremium')},${inYear(P('applicationDate'))})*12`;
  const hours = `SUMIFS(${r('[[Hours.hours]]')},${inYear(r('[[Hours.date]]'))})`;
  const leadApps = `COUNTIFS(${L('applicationWritten')},TRUE,${inYear(L('dateReceived'))})`;
  const leadCost = `SUMIFS(${L('cost')},${inYear(L('dateReceived'))})`;
  const values: [string, string][] = [
    [`=${apps}`, COUNT],
    [`=${ap}`, MONEY0],
    [`=COUNTIFS(${inYear(P('issueDate'))})`, COUNT],
    [`=${inForce('SUMIFS', 'rep_asOf')}`, MONEY],
    ...PERSISTENCY_MONTHS.map((n): [string, string] => [`=${persistency(n)}`, PCT]),
    [`=COUNTIFS(${inYear(L('dateReceived'))})`, COUNT],
    [`=${leadCost}`, MONEY],
    [`=IF(${leadApps}=0,"",${leadCost}/${leadApps})`, MONEY],
    [`=${hours}`, '0.0'],
    [`=IF(${hours}=0,"",${ap}/${hours})`, MONEY0],
    [`=SUMIFS(${r('[[Mileage.miles]]')},${inYear(r('[[Mileage.date]]'))})`, '#,##0.0'],
    [`=SUMIFS(${r('[[Mileage.deduction]]')},${inYear(r('[[Mileage.date]]'))})`, MONEY],
    [`=SUMIFS(${r('[[Expenses.amount]]')},${inYear(r('[[Expenses.date]]'))})`, MONEY],
    // The month table's totals (columns after the first 12).
    ...COMMISSION_ROWS.map((_, i): [string, string] => [
      `=${col(MONTH_COLUMNS.length - COMMISSION_ROWS.length + i)}${MONTH_TABLE_ROW + 13}`,
      MONEY,
    ]),
    [`=SUM(${P('unearnedAdvance')})`, MONEY],
  ];
  const top = 6;
  heading(put(sheet, `A${top}`, [['="Year "&rep_year', '']]));
  const body = put(
    sheet,
    `A${top + 1}`,
    DASHBOARD_ROWS.map((label, i) => [label, values[i][0]]),
  );
  values.forEach(([, format], i) => body.offset(i, 1, 1, 1).setNumberFormat(format));
  note(
    sheet,
    `A${top + DASHBOARD_ROWS.length + 1}`,
    'Annual premium = monthly premium x 12. Persistency: share of issued policies still in force N months after they started (death claims left out). Commission: advances when a policy starts, as earned for each month paid after the advance months, chargebacks on the date a policy ends.',
  );

  // Month table for the report year.
  const head = MONTH_TABLE_ROW;
  heading(put(sheet, `A${head}`, [MONTH_COLUMNS]));
  const rows = Array.from({ length: 12 }, (_, i) => {
    const row = head + 1 + i;
    const m = `$A${row}`;
    const money = MONTH_COLUMNS.length - COMMISSION_ROWS.length;
    return [
      `=DATE(rep_year,${i + 1},1)`,
      `=COUNTIFS(${inMonth(P('applicationDate'), m)})`,
      `=SUMIFS(${P('monthlyPremium')},${inMonth(P('applicationDate'), m)})`,
      `=COUNTIFS(${inMonth(P('issueDate'), m)})`,
      `=${inForce('SUMIFS', `EOMONTH(${m},0)`)}`,
      `=SUMIFS(${P('monthlyPremium')},${P('statusGroup')},"inactive",${inMonth(P('statusDate'), m)})`,
      `=COUNTIFS(${inMonth(L('dateReceived'), m)})`,
      `=SUMIFS(${L('cost')},${inMonth(L('dateReceived'), m)})`,
      `=SUMIFS(${r('[[Hours.hours]]')},${inMonth(r('[[Hours.date]]'), m)})`,
      `=SUMIFS(${r('[[Mileage.miles]]')},${inMonth(r('[[Mileage.date]]'), m)})`,
      `=SUMIFS(${r('[[Mileage.deduction]]')},${inMonth(r('[[Mileage.date]]'), m)})`,
      `=SUMIFS(${r('[[Expenses.amount]]')},${inMonth(r('[[Expenses.date]]'), m)})`,
      `=SUMIFS(${P('advance')},${inMonth(P('persistencyStart'), m)})`,
      `=${asEarned(m)}`,
      `=SUMIFS(${P('chargeback')},${inMonth(P('statusDate'), m)})`,
      `=${col(money)}${row}+${col(money + 1)}${row}-${col(money + 2)}${row}`,
    ];
  });
  const total = MONTH_COLUMNS.map((_, i) =>
    i === 0
      ? 'Total'
      : i === 4
        ? '' // in force is a balance, not a flow
        : `=SUM(${col(i)}${head + 1}:${col(i)}${head + 12})`,
  );
  const formats = [
    'mmm yyyy',
    COUNT,
    MONEY,
    COUNT,
    MONEY,
    MONEY,
    COUNT,
    MONEY,
    '0.0',
    '#,##0.0',
    MONEY,
    MONEY,
    ...COMMISSION_ROWS.map(() => MONEY),
  ];
  put(sheet, `A${head + 1}`, [...rows, total], formats);
  sheet.getRange(head + 13, 1, 1, MONTH_COLUMNS.length).setFontWeight('bold');

  const chart = sheet
    .newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(sheet.getRange(head, 1, 13, 1))
    .addRange(sheet.getRange(head, 3, 13, 1))
    .addRange(sheet.getRange(head, 5, 13, 1))
    .setNumHeaders(1)
    .setOption('title', 'Monthly premium: written and in force')
    .setOption('legend', { position: 'bottom' })
    .setPosition(6, 4, 0, 0)
    .build();
  sheet.insertChart(chart);

  sheet.setColumnWidth(1, 210);
  sheet.setColumnWidths(2, MONTH_COLUMNS.length - 1, 120);
  sheet.getRange(head, 1, 1, MONTH_COLUMNS.length).setVerticalAlignment('middle');
  protect(sheet, [sheet.getRange(`${YEAR_INPUT}:${ASOF_INPUT}`)]);
}

/** The input labels and the cells that resolve them (rep_year, rep_asOf). */
function writeInputs(sheet: Sheet): void {
  sheet.getRange('A3:A4').setValues([['Year'], ['As of']]);
  sheet
    .getRange('C3:C4')
    .setFormulas([
      [`=IF(${YEAR_INPUT}="",YEAR(C4),${YEAR_INPUT})`],
      [`=IF(${ASOF_INPUT}="",TODAY(),${ASOF_INPUT})`],
    ]);
}

function styleInputs(sheet: Sheet): void {
  sheet.getRange('A3:A4').setFontWeight('bold');
  sheet
    .getRange(YEAR_INPUT)
    .setNumberFormat('0')
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireNumberBetween(2000, 2100)
        .setHelpText('A year, e.g. 2026. Leave blank for this year.')
        .build(),
    );
  sheet
    .getRange(ASOF_INPUT)
    .setNumberFormat(DATE)
    .setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireDate()
        .setHelpText('A date. Leave blank for today.')
        .build(),
    );
  sheet.getRange(`${YEAR_INPUT}:${ASOF_INPUT}`).setBackground('#fef7e0');
  sheet.getRange('C3:C4').setFontColor('#5f6368');
  sheet.getRange('C3').setNumberFormat('0');
  sheet.getRange('C4').setNumberFormat(DATE);
}

// ---- Carriers ------------------------------------------------------------------

export const CARRIER_COLUMNS = [
  'Carrier',
  'Written',
  'Issued',
  'Pending',
  'In force',
  'Lapsed / cancelled',
  ...PERSISTENCY_MONTHS.map((n) => `Persistency ${n} mo`),
  'Monthly premium in force',
  'Average monthly premium',
  'Advances',
  'Commission earned',
  'Chargebacks',
  'Advance not yet earned',
];

/** The carrier/product columns for COUNTIFS criteria `c` (none = all policies). */
function policyStats(c: string[]): string[] {
  const inForceCount = inForce('COUNTIFS', 'rep_asOf', c);
  const inForcePremium = inForce('SUMIFS', 'rep_asOf', c);
  return [
    `COUNTIFS(${P('policyId')},"<>"${and(c)})`,
    byGroups('COUNTIFS', ['active', 'at_risk', 'inactive', 'claim'], and(c)),
    `COUNTIFS(${P('statusGroup')},"pending"${and(c)})`,
    inForceCount,
    `COUNTIFS(${P('statusGroup')},"inactive"${and(c)})`,
    ...PERSISTENCY_MONTHS.map((n) => persistency(n, c)),
    inForcePremium,
    `IF(${inForceCount}=0,"",(${inForcePremium})/(${inForceCount}))`,
    ...['advance', 'commissionEarned', 'chargeback', 'unearnedAdvance'].map(
      (key) => `SUMIFS(${P(key)},${P('policyId')},"<>"${and(c)})`,
    ),
  ];
}

const STAT_FORMATS = [
  null,
  COUNT,
  COUNT,
  COUNT,
  COUNT,
  COUNT,
  ...PERSISTENCY_MONTHS.map(() => PCT),
  MONEY,
  MONEY,
  MONEY,
  MONEY,
  MONEY,
  MONEY,
];

function buildCarriers(sheet: Sheet): void {
  sheet.clear();
  reset(sheet, 60, CARRIER_COLUMNS.length + 9);
  title(sheet, 'A1', 'Carriers');
  put(sheet, 'A2', [['="As of "&TEXT(rep_asOf,"m/d/yyyy")&" · Dashboard > As of"']]);

  heading(put(sheet, 'A4', [CARRIER_COLUMNS]));
  put(sheet, 'A5', [['All carriers', ...policyStats([]).map((f) => `=${f}`)]], STAT_FORMATS);
  sheet.getRange(5, 1, 1, CARRIER_COLUMNS.length).setFontWeight('bold');
  put(sheet, 'A6', [
    [
      perItem(
        'list_Carriers',
        policyStats([`${P('carrier')},x`]).map((f) => () => f),
      ),
    ],
  ]);
  // The spilled rows take the formats of a block of 40 rows.
  STAT_FORMATS.forEach((f, i) => f && sheet.getRange(6, i + 1, 40, 1).setNumberFormat(f));

  // Products, to the right of the carriers.
  const productCols = [
    'Product type',
    'Written',
    'Issued',
    'Pending',
    'In force',
    'Lapsed / cancelled',
  ];
  const left = CARRIER_COLUMNS.length + 2;
  const at = (row: number) => sheet.getRange(row, left).getA1Notation();
  heading(put(sheet, at(4), [[...productCols, 'Monthly premium in force']]));
  const productStats = (c: string[]) => {
    const all = policyStats(c);
    return [...all.slice(0, 5), all[5 + PERSISTENCY_MONTHS.length]];
  };
  const productFormats = [null, COUNT, COUNT, COUNT, COUNT, COUNT, MONEY];
  put(sheet, at(5), [['All products', ...productStats([]).map((f) => `=${f}`)]], productFormats);
  sheet.getRange(5, left, 1, productCols.length + 1).setFontWeight('bold');
  put(sheet, at(6), [
    [
      perItem(
        'list_ProductTypes',
        productStats([`${P('productType')},x`]).map((f) => () => f),
      ),
    ],
  ]);
  productFormats.forEach((f, i) => f && sheet.getRange(6, left + i, 40, 1).setNumberFormat(f));

  note(
    sheet,
    'A3',
    'Persistency N mo: of the issued policies that started at least N months ago, the share still in force N months after they started. Death claims are left out. Commission: as of the report date.',
  );
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidths(2, CARRIER_COLUMNS.length - 1, 95);
  sheet.setColumnWidth(left, 200);
  sheet.setColumnWidth(left - 1, 24);
  sheet.setFrozenRows(4);
  protect(sheet);
}

// ---- Lead results --------------------------------------------------------------

export const LEAD_COLUMNS = [
  'Lead type',
  'Leads',
  'Cost',
  'Contacted',
  'Contact rate',
  'Appointments',
  'Appointment rate',
  'Applications',
  'Close rate',
  'Cost per application',
  'Monthly premium written',
  'Annual premium per $1 of leads',
];

function leadStats(c: string[], type: string | null): string[] {
  const year = inYear(L('dateReceived'));
  const count = (extra = '') => `COUNTIFS(${year}${extra}${and(c)})`;
  const leads = count();
  const cost = `SUMIFS(${L('cost')},${year}${and(c)})`;
  const contacted = count(`,${L('contacted')},TRUE`);
  const appts = count(`,${L('appointmentSet')},TRUE`);
  const apps = count(`,${L('applicationWritten')},TRUE`);
  const rate = (n: string) => `IF(${leads}=0,"",${n}/${leads})`;
  // Premium of the policies of clients that came from these leads.
  const typeTest = type ? `,${L('leadType')}=${type}` : '';
  const clients = `FILTER(${L('clientId')},${L('clientId')}<>"",YEAR(${L('dateReceived')})=rep_year${typeTest})`;
  const premium = `IFERROR(SUMPRODUCT(ISNUMBER(MATCH(${P('clientId')},${clients},0))*${P('monthlyPremium')}),0)`;
  return [
    leads,
    cost,
    contacted,
    rate(contacted),
    appts,
    rate(appts),
    apps,
    rate(apps),
    `IF(${apps}=0,"",${cost}/${apps})`,
    premium,
    `IF(${cost}=0,"",${premium}*12/${cost})`,
  ];
}

const LEAD_FORMATS = [null, COUNT, MONEY, COUNT, PCT, COUNT, PCT, COUNT, PCT, MONEY, MONEY, MONEY];

function buildLeads(sheet: Sheet): void {
  sheet.clear();
  reset(sheet, 40, LEAD_COLUMNS.length);
  title(sheet, 'A1', 'Lead results');
  put(sheet, 'A2', [['="Leads received in "&rep_year&" · Dashboard > Year"']]);
  heading(put(sheet, 'A4', [LEAD_COLUMNS]));
  put(sheet, 'A5', [['All lead types', ...leadStats([], null).map((f) => `=${f}`)]], LEAD_FORMATS);
  sheet.getRange(5, 1, 1, LEAD_COLUMNS.length).setFontWeight('bold');
  put(sheet, 'A6', [
    [
      perItem(
        'list_LeadTypes',
        leadStats([`${L('leadType')},x`], 'x').map((f) => () => f),
      ),
    ],
  ]);
  LEAD_FORMATS.forEach((f, i) => f && sheet.getRange(6, i + 1, 30, 1).setNumberFormat(f));
  note(
    sheet,
    'A3',
    'A lead succeeds when an application is written. Premium written: policies of the clients linked to these leads.',
  );
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidths(2, LEAD_COLUMNS.length - 1, 110);
  sheet.setFrozenRows(4);
  protect(sheet);
}

// ---- Tax & hours ---------------------------------------------------------------

export const TAX_ROWS = {
  miles: 'Miles driven',
  deduction: 'Mileage deduction (IRS rate)',
  otherExpenses: 'Expenses except gas',
  total: 'Total to deduct (mileage + expenses except gas)',
  gas: 'Gas (for your records: not deducted with the mileage rate)',
  leadTab: 'Lead cost on the Leads tab',
};

function buildTax(sheet: Sheet): void {
  sheet.clear();
  reset(sheet, 70, 6);
  title(sheet, 'A1', 'Tax & hours');
  put(sheet, 'A2', [['="Year "&rep_year&" · Dashboard > Year"']]);

  const year = (tab: string, date = 'date') => inYear(r(`[[${tab}.${date}]]`));
  const amount = r('[[Expenses.amount]]');
  const expenses = `SUMIFS(${amount},${year('Expenses')})`;
  const gas = `SUMIFS(${amount},${r('[[Expenses.category]]')},"*gas*",${year('Expenses')})`;
  const deduction = `SUMIFS(${r('[[Mileage.deduction]]')},${year('Mileage')})`;

  heading(put(sheet, 'A4', [['Car and expenses', 'Amount']]));
  put(
    sheet,
    'A5',
    [
      [TAX_ROWS.miles, `=SUMIFS(${r('[[Mileage.miles]]')},${year('Mileage')})`],
      [TAX_ROWS.deduction, `=${deduction}`],
      [TAX_ROWS.otherExpenses, `=${expenses}-${gas}`],
      [TAX_ROWS.total, `=${deduction}+${expenses}-${gas}`],
      [TAX_ROWS.gas, `=${gas}`],
      [TAX_ROWS.leadTab, `=SUMIFS(${L('cost')},${inYear(L('dateReceived'))})`],
    ],
    [null, MONEY],
  );
  sheet.getRange('B5').setNumberFormat('#,##0.0');
  sheet.getRange('A8:B8').setFontWeight('bold');
  note(
    sheet,
    'A12',
    'Standard mileage method (miles on the 1040): the IRS rate already covers fuel, so gas is not deducted on top of it.',
  );
  note(
    sheet,
    'A13',
    'Lead cost on the Leads tab is what the leads cost by type; to deduct it, record what you paid as Leads expenses.',
  );

  heading(put(sheet, 'A15', [['Expenses by category', 'Amount']]));
  put(sheet, 'A16', [
    [
      perItem('list_ExpenseCategories', [
        (x) => `SUMIFS(${amount},${r('[[Expenses.category]]')},${x},${year('Expenses')})`,
      ]),
    ],
  ]);
  sheet.getRange('B16:B30').setNumberFormat(MONEY);

  // Hours: the last 12 weeks up to the report date (weeks start on Monday).
  heading(put(sheet, 'D4', [['Week starting', 'Hours']]));
  const hours = r('[[Hours.hours]]');
  const hourDate = r('[[Hours.date]]');
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const start = `rep_asOf-WEEKDAY(rep_asOf,3)-${7 * (11 - i)}`;
    return [
      `=${start}`,
      `=SUMIFS(${hours},${hourDate},">="&D${5 + i},${hourDate},"<"&D${5 + i}+7)`,
    ];
  });
  put(sheet, 'D5', weeks, [DATE, '0.0']);
  put(sheet, 'D17', [['Hours in the year', `=SUMIFS(${hours},${year('Hours')})`]], [null, '0.0']);
  sheet.getRange('D17:E17').setFontWeight('bold');
  note(sheet, 'D18', 'Hours by month are on the Dashboard.');

  sheet.setColumnWidth(1, 470);
  sheet.setColumnWidth(2, 120);
  sheet.setColumnWidth(3, 30);
  sheet.setColumnWidth(4, 160);
  sheet.setColumnWidth(5, 90);
  protect(sheet);
}
