// Phase 2 integration tests: the phone app's server actions against a real
// spreadsheet. Cases run in order and share one freshly reset spreadsheet.

import { IRS_MILEAGE_RATES } from '../config/lists';
import { columnNumber, dataTab, type DataTabName } from '../config/schema';
import {
  FormError,
  boot,
  saveClient,
  saveExpense,
  saveLead,
  shiftAction,
  tripAction,
} from '../app/service';
import { rateOn } from '../lib/rates';
import { readRecords } from '../sheets/records';
import { getReceipt, trashReceipt } from '../sheets/receipts';
import { TAB_ORDER, setupWorkbook } from '../sheets/setup';
import { today, toIsoDate } from '../sheets/util';
import { eq, ok, stopwatch, type TestCase } from './harness';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

const rows = (ss: Spreadsheet, tab: DataTabName) => readRecords(ss, tab).map((r) => r.rec);

/** Runs `fn`, expects a FormError, and returns its field errors. */
function formErrors(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (err) {
    if (err instanceof FormError) return err.errors;
    throw err;
  }
  throw new Error('expected a form error, but it saved');
}

function errorMessage(fn: () => unknown): string {
  try {
    fn();
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error('expected an error, but it succeeded');
}

/** Today at hh:mm in the script's time zone. */
function at(hours: number, minutes = 0): Date {
  const d = today();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

// 1x1 transparent PNG.
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

export const PHASE2_CASES: TestCase[] = [
  {
    name: 'setup adds Hours, Mileage and Expenses tabs',
    run: (ss) => {
      const t = stopwatch();
      setupWorkbook(ss, t.lap);
      eq(
        ss.getSheets().map((s) => s.getName()),
        TAB_ORDER,
        'tab order',
      );
      for (const name of ['Hours', 'Mileage', 'Expenses'] as DataTabName[]) {
        const tab = dataTab(name);
        const headers = ss
          .getSheetByName(name)!
          .getRange(1, 1, 1, tab.columns.length)
          .getDisplayValues()[0];
        eq(
          headers,
          tab.columns.map((c) => c.header),
          `${name} headers`,
        );
      }
      return t.summary();
    },
  },
  {
    name: 'app start-up data has dropdowns and nothing running',
    run: (ss) => {
      const b = boot(ss);
      ok(b.lists.Carriers.includes('Mutual of Omaha'), 'Carriers list');
      ok(b.lists.LeadTypes.includes('Yes lead'), 'LeadTypes list');
      ok(b.lists.ExpenseCategories.includes('Gas'), 'ExpenseCategories list');
      eq(b.lists.Counties.length, 77, 'county count');
      eq(b.today, toIsoDate(ss, new Date()), 'today');
      eq(
        [b.shift, b.trip, b.clients.length, b.openLeads.length],
        [null, null, 0, 0],
        'empty state',
      );
    },
  },
  {
    name: 'new lead: saved with ID and cost; bad input rejected',
    run: (ss) => {
      const errors = formErrors(() => saveLead(ss, { leadType: 'yes LEAD', phone: '12345' }));
      eq(Object.keys(errors).sort(), ['dateReceived', 'firstName', 'phone'], 'error fields');
      eq(rows(ss, 'Leads').length, 0, 'nothing written after errors');

      const msg = saveLead(ss, {
        dateReceived: '2026-10-10',
        leadType: 'yes lead',
        firstName: 'Test',
        lastName: 'Echo',
        phone: '555 010 0005',
      });
      eq(msg, 'Lead LD-0001 saved', 'message');
      SpreadsheetApp.flush();
      const [lead] = rows(ss, 'Leads');
      eq(
        [lead.leadType, lead.phone, lead.cost, toIsoDate(ss, lead.dateReceived as Date)],
        ['Yes lead', '(555) 010-0005', 10, '2026-10-10'],
        'lead row',
      );
      eq(
        boot(ss).openLeads.map((l) => l.id),
        ['LD-0001'],
        'open leads',
      );
    },
  },
  {
    name: 'SSN-looking text is refused',
    run: (ss) => {
      const errors = formErrors(() =>
        saveLead(ss, {
          dateReceived: '2026-10-11',
          leadType: 'Referral',
          firstName: 'Test',
          notes: 'ssn 123-45-6789',
        }),
      );
      eq(Object.keys(errors), ['notes'], 'error field');
      ok(/Social Security/.test(errors.notes), 'message mentions SSN');
      eq(rows(ss, 'Leads').length, 1, 'nothing written');
    },
  },
  {
    name: 'new client with policy, linked to the lead',
    run: (ss) => {
      const msg = saveClient(ss, {
        client: {
          firstName: 'Test',
          lastName: 'Echo',
          phone: '5550100005',
          state: 'OK',
          county: 'tulsa',
          birthday: '1955-02-03',
          weightLbs: '180',
        },
        policy: {
          carrier: 'Mutual of Omaha',
          productType: 'Final expense - Level',
          faceAmount: '$15,000',
          premium: '120',
          paymentMode: 'Monthly',
          applicationDate: '2026-10-20',
          status: 'Pending',
        },
        leadId: 'LD-0001',
      });
      eq(msg, 'Client CL-0001 saved, policy PO-0001, linked to lead LD-0001', 'message');
      SpreadsheetApp.flush();

      const [client] = rows(ss, 'Clients');
      eq(
        [client.county, client.weightLbs, client.leadSource],
        ['Tulsa', 180, 'Yes lead'],
        'client row',
      );
      const [policy] = rows(ss, 'Policies');
      eq(
        [
          policy.clientId,
          policy.clientName,
          policy.faceAmount,
          policy.monthlyPremium,
          policy.statusGroup,
        ],
        ['CL-0001', 'Test Echo', 15000, 120, 'pending'],
        'policy row',
      );
      ok(policy.statusDate instanceof Date, 'status date stamped');
      const [lead] = rows(ss, 'Leads');
      eq(
        [lead.clientId, lead.contacted, lead.applicationWritten, lead.clientName],
        ['CL-0001', true, true, 'Test Echo'],
        'lead linked',
      );
      eq(boot(ss).openLeads, [], 'lead no longer open');
    },
  },
  {
    name: 'new client errors: all fields reported, nothing written',
    run: (ss) => {
      const errors = formErrors(() =>
        saveClient(ss, {
          client: { firstName: 'Test', birthday: '2099-01-01', email: 'nope' },
          policy: { premium: 'abc' },
          leadId: 'LD-0001', // already linked, so no longer open
        }),
      );
      eq(
        Object.keys(errors).sort(),
        ['birthday', 'email', 'lastName', 'leadId', 'policy.carrier', 'policy.premium'],
        'error fields',
      );
      eq([rows(ss, 'Clients').length, rows(ss, 'Policies').length], [1, 1], 'row counts');
    },
  },
  {
    name: 'hours: clock in, break, clock out',
    run: (ss) => {
      eq(
        shiftAction(ss, 'clockIn', { activity: 'dialing' }, at(9)),
        'Clocked in at 9:00 AM (HR-0001)',
        'clock in',
      );
      ok(
        /Already clocked in/.test(errorMessage(() => shiftAction(ss, 'clockIn', {}, at(9, 5)))),
        'double clock in',
      );
      ok(
        /Not on a break/.test(errorMessage(() => shiftAction(ss, 'endBreak', {}, at(10)))),
        'end break first',
      );
      shiftAction(ss, 'startBreak', {}, at(12));
      eq(boot(ss).shift?.onBreakSince, at(12).getTime(), 'on break');
      eq(
        shiftAction(ss, 'endBreak', {}, at(12, 30)),
        'Break ended (30 min of breaks today)',
        'end break',
      );
      eq(
        shiftAction(ss, 'clockOut', {}, at(17)),
        'Clocked out at 5:00 PM: 7.50 hours worked',
        'clock out',
      );
      SpreadsheetApp.flush();
      const [shift] = rows(ss, 'Hours');
      eq(
        [shift.activity, shift.breakMinutes, shift.breakStartedAt, shift.hours],
        ['Dialing', 30, '', 7.5],
        'row',
      );
      eq(boot(ss).shift, null, 'no shift running');
    },
  },
  {
    name: 'hours: clocking out during a break ends the break',
    run: (ss) => {
      shiftAction(ss, 'clockIn', {}, at(18));
      shiftAction(ss, 'startBreak', {}, at(18, 30));
      shiftAction(ss, 'clockOut', {}, at(19));
      SpreadsheetApp.flush();
      const shift = rows(ss, 'Hours')[1];
      eq([shift.breakMinutes, shift.hours], [30, 0.5], 'break and hours');
      ok(
        /Not clocked in/.test(errorMessage(() => shiftAction(ss, 'clockOut', {}, at(20)))),
        'not clocked in',
      );
    },
  },
  {
    name: 'hours: times typed into the sheet are calculated too',
    run: (ss) => {
      const sheet = ss.getSheetByName('Hours')!;
      const tab = dataTab('Hours');
      const row = 4;
      sheet.getRange(row, columnNumber(tab, 'start')).setValue('8:00 AM');
      sheet.getRange(row, columnNumber(tab, 'end')).setValue('4:30 PM');
      sheet.getRange(row, columnNumber(tab, 'breakMinutes')).setValue(30);
      SpreadsheetApp.flush();
      eq(sheet.getRange(row, columnNumber(tab, 'hours')).getValue(), 8, 'hours');
      sheet.getRange(row, 1, 1, tab.columns.length).clearContent();
    },
  },
  {
    name: 'mileage: start and end a trip by odometer',
    run: (ss) => {
      eq(
        tripAction(ss, 'start', { startOdometer: '45,210', purpose: 'Appointments' }),
        'Trip MI-0001 started',
        'start',
      );
      ok(
        /still running/.test(errorMessage(() => tripAction(ss, 'start', { startOdometer: '1' }))),
        'one trip at a time',
      );
      eq(
        boot(ss).trip,
        { tripId: 'MI-0001', startOdometer: 45210, purpose: 'Appointments' },
        'trip running',
      );
      eq(
        Object.keys(formErrors(() => tripAction(ss, 'end', { endOdometer: '45100' }))),
        ['endOdometer'],
        'end < start',
      );
      eq(
        tripAction(ss, 'end', { endOdometer: '45250.5' }),
        'Trip MI-0001 ended: 40.5 miles',
        'end',
      );
      SpreadsheetApp.flush();

      const rate = rateOn(IRS_MILEAGE_RATES, toIsoDate(ss, new Date()))!.dollarsPerMile;
      const [trip] = rows(ss, 'Mileage');
      eq(
        [trip.miles, trip.rate, trip.deduction],
        [40.5, rate, Math.round(40.5 * rate * 100) / 100],
        'miles, rate, deduction',
      );
      eq(boot(ss).trip, null, 'no trip running');
    },
  },
  {
    name: 'mileage: past trip uses the rate on its date',
    run: (ss) => {
      eq(
        tripAction(ss, 'full', {
          date: '2025-06-01',
          startOdometer: '1000',
          endOdometer: '1100',
          purpose: 'Training',
        }),
        'Trip MI-0002 saved: 100 miles',
        'message',
      );
      SpreadsheetApp.flush();
      const trip = rows(ss, 'Mileage')[1];
      eq([trip.rate, trip.deduction], [0.7, 70], 'rate and deduction');
    },
  },
  {
    name: 'expense without a receipt',
    run: (ss) => {
      eq(
        Object.keys(formErrors(() => saveExpense(ss, { category: 'Toys', amount: '-5' }))).sort(),
        ['amount', 'category', 'date'],
        'error fields',
      );
      eq(
        saveExpense(ss, {
          date: '2026-10-21',
          category: 'gas',
          amount: '$42.10',
          vendor: 'QuikTrip',
        }),
        'Expense EX-0001 saved',
        'message',
      );
      const [expense] = rows(ss, 'Expenses');
      eq([expense.category, expense.amount, expense.receipt], ['Gas', 42.1, ''], 'row');
    },
  },
  {
    name: 'expense with a receipt photo saved to Drive',
    run: (ss) => {
      const msg = saveExpense(
        ss,
        { date: '2026-10-21', category: 'Food', amount: '12.5', paymentMethod: 'Cash' },
        { base64: TINY_PNG, mimeType: 'image/png', name: 'receipt.png' },
      );
      eq(msg, 'Expense EX-0002 saved with receipt', 'message');
      const expense = rows(ss, 'Expenses')[1];
      const link = String(expense.receipt);
      const id = /\/d\/([^/]+)/.exec(link)?.[1];
      ok(id, `receipt link has a file ID: ${link}`);
      try {
        eq(getReceipt(id!).trashed, false, 'file exists in Drive');
      } finally {
        trashReceipt(id!);
      }
      ok(
        /photo or a PDF/.test(
          errorMessage(() =>
            saveExpense(
              ss,
              { date: '2026-10-21', category: 'Misc', amount: '1' },
              { base64: 'AA==', mimeType: 'text/html', name: 'x' },
            ),
          ),
        ),
        'non-image refused',
      );
      eq(rows(ss, 'Expenses').length, 2, 'refused receipt wrote nothing');
    },
  },
  {
    name: 'dates from the app are stored as real dates',
    run: (ss) => {
      const [expense] = rows(ss, 'Expenses');
      ok(expense.date instanceof Date, 'expense date is a Date');
      eq(toIsoDate(ss, expense.date as Date), '2026-10-21', 'expense date');
    },
  },
  {
    // What the phone waits for on every save: the action, then the refreshed state.
    name: 'a phone save plus refresh takes under 8 seconds',
    run: (ss) => {
      const t = stopwatch();
      const start = Date.now();
      saveLead(ss, {
        dateReceived: '2026-10-21',
        leadType: 'Survey lead',
        firstName: 'Test',
        lastName: 'Timing',
      });
      t.lap('save');
      SpreadsheetApp.flush();
      t.lap('flush');
      boot(ss, { reuseLists: true }); // as respond() does
      t.lap('refresh');
      const ms = Date.now() - start;
      ok(ms < 8000, `took ${ms} ms (${t.summary()})`);
      return t.summary();
    },
  },
  {
    name: 'phone app page is in the project',
    run: () => {
      const html = HtmlService.createHtmlOutputFromFile('App').getContent();
      ok(html.includes('id="app"'), 'app container');
      ok(html.includes('appBoot'), 'client script bundled');
    },
  },
];
