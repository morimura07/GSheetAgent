// Phase 3 integration tests: the report tabs. A small dataset with every
// expected number worked out by hand, reported "as of" 9/30/2026 for 2026, so
// the results do not depend on the day the test runs.

import { type DataTabName } from '../config/schema';
import { appendRecords, readRecords, updateRecord } from '../sheets/records';
import {
  CARRIERS_REPORT,
  DASHBOARD,
  DASHBOARD_ROWS,
  LEADS_REPORT,
  MONTH_COLUMNS,
  TAX_REPORT,
  TAX_ROWS,
} from '../sheets/reports';
import { TAB_ORDER, setupWorkbook } from '../sheets/setup';
import { eq, ok, stopwatch, type TestCase } from './harness';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

const d = (iso: string, h = 0, m = 0) => {
  const [y, mo, day] = iso.split('-').map(Number);
  return new Date(y, mo - 1, day, h, m);
};
const rows = (ss: Spreadsheet, tab: DataTabName) => readRecords(ss, tab).map((r) => r.rec);

/** Cell values of the row whose column-A label is `label` (first match from `fromRow`). */
function rowOf(ss: Spreadsheet, tab: string, label: string, fromRow = 1): unknown[] {
  const values = ss.getSheetByName(tab)!.getDataRange().getValues();
  const row = values.slice(fromRow - 1).find((r) => r[0] === label);
  if (!row) throw new Error(`${tab}: no row "${label}"`);
  return row;
}

/** Rounded so floating point does not decide a test. */
const round = (v: unknown) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v);
const roundAll = (vs: unknown[]) => vs.map(round);

function loadReportData(ss: Spreadsheet): void {
  const ids = appendRecords(
    ss,
    'Clients',
    [1, 2, 3, 4, 5].map((n) => ({ firstName: 'Test', lastName: `Report ${n}` })),
  ).map((c) => String(c.clientId));
  const [C1, C2, C3, C4, C5] = ids;
  const policies = appendRecords(ss, 'Policies', [
    { clientId: C1, carrier: 'Combined Insurance', productType: 'Final expense - Level', premium: 100, paymentMode: 'Monthly', applicationDate: d('2026-01-05'), issueDate: d('2026-01-10'), effectiveDate: d('2026-01-15'), status: 'Paid as issued' },
    { clientId: C1, carrier: 'Combined Insurance', productType: 'Final expense - Graded', premium: 50, paymentMode: 'Monthly', applicationDate: d('2026-01-20'), issueDate: d('2026-01-28'), effectiveDate: d('2026-02-01'), status: 'Lapsed' },
    { clientId: C2, carrier: 'Guarantee Trust Life', productType: 'Final expense - Graded', premium: 1200, paymentMode: 'Annual', applicationDate: d('2026-05-25'), issueDate: d('2026-05-30'), effectiveDate: d('2026-06-01'), status: 'Paid as issued' },
    { clientId: C4, carrier: 'Mutual of Omaha', productType: 'Final expense - Level', premium: 80, paymentMode: 'Monthly', applicationDate: d('2026-09-10'), status: 'Pending' },
    { clientId: C5, carrier: 'Mutual of Omaha', productType: 'Final expense - Level', premium: 60, paymentMode: 'Monthly', applicationDate: d('2025-07-01'), issueDate: d('2025-07-25'), effectiveDate: d('2025-08-01'), status: 'Deceased' },
    { clientId: C3, carrier: 'Combined Insurance', productType: 'Final expense - Level', premium: 70, paymentMode: 'Monthly', applicationDate: d('2026-07-20'), issueDate: d('2026-07-30'), effectiveDate: d('2026-08-01'), status: 'Insufficient funds' },
  ]); // prettier-ignore
  // Appending stamps today as the status date; set the real ones.
  const byId = new Map(readRecords(ss, 'Policies').map((r) => [r.rec.policyId, r.row]));
  const statusDates = ['2026-01-15', '2026-05-10', '2026-06-01', '', '2026-03-01', '2026-08-01'];
  policies.forEach((p, i) =>
    updateRecord(ss, 'Policies', byId.get(p.policyId)!, {
      statusDate: statusDates[i] ? d(statusDates[i]) : '',
    }),
  );

  appendRecords(ss, 'Leads', [
    { dateReceived: d('2026-01-02'), leadType: 'Yes lead', firstName: 'Test', contacted: true, appointmentSet: true, applicationWritten: true, clientId: C1 },
    { dateReceived: d('2026-02-03'), leadType: 'Yes lead', firstName: 'Test', contacted: true },
    { dateReceived: d('2026-03-05'), leadType: 'Survey lead', firstName: 'Test', contacted: true, appointmentSet: true, applicationWritten: true, clientId: C2 },
    { dateReceived: d('2026-09-01'), leadType: 'Survey lead', firstName: 'Test' },
  ]); // prettier-ignore
  appendRecords(ss, 'Hours', [
    { date: d('2026-09-01'), start: d('2026-09-01', 9), end: d('2026-09-01', 17), breakMinutes: 30 },
    { date: d('2026-08-15'), start: d('2026-08-15', 8), end: d('2026-08-15', 16), breakMinutes: 0 },
  ]); // prettier-ignore
  appendRecords(ss, 'Mileage', [
    { date: d('2026-03-10'), startOdometer: 0, endOdometer: 100 },
    { date: d('2026-08-01'), startOdometer: 100, endOdometer: 150 },
  ]);
  appendRecords(ss, 'Expenses', [
    { date: d('2026-03-10'), category: 'Gas', amount: 40 },
    { date: d('2026-06-01'), category: 'Food', amount: 25 },
    { date: d('2026-01-15'), category: 'Leads', amount: 66 },
    { date: d('2025-12-31'), category: 'Misc', amount: 10 }, // other year
  ]);
  const dash = ss.getSheetByName(DASHBOARD)!;
  dash.getRange('B3:B4').setValues([[2026], [d('2026-09-30')]]);
  SpreadsheetApp.flush();
}

