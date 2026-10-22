// Phase 1 integration tests: the manual test script in docs/phase-1.md, automated.
// Cases run in order and share one freshly reset spreadsheet.

import {
  DATA_TABS,
  SETTINGS_LISTS,
  SETTINGS_TAB,
  SETTINGS_TABLES,
  SIMPLE_LISTS,
  columnNumber,
  dataTab,
  settingsTableStart,
  type DataTabName,
} from '../config/schema';
import { OK_COUNTIES } from '../config/lists';
import { isoToDate } from '../lib/rows';
import { handleEdit } from '../sheets/edits';
import { TAB_ORDER, setupWorkbook } from '../sheets/setup';
import { appendRecords, lastIdRow } from '../sheets/records';
import { loadTestData } from '../sheets/testData';
import { today, toIsoDate } from '../sheets/util';
import { eq, ok, stopwatch, type TestCase } from './harness';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;
type Rec = Record<string, unknown>;

/** Rows that have an ID, as `{ key: value }`. */
function records(ss: Spreadsheet, tabName: DataTabName): Rec[] {
  const tab = dataTab(tabName);
  const sheet = ss.getSheetByName(tabName)!;
  const last = lastIdRow(sheet, tab);
  if (last < 2) return [];
  return sheet
    .getRange(2, 1, last - 1, tab.columns.length)
    .getValues()
    .map((row) => Object.fromEntries(tab.columns.map((c, i) => [c.key, row[i]])));
}

const pluck = (rows: Rec[], key: string) => rows.map((r) => r[key]);
const iso = (ss: Spreadsheet, v: unknown) => (v instanceof Date ? toIsoDate(ss, v) : v);

/** Simulates the user typing into one cell (onEdit does not fire for script writes). */
function typeInto(ss: Spreadsheet, tabName: DataTabName, row: number, key: string, value: unknown) {
  const range = ss.getSheetByName(tabName)!.getRange(row, columnNumber(dataTab(tabName), key));
  range.setValue(value);
  handleEdit({ range } as GoogleAppsScript.Events.SheetsOnEdit);
  SpreadsheetApp.flush();
}

function yearsSince(from: Date): number {
  const now = today();
  let years = now.getFullYear() - from.getFullYear();
  if (
    now.getMonth() < from.getMonth() ||
    (now.getMonth() === from.getMonth() && now.getDate() < from.getDate())
  ) {
    years--;
  }
  return years;
}

