// Phase 5 integration tests: commissions. Policies on plans from Settings, every
// expected number worked out by hand, reported "as of" 9/30/2026 for 2026.
// Cases run in order and share one freshly reset spreadsheet.

import { COMMISSION_RATES, PLANS } from '../config/lists';
import { SETTINGS_TAB } from '../config/schema';
import { appendRecords, readRecords, updateRecord } from '../sheets/records';
import { CARRIERS_REPORT, DASHBOARD, MONTH_COLUMNS } from '../sheets/reports';
import { setupWorkbook } from '../sheets/setup';
import { eq, stopwatch, type TestCase } from './harness';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

const d = (iso: string) => {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y, m - 1, day);
};
const round = (v: unknown) => (typeof v === 'number' ? Math.round(v * 10000) / 10000 : v);
const roundAll = (vs: unknown[]) => vs.map(round);

/** Cell values of the row whose column-A label is `label`. */
function rowOf(ss: Spreadsheet, tab: string, label: string): unknown[] {
  const row = ss
    .getSheetByName(tab)!
    .getDataRange()
    .getValues()
    .find((r) => r[0] === label);
  if (!row) throw new Error(`${tab}: no row "${label}"`);
  return row;
}

const COMMISSION_KEYS = [
  'ageAtIssue',
  'commissionRate',
  'advanceMonths',
  'monthsPaid',
  'advance',
  'commissionEarned',
  'unearnedAdvance',
  'chargeback',
];
const commissions = (ss: Spreadsheet) =>
  readRecords(ss, 'Policies').map(({ rec }) => roundAll(COMMISSION_KEYS.map((k) => rec[k])));

function loadData(ss: Spreadsheet): void {
  const [C1, C2, C3, C4, C5] = appendRecords(ss, 'Clients', [
    { firstName: 'Test', lastName: 'Sixty-nine', birthday: d('1956-03-10') },
    { firstName: 'Test', lastName: 'Eighty-one', birthday: d('1944-06-01') },
    { firstName: 'Test', lastName: 'Fifty-five', birthday: d('1970-05-05') },
    { firstName: 'Test', lastName: 'No year', birthday: d('2026-05-05') }, // saved without a year
    { firstName: 'Test', lastName: 'Seventy-six', birthday: d('1950-01-01') },
  ]).map((c) => String(c.clientId));
  const AA = 'American Amicable';
  const monthly = { paymentMode: 'Monthly' };
  const policies = appendRecords(ss, 'Policies', [
    // P1: 9-month advance, 9 months paid: all earned.
    { clientId: C1, carrier: AA, plan: 'AmAm Level', premium: 100, ...monthly, effectiveDate: d('2026-01-15'), firstDraftDate: d('2026-01-15'), status: 'Paid as issued' },
    // P2: lapsed after 2 payments: 7 months charged back.
    { clientId: C1, carrier: AA, plan: 'AmAm Level', premium: 50, ...monthly, effectiveDate: d('2026-03-01'), firstDraftDate: d('2026-03-05'), status: 'Lapsed' },
    // P3: as earned, age 81 band.
    { clientId: C2, carrier: 'Royal Neighbors of America', plan: 'RNA SIWL', premium: 60, ...monthly, effectiveDate: d('2026-02-01'), status: 'Paid as issued' },
    // P4: CICA paid by card: no advance.
    { clientId: C3, carrier: 'Citizens Life (CICA)', plan: 'CICA Level', paidBy: 'Card', premium: 40, ...monthly, effectiveDate: d('2026-06-10'), firstDraftDate: d('2026-06-10'), status: 'Paid as issued' },
    // P5: CICA by bank draft: 6-month advance; second draft failed.
    { clientId: C3, carrier: 'Citizens Life (CICA)', plan: 'CICA Level', paidBy: 'Bank draft', premium: 30, ...monthly, effectiveDate: d('2026-08-10'), firstDraftDate: d('2026-08-10'), status: 'Insufficient funds' },
    // P6: birthday without a year: no age, no commission.
    { clientId: C4, carrier: 'Mutual of Omaha', plan: 'MoO Living Promise Level', premium: 80, ...monthly, effectiveDate: d('2026-09-01'), firstDraftDate: d('2026-09-01'), status: 'Paid as issued' },
    // P7: plan of another carrier.
    { clientId: C5, carrier: 'Mutual of Omaha', plan: 'AmAm Level', premium: 45, ...monthly, effectiveDate: d('2026-04-01'), firstDraftDate: d('2026-04-01'), status: 'Paid as issued' },
    // P8: in its third year: year 1 and renewals.
    { clientId: C5, carrier: 'Mutual of Omaha', plan: 'MoO Living Promise Level', premium: 50, ...monthly, effectiveDate: d('2024-07-01'), firstDraftDate: d('2024-07-01'), status: 'Paid as issued' },
    // P9: death claim after 4 payments.
    { clientId: C5, carrier: AA, plan: 'AmAm ROP / Graded', premium: 20, ...monthly, effectiveDate: d('2026-03-01'), firstDraftDate: d('2026-03-01'), status: 'Deceased' },
    // P10: pending: a rate, nothing paid.
    { clientId: C1, carrier: AA, plan: 'AmAm Level', premium: 70, ...monthly, applicationDate: d('2026-09-20'), status: 'Pending' },
    // P11: quarterly: each payment covers 3 months.
    { clientId: C3, carrier: 'Royal Neighbors of America', plan: 'RNA SIWL', premium: 300, paymentMode: 'Quarterly', effectiveDate: d('2026-04-01'), firstDraftDate: d('2026-04-01'), status: 'Paid as issued' },
  ]); // prettier-ignore
  const rows = new Map(readRecords(ss, 'Policies').map((r) => [r.rec.policyId, r.row]));
  const ended: Record<number, string> = { 1: '2026-05-20', 8: '2026-07-15' };
  for (const [i, iso] of Object.entries(ended)) {
    updateRecord(ss, 'Policies', rows.get(policies[Number(i)].policyId)!, { statusDate: d(iso) });
  }
  ss.getSheetByName(DASHBOARD)!
    .getRange('B3:B4')
    .setValues([[2026], [d('2026-09-30')]]);
  SpreadsheetApp.flush();
}