/** Error values (#REF!, #NAME?…) on the report tabs, e.g. a spill blocked by another block. */
function reportErrors(ss: Spreadsheet): string[] {
  return [DASHBOARD, CARRIERS_REPORT, LEADS_REPORT, TAX_REPORT].flatMap((name) =>
    ss
      .getSheetByName(name)!
      .getDataRange()
      .getDisplayValues()
      .flat()
      .filter((v) => /^#(REF|NAME|VALUE|ERROR|N\/A|DIV|NUM)/.test(v))
      .map((v) => `${name}: ${v}`),
  );
}

export const PHASE3_CASES: TestCase[] = [
  {
    name: 'setup adds the report tabs first',
    run: (ss) => {
      const t = stopwatch();
      setupWorkbook(ss, t.lap);
      eq(
        ss.getSheets().map((s) => s.getName()),
        TAB_ORDER,
        'tab order',
      );
      eq(TAB_ORDER.slice(0, 4), [DASHBOARD, CARRIERS_REPORT, LEADS_REPORT, TAX_REPORT], 'reports');
      eq(reportErrors(ss), [], 'formula errors on an empty workbook');
      return t.summary();
    },
  },
  {
    name: 'policy persistency columns: start, months since start, months in force',
    run: (ss) => {
      loadReportData(ss);
      const p = rows(ss, 'Policies');
      eq(
        p.map((r) => [r.monthsSinceStart, r.monthsInForce]),
        [
          [8, 8],
          [7, 3],
          [3, 3],
          ['', ''],
          ['', ''],
          [1, 1],
        ],
        'months (pending and death claim left out)',
      );
      eq(p[1].persistencyStart instanceof Date, true, 'start is a date');
      eq(p[4].statusGroup, 'claim', 'Deceased is a claim, not a lapse');
    },
  },
  {
    name: 'Dashboard year figures',
    run: (ss) => {
      const value = (label: string) => round(rowOf(ss, DASHBOARD, label)[1]);
      eq(
        DASHBOARD_ROWS.map(value),
        [5, 4800, 4, 270, 1, 0.5, '', '', 4, 66, 33, 15.5, round(4800 / 15.5), 150, 110.5, 131],
        DASHBOARD_ROWS.join(' | '),
      );
    },
  },
  {
    name: 'Dashboard month table: written, issued, in force, lapses, leads, hours, car',
    run: (ss) => {
      const month = (label: string) => {
        const table = ss.getSheetByName(DASHBOARD)!.getDataRange().getValues();
        const head = table.findIndex((r) => r[0] === MONTH_COLUMNS[0]);
        const row = table.slice(head + 1).find((r) => {
          const m = r[0];
          return m instanceof Date && m.toLocaleString('en-US', { month: 'short' }) === label;
        });
        if (!row) throw new Error(`no month ${label}`);
        return roundAll(row.slice(1));
      };
      eq(month('Jan'), [2, 150, 2, 160, 0, 1, 10, 0, 0, 0, 66], 'Jan');
      eq(month('Feb'), [0, 0, 0, 210, 0, 1, 10, 0, 0, 0, 0], 'Feb (lapsed in May: still in force)');
      eq(
        month('Mar'),
        [0, 0, 0, 150, 0, 1, 23, 0, 100, 72.5, 40],
        'Mar (death claim ends P5, not a lapse)',
      );
      eq(month('May'), [1, 100, 1, 100, 50, 0, 0, 0, 0, 0, 0], 'May (lapse)');
      eq(month('Aug'), [0, 0, 0, 270, 0, 0, 0, 8, 50, 38, 0], 'Aug');
      eq(month('Sep'), [1, 80, 0, 270, 0, 1, 23, 7.5, 0, 0, 0], 'Sep');
      eq(
        roundAll(rowOf(ss, DASHBOARD, 'Total').slice(1)),
        [5, 400, 4, '', 50, 4, 66, 15.5, 150, 110.5, 131],
        'totals',
      );
      ok(ss.getSheetByName(DASHBOARD)!.getCharts().length === 1, 'premium chart');
    },
  },
  {
    name: 'Carriers: counts, persistency 3/6/9/12, premium in force',
    run: (ss) => {
      const carrier = (name: string) => roundAll(rowOf(ss, CARRIERS_REPORT, name).slice(1, 12));
      //                             written issued pending inForce lapsed 3m 6m 9m 12m premium avg
      eq(carrier('All carriers'), [6, 5, 1, 3, 1, 1, 0.5, '', '', 270, 90], 'all');
      eq(carrier('Combined Insurance'), [3, 3, 0, 2, 1, 1, 0.5, '', '', 170, 85], 'Combined');
      eq(carrier('Guarantee Trust Life'), [1, 1, 0, 1, 0, 1, '', '', '', 100, 100], 'GTL');
      eq(carrier('Mutual of Omaha'), [2, 1, 1, 0, 0, '', '', '', '', 0, ''], 'MoO (death claim)');
      eq(carrier('Foresters Financial'), [0, 0, 0, 0, 0, '', '', '', '', 0, ''], 'no policies');

      const values = ss.getSheetByName(CARRIERS_REPORT)!.getDataRange().getValues();
      const product = (name: string) => {
        for (const row of values) {
          const at = row.indexOf(name);
          if (at > 0) return roundAll(row.slice(at + 1, at + 7));
        }
        throw new Error(`no product ${name}`);
      };
      //                                            written issued pending inForce lapsed premium
      eq(product('Final expense - Level'), [4, 3, 1, 2, 0, 170], 'Level');
      eq(product('Final expense - Graded'), [2, 2, 0, 1, 1, 100], 'Graded');
    },
  },
  {
    name: 'Lead results by lead type, with premium from linked clients',
    run: (ss) => {
      const lead = (name: string) => roundAll(rowOf(ss, LEADS_REPORT, name).slice(1, 12));
      // leads cost contacted rate appts rate apps close costPerApp premium AP-per-$
      eq(lead('Yes lead'), [2, 20, 2, 1, 1, 0.5, 1, 0.5, 20, 150, 90], 'Yes lead');
      eq(lead('Survey lead'), [2, 46, 1, 0.5, 1, 0.5, 1, 0.5, 46, 100, round(1200 / 46)], 'Survey');
      eq(lead('Mail-in lead'), [0, 0, 0, '', 0, '', 0, '', '', 0, ''], 'none bought');
      eq(
        lead('All lead types'),
        [4, 66, 3, 0.75, 2, 0.5, 2, 0.5, 33, 250, round(3000 / 66)],
        'all',
      );
    },
  },
  {
    name: 'Tax & hours: both car methods, categories, weekly hours',
    run: (ss) => {
      const amount = (label: string) => round(rowOf(ss, TAX_REPORT, label)[1]);
      eq(
        [
          TAX_ROWS.miles,
          TAX_ROWS.deduction,
          TAX_ROWS.expenses,
          TAX_ROWS.gas,
          TAX_ROWS.mileageMethod,
          TAX_ROWS.gasMethod,
          TAX_ROWS.leadTab,
        ].map(amount),
        [150, 110.5, 131, 40, 201.5, 131, 66],
        'car and expenses',
      );
      eq(
        ['Gas', 'Leads', 'Food', 'Misc'].map((c) => amount(c)),
        [40, 66, 25, 0],
        'categories',
      );

      const sheet = ss.getSheetByName(TAX_REPORT)!;
      const weeks = sheet.getRange('D5:E16').getValues();
      const hoursIn = (iso: string) =>
        weeks.find((w) => (w[0] as Date).getTime() === d(iso).getTime())?.[1];
      eq(
        [hoursIn('2026-09-28'), hoursIn('2026-08-31'), hoursIn('2026-08-10')],
        [0, 7.5, 8],
        'weeks (Mon start) up to 9/30',
      );
      eq(sheet.getRange('E17').getValue(), 15.5, 'hours in the year');
    },
  },
  {
    name: 'no formula errors on the reports with data',
    run: (ss) => eq(reportErrors(ss), [], 'errors'),
  },
  {
    name: 'reports follow the Year and As of inputs, and survive a second setup',
    run: (ss) => {
      const dash = ss.getSheetByName(DASHBOARD)!;
      dash.getRange('B4').setValue(d('2026-04-30'));
      SpreadsheetApp.flush();
      // On 4/30: P2 (lapsed in May) and P1 in force; P3, P6 not started yet.
      eq(round(rowOf(ss, DASHBOARD, 'Monthly premium in force')[1]), 150, 'in force on 4/30');
      eq(round(rowOf(ss, CARRIERS_REPORT, 'All carriers')[6]), 1, '3-month persistency on 4/30');

      dash.getRange('B3').setValue(2025);
      SpreadsheetApp.flush();
      eq(round(rowOf(ss, DASHBOARD, 'Applications written')[1]), 1, '2025 applications');
      eq(round(rowOf(ss, TAX_REPORT, 'Misc')[1]), 10, '2025 expenses');

      setupWorkbook(ss);
      eq(dash.getRange('B3:B4').getValues()[0][0], 2025, 'Year input kept');
      eq(round(rowOf(ss, DASHBOARD, 'Applications written')[1]), 1, 'still reporting 2025');
      dash.getRange('B3:B4').setValues([[''], ['']]);
      SpreadsheetApp.flush();
      eq(dash.getRange('C3').getValue(), new Date().getFullYear(), 'blank Year = this year');
    },
  },
];