export const PHASE1_CASES: TestCase[] = [
  {
    name: 'setup builds every tab in order and removes Sheet1',
    run: (ss) => {
      setupWorkbook(ss);
      eq(
        ss.getSheets().map((s) => s.getName()),
        TAB_ORDER,
        'tab order',
      );
    },
  },
  {
    name: 'named ranges exist for every dropdown and setting',
    run: (ss) => {
      const names = new Set(ss.getNamedRanges().map((n) => n.getName()));
      const expected = [
        ...Object.keys(SIMPLE_LISTS).map((n) => `list_${n}`),
        ...Object.keys(SETTINGS_LISTS).map((n) => `list_${n}`),
        ...SETTINGS_TABLES.flatMap((t) => t.columns.map((c) => `set_${t.key}_${c.key}`)),
      ];
      const missing = expected.filter((n) => !names.has(n));
      eq(missing, [], 'missing named ranges');
    },
  },
  {
    name: 'Lists and Settings are seeded',
    run: (ss) => {
      const counties = ss
        .getRangeByName('list_Counties')!
        .getValues()
        .map((r) => r[0])
        .filter((v) => v !== '');
      eq(counties.length, OK_COUNTIES.length, 'county count');
      for (const t of SETTINGS_TABLES) {
        const col = ss.getRangeByName(`set_${t.key}_${t.columns[0].key}`)!.getValues();
        eq(col.filter((r) => r[0] !== '').length, t.seed.length, `${t.key} rows`);
      }
      const mileage = ss.getRangeByName('set_MileageRates_rate')!.getDisplayValues()[1][0];
      eq(mileage, '$0.725', '2026 IRS rate shows 3 decimals');
    },
  },
  {
    name: 'headers are written and formula columns hold array formulas',
    run: (ss) => {
      for (const tab of DATA_TABS) {
        const sheet = ss.getSheetByName(tab.name)!;
        const headers = sheet.getRange(1, 1, 1, tab.columns.length).getDisplayValues()[0];
        eq(
          headers,
          tab.columns.map((c) => c.header),
          `${tab.name} headers`,
        );
        tab.columns.forEach((c, i) => {
          if (c.type !== 'formula') return;
          const f = sheet.getRange(1, i + 1).getFormula();
          ok(f.startsWith('={"'), `${tab.name}.${c.key} has no array formula: ${f}`);
        });
      }
    },
  },
  {
    name: 'dropdowns, dates, checkboxes and ID references are validated',
    run: (ss) => {
      const C = SpreadsheetApp.DataValidationCriteria;
      const rule = (tab: DataTabName, key: string) =>
        ss
          .getSheetByName(tab)!
          .getRange(2, columnNumber(dataTab(tab), key))
          .getDataValidation();
      const expectRule = (tab: DataTabName, key: string, criteria: unknown) => {
        const r = rule(tab, key);
        ok(r, `${tab}.${key} has no validation`);
        eq(String(r!.getCriteriaType()), String(criteria), `${tab}.${key} rule`);
        eq(r!.getAllowInvalid(), false, `${tab}.${key} rejects invalid`);
      };
      expectRule('Policies', 'clientId', C.VALUE_IN_RANGE);
      expectRule('Policies', 'carrier', C.VALUE_IN_RANGE);
      expectRule('Clients', 'birthday', C.DATE_IS_VALID_DATE);
      expectRule('Leads', 'contacted', C.CHECKBOX);
      expectRule('Beneficiaries', 'share', C.NUMBER_BETWEEN);
    },
  },
  {
    name: 'ID, formula and Created columns are protected (warning only)',
    run: (ss) => {
      for (const tab of DATA_TABS) {
        const protections = ss
          .getSheetByName(tab.name)!
          .getProtections(SpreadsheetApp.ProtectionType.RANGE)
          .filter((p) => p.getDescription().startsWith('gsa:auto'));
        const computed = tab.columns.filter((c) =>
          ['id', 'formula', 'timestamp'].includes(c.type),
        ).length;
        eq(protections.length, computed + 1, `${tab.name} protections (+1 header)`);
        ok(
          protections.every((p) => p.isWarningOnly()),
          `${tab.name} protections are warning-only`,
        );
      }
    },
  },
  {
    name: 'test data loads',
    run: (ss) => {
      const result = loadTestData(ss);
      ok(result.ok, result.message);
    },
  },
  {
    name: 'clients get sequential IDs and a Created time',
    run: (ss) => {
      const clients = records(ss, 'Clients');
      eq(pluck(clients, 'clientId'), ['CL-0001', 'CL-0002', 'CL-0003'], 'client IDs');
      ok(
        clients.every((c) => c.createdAt instanceof Date),
        'every client has a Created date',
      );
    },
  },
  {
    name: 'age is calculated and birthdays without a year are flagged',
    run: (ss) => {
      const [alpha, bravo, charlie] = records(ss, 'Clients');
      eq(alpha.age, yearsSince(isoToDate('1956-03-14')), 'Alpha age');
      eq(bravo.age, 'Check year', 'Bravo (no birth year)');
      eq(charlie.age, yearsSince(isoToDate('1950-07-04')), 'Charlie age');
    },
  },
  {
    name: 'lead source is looked up from Leads',
    run: (ss) => {
      eq(
        pluck(records(ss, 'Clients'), 'leadSource'),
        ['Yes lead', 'Survey lead', ''],
        'lead sources',
      );
    },
  },
  {
    name: 'policies show client name, monthly premium, status date and group',
    run: (ss) => {
      const policies = records(ss, 'Policies');
      eq(pluck(policies, 'policyId'), ['PO-0001', 'PO-0002', 'PO-0003'], 'policy IDs');
      eq(
        pluck(policies, 'clientName'),
        ['Test Alpha', 'Test Alpha', 'Test Charlie'],
        'client names',
      );
      eq(pluck(policies, 'monthlyPremium'), [120, 45, 0], 'monthly premium ($540 annual = $45)');
      eq(pluck(policies, 'statusGroup'), ['active', 'inactive', 'pending'], 'status groups');
      const todayIso = toIsoDate(ss, today());
      eq(
        policies.map((p) => iso(ss, p.statusDate)),
        [todayIso, todayIso, todayIso],
        'status dates',
      );
    },
  },
  {
    name: 'beneficiaries link to the client; primary and contingent each total 100%',
    run: (ss) => {
      const bens = records(ss, 'Beneficiaries');
      eq(pluck(bens, 'clientName'), ['Test Alpha', 'Test Alpha', 'Test Alpha'], 'client names');
      // Son (no type: counts as primary) + daughter = 100%; the contingent nephew alone = 100%.
      eq(pluck(bens, 'policyShareTotal'), [1, 1, 1], 'policy totals');
    },
  },
  {
    name: 'lead costs come from Settings',
    run: (ss) => {
      eq(pluck(records(ss, 'Leads'), 'cost'), [10, 23, 0, 48], 'lead costs');
    },
  },
  {
    name: 'typing a new client assigns the next ID and Created',
    run: (ss) => {
      typeInto(ss, 'Clients', 5, 'firstName', 'Typed');
      const typed = records(ss, 'Clients')[3];
      eq(typed.clientId, 'CL-0004', 'new ID');
      ok(typed.createdAt instanceof Date, 'Created is set');
    },
  },
  {
    name: 'changing Status stamps Status date and updates the group',
    run: (ss) => {
      const sheet = ss.getSheetByName('Policies')!;
      const statusDateCol = columnNumber(dataTab('Policies'), 'statusDate');
      sheet.getRange(4, statusDateCol).setValue(isoToDate('2020-01-01'));
      typeInto(ss, 'Policies', 4, 'status', 'Cancelled');
      const p = records(ss, 'Policies')[2];
      eq(iso(ss, p.statusDate), toIsoDate(ss, today()), 'status date');
      eq(p.statusGroup, 'inactive', 'status group');
    },
  },
  {
    name: 'an ID is never reused after the last row is cleared',
    run: (ss) => {
      const tab = dataTab('Clients');
      // Row 5 holds CL-0004, the last client.
      for (const c of tab.columns) {
        if (c.type !== 'formula') {
          ss.getSheetByName('Clients')!.getRange(5, columnNumber(tab, c.key)).clearContent();
        }
      }
      typeInto(ss, 'Clients', 5, 'firstName', 'Again');
      eq(records(ss, 'Clients')[3].clientId, 'CL-0005', 'ID after clearing CL-0004');
    },
  },
  {
    name: 'a lead uses the price in effect on the date received',
    run: (ss) => {
      const sheet = ss.getSheetByName(SETTINGS_TAB)!;
      const start = settingsTableStart('LeadCosts');
      const firstBlank =
        sheet
          .getRange(2, start, sheet.getMaxRows() - 1, 1)
          .getValues()
          .findIndex((r) => r[0] === '') + 2;
      sheet
        .getRange(firstBlank, start, 1, 4)
        .setValues([['Yes lead', 12, isoToDate('2026-11-01'), false]]);
      const [early, late] = appendRecords(ss, 'Leads', [
        { dateReceived: isoToDate('2026-10-31'), leadType: 'Yes lead', lastName: 'Early' },
        { dateReceived: isoToDate('2026-11-05'), leadType: 'Yes lead', lastName: 'Late' },
      ]);
      const leads = records(ss, 'Leads');
      const cost = (id: unknown) => leads.find((l) => l.leadId === id)!.cost;
      eq([cost(early.leadId), cost(late.leadId)], [10, 12], 'costs before/after price change');
    },
  },
  {
    name: 'test data refuses to load into a workbook that has clients',
    run: (ss) => {
      const result = loadTestData(ss);
      eq(result.ok, false, 'refused');
    },
  },
  {
    name: 're-running setup keeps data, seeds and formulas',
    run: (ss) => {
      const before = records(ss, 'Clients').length;
      const t = stopwatch();
      setupWorkbook(ss, t.lap);
      SpreadsheetApp.flush();
      const clients = records(ss, 'Clients');
      eq(clients.length, before, 'client count');
      eq(clients[2].age, yearsSince(isoToDate('1950-07-04')), 'formulas still compute');
      const counties = ss
        .getRangeByName('list_Counties')!
        .getValues()
        .filter((r) => r[0] !== '').length;
      eq(counties, OK_COUNTIES.length, 'counties not duplicated');
      eq(
        ss.getSheets().map((s) => s.getName()),
        TAB_ORDER,
        'tab order',
      );
      return t.summary();
    },
  },
];