export const PHASE5_CASES: TestCase[] = [
  {
    name: 'Settings: plans and commission rates seeded, Plan dropdown on Policies',
    run: (ss) => {
      const t = stopwatch();
      setupWorkbook(ss, t.lap);
      const named = (name: string) =>
        ss
          .getRangeByName(name)!
          .getValues()
          .flat()
          .filter((v) => v !== '');
      eq(
        named('set_Plans_plan'),
        PLANS.map((p) => p.name),
        'plans',
      );
      eq(named('set_CommissionRates_year1').length, COMMISSION_RATES.length, 'rate rows');
      eq(
        roundAll(named('set_CommissionRates_year1').slice(0, 3)),
        [1.075, 0.975, 1.1],
        'rates over 100% are kept',
      );
      const plan = ss.getSheetByName('Policies')!.getRange('A1:ZZ1').getValues()[0].indexOf('Plan');
      const rule = ss
        .getSheetByName('Policies')!
        .getRange(2, plan + 1)
        .getDataValidation();
      eq(
        (rule?.getCriteriaValues()[0] as GoogleAppsScript.Spreadsheet.Range).getSheet().getName(),
        SETTINGS_TAB,
        'Plan dropdown from Settings',
      );
      return t.summary();
    },
  },
  {
    name: 'policy commissions: rate by age, advance, months paid, earned, chargeback',
    run: (ss) => {
      loadData(ss);
      const ROP_CHECK = 'Check carrier: plan is American Amicable';
      //        age  rate  adv paid advance earned unearned chargeback
      eq(
        commissions(ss),
        [
          [69, 1.1, 9, 9, 990, 990, '', ''],
          [69, 1.1, 9, 2, 495, 110, '', 385],
          [81, 0.7, 0, 8, 0, 336, '', ''],
          [56, 1, 0, 4, 0, 160, '', ''],
          [56, 1, 6, 1, 180, 30, 150, ''],
          ['Check year', 'Check age', 9, 1, '', '', '', ''],
          [76, ROP_CHECK, 9, 6, '', '', '', ''],
          [74, 1.1, 9, 27, 495, 693.75, '', ''],
          [76, 0.95, 9, 4, 171, 76, '', 95],
          [70, 1.1, 9, '', '', '', '', ''],
          [55, 1.05, 0, 6, 0, 630, '', ''],
        ],
        COMMISSION_KEYS.join(' | '),
      );
      const p = readRecords(ss, 'Policies').map((r) => r.rec);
      eq(
        roundAll([p[7].rate2to5, p[7].rate6to10, p[7].rate11on, p[2].rate2to5, p[2].rate6to10]),
        [0.045, 0.025, 0, 0.0225, 0.013],
        'renewal rates',
      );
    },
  },
  {
    name: 'Dashboard: advances, as earned by month, chargebacks, net, advance at risk',
    run: (ss) => {
      const value = (label: string) => round(rowOf(ss, DASHBOARD, label)[1]);
      eq(
        [
          'Commission advances',
          'Commission as earned',
          'Chargebacks',
          'Net commission',
          'Advance not yet earned',
        ].map(value),
        [1836, 1146.25, 480, 2502.25, 150],
        'year 2026',
      );

      const table = ss.getSheetByName(DASHBOARD)!.getDataRange().getValues();
      const head = table.findIndex((r) => r[0] === MONTH_COLUMNS[0]);
      const at = (name: string) => MONTH_COLUMNS.indexOf(name);
      const months = table.slice(head + 1, head + 13).map((r) => {
        const pick = [
          'Commission advances',
          'Commission as earned',
          'Chargebacks',
          'Net commission',
        ];
        return roundAll(pick.map((c) => r[at(c)]));
      });
      eq(
        months,
        [
          [990, 2.25, 0, 992.25],
          [0, 44.25, 0, 44.25],
          [666, 44.25, 0, 710.25],
          [0, 149.25, 0, 149.25],
          [0, 149.25, 385, -235.75],
          [0, 189.25, 0, 189.25],
          [0, 189.25, 95, 94.25],
          [180, 189.25, 0, 369.25],
          [0, 189.25, 0, 189.25],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
          [0, 0, 0, 0],
        ],
        'advances | as earned | chargebacks | net, Jan-Dec',
      );
    },
  },
  {
    name: 'Carriers: advances, earned, chargebacks, advance not yet earned',
    run: (ss) => {
      const carrier = (name: string) => roundAll(rowOf(ss, CARRIERS_REPORT, name).slice(12, 16));
      eq(carrier('All carriers'), [2331, 3025.75, 480, 150], 'all');
      eq(carrier('American Amicable'), [1656, 1176, 480, 0], 'American Amicable');
      eq(carrier('Citizens Life (CICA)'), [180, 190, 0, 150], 'CICA');
      eq(carrier('Mutual of Omaha'), [495, 693.75, 0, 0], 'Mutual of Omaha');
    },
  },
  {
    name: 'months paid can be corrected by hand; errors nowhere',
    run: (ss) => {
      const p2 = readRecords(ss, 'Policies')[1];
      updateRecord(ss, 'Policies', p2.row, { monthsPaidOverride: 3 });
      SpreadsheetApp.flush();
      eq(commissions(ss)[1], [69, 1.1, 9, 3, 495, 165, '', 330], 'P2 with 3 months paid');
      eq(round(rowOf(ss, DASHBOARD, 'Chargebacks')[1]), 425, 'year chargebacks follow');
      eq(formulaErrors(ss), [], 'formula errors');
    },
  },
  {
    name: 'advance limit: Generational Life caps the advance at $1,000, paid back first',
    run: (ss) => {
      const client = String(readRecords(ss, 'Clients')[0].rec.clientId); // age 70 from 3/2026
      const GL = 'Generational Life';
      const added = appendRecords(ss, 'Policies', [
        // P12: 400 x 110% x 3 = 1,320 -> 1,000; Jun-Sep paid: 1,760 earned, 760 beyond it.
        { clientId: client, carrier: GL, plan: 'GL Preferred', premium: 400, paymentMode: 'Monthly', effectiveDate: d('2026-06-01'), firstDraftDate: d('2026-06-01'), status: 'Paid as issued' },
        // P13: 500 x 95% x 3 = 1,425 -> 1,000; lapsed after 1 payment: 1,000 - 475 back.
        { clientId: client, carrier: GL, plan: 'GL Standard', premium: 500, paymentMode: 'Monthly', effectiveDate: d('2026-07-01'), firstDraftDate: d('2026-07-01'), status: 'Lapsed' },
        // P14: 1 payment of 440 against the 1,000 advance: 560 not yet earned.
        { clientId: client, carrier: GL, plan: 'GL Preferred', premium: 400, paymentMode: 'Monthly', effectiveDate: d('2026-09-01'), firstDraftDate: d('2026-09-01'), status: 'Paid as issued' },
      ]); // prettier-ignore
      const rows = new Map(readRecords(ss, 'Policies').map((r) => [r.rec.policyId, r.row]));
      updateRecord(ss, 'Policies', rows.get(added[1].policyId)!, { statusDate: d('2026-08-15') });
      SpreadsheetApp.flush();

      eq(
        commissions(ss).slice(11),
        [
          [70, 1.1, 3, 4, 1000, 1760, '', ''],
          [70, 0.95, 3, 1, 1000, 475, '', 525],
          [70, 1.1, 3, 1, 1000, 440, 560, ''],
        ],
        COMMISSION_KEYS.join(' | '),
      );
      eq(
        roundAll(rowOf(ss, CARRIERS_REPORT, GL).slice(12, 16)),
        [3000, 2675, 525, 560],
        'Carriers: Generational Life',
      );
      const value = (label: string) => round(rowOf(ss, DASHBOARD, label)[1]);
      eq(
        [
          'Commission advances',
          'Commission as earned',
          'Chargebacks',
          'Net commission',
          'Advance not yet earned',
        ].map(value),
        [4836, 1906.25, 950, 5792.25, 710],
        'year 2026',
      );
      const table = ss.getSheetByName(DASHBOARD)!.getDataRange().getValues();
      const head = table.findIndex((r) => r[0] === MONTH_COLUMNS[0]);
      const pick = ['Commission advances', 'Commission as earned', 'Chargebacks', 'Net commission'];
      eq(
        table
          .slice(head + 6, head + 10)
          .map((r) => roundAll(pick.map((c) => r[MONTH_COLUMNS.indexOf(c)]))),
        [
          [1000, 189.25, 0, 1189.25],
          [1000, 189.25, 95, 1094.25],
          [180, 509.25, 525, 164.25],
          [1000, 629.25, 0, 1629.25],
        ],
        'advances | as earned | chargebacks | net, Jun-Sep',
      );
      eq(formulaErrors(ss), [], 'formula errors');
    },
  },
  {
    name: 'Medicare: a flat $36 a month, no premium needed',
    run: (ss) => {
      const client = String(readRecords(ss, 'Clients')[0].rec.clientId);
      // P15: no premium; Jul-Sep: 3 x $36.
      appendRecords(ss, 'Policies', [
        { clientId: client, carrier: 'Devoted Health', plan: 'Medicare', productType: 'Medicare - MAPD', effectiveDate: d('2026-07-01'), status: 'Paid as issued' },
      ]); // prettier-ignore
      SpreadsheetApp.flush();

      eq(commissions(ss)[14], [70, 1, 0, 3, 0, 108, '', ''], COMMISSION_KEYS.join(' | '));
      eq(
        roundAll(rowOf(ss, CARRIERS_REPORT, 'Devoted Health').slice(12, 16)),
        [0, 108, 0, 0],
        'Carriers: Devoted Health',
      );
      eq(round(rowOf(ss, DASHBOARD, 'Commission as earned')[1]), 2014.25, 'year as earned');
      eq(formulaErrors(ss), [], 'formula errors');
    },
  },
];

/** Cells showing a formula error on the commission tabs. */
function formulaErrors(ss: Spreadsheet): string[] {
  return ['Policies', DASHBOARD, CARRIERS_REPORT].flatMap((name) =>
    ss
      .getSheetByName(name)!
      .getDataRange()
      .getDisplayValues()
      .flat()
      .filter((v) => /^#(REF|NAME|VALUE|ERROR|N\/A|DIV|NUM)/.test(v))
      .map((v) => `${name}: ${v}`),
  );
}
