// Phase 6 integration tests: reminders from real rows, and the Excel copy
// (built, unzipped and parsed here, then saved to Drive and cleaned up).
// Cases run in order and share one freshly reset spreadsheet.

import { housekeeping, readReminders } from '../app/service';
import { XLSX_MIME } from '../lib/xlsx';
import { getFile, trashFile } from '../sheets/drive';
import { excelFile, exportToExcel, monthlyExportIfDue } from '../sheets/export';
import { appendRecords } from '../sheets/records';
import { TAB_ORDER, setupWorkbook } from '../sheets/setup';
import { today } from '../sheets/util';
import { eq, ok, stopwatch, type TestCase } from './harness';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

/** Today plus `days`, at midnight in the script's time zone. */
const day = (days: number, yearsAgo = 0) => {
  const d = today();
  d.setDate(d.getDate() + days);
  d.setFullYear(d.getFullYear() - yearsAgo);
  return d;
};

/** Files saved to Drive by this run, trashed at the end. */
const made: string[] = [];

function loadReminderData(ss: Spreadsheet): void {
  const [birthday, plain] = appendRecords(ss, 'Clients', [
    { firstName: 'Test', lastName: 'Birthday', birthday: day(2, 70) },
    { firstName: 'Test', lastName: 'Policies', birthday: day(100, 60) },
  ]).map((c) => String(c.clientId));
  appendRecords(ss, 'Policies', [
    { clientId: plain, carrier: 'Mutual of Omaha', status: 'Pending', applicationDate: day(-10), firstDraftDate: day(-1) },
    { clientId: plain, carrier: 'Transamerica', status: 'Insufficient funds', effectiveDate: day(-200), draftDay: '3rd' },
    { clientId: birthday, carrier: 'Combined Insurance', status: 'Paid as issued', effectiveDate: day(3, 1) },
    { clientId: plain, carrier: 'Foresters Financial', status: 'Pending', applicationDate: day(-30) },
  ]); // prettier-ignore
  appendRecords(ss, 'Leads', [
    { dateReceived: day(-3), leadType: 'Yes lead', firstName: 'Test', lastName: 'Waiting' },
    {
      dateReceived: day(-3),
      leadType: 'Yes lead',
      firstName: 'Test',
      lastName: 'Called',
      contacted: true,
    },
  ]);
}

export const PHASE6_CASES: TestCase[] = [
  {
    name: 'setup, then reminders from the workbook rows',
    run: (ss) => {
      setupWorkbook(ss);
      loadReminderData(ss);
      const list = readReminders(ss);
      eq(
        list.map((r) => r.kind),
        ['atRisk', 'draft', 'lead', 'pending', 'birthday', 'anniversary'],
        'kinds, most urgent first',
      );
      const text = list.map((r) => r.text).join('\n');
      ok(/Insufficient funds: Test Policies \(Transamerica\).*drafts 3rd/.test(text), text);
      ok(/First draft for Test Policies \(Mutual of Omaha\) was due/.test(text), text);
      ok(/Test Waiting \(Yes lead\) came in 3 days ago/.test(text), text);
      ok(
        /Application for Test Policies \(Foresters Financial\) pending for 30 days/.test(text),
        text,
      );
      ok(/Test Birthday turns 70 on /.test(text), text);
      ok(/Test Birthday \(Combined Insurance\): policy 1 year on /.test(text), text);
    },
  },
  {
    name: 'Excel copy: a valid .xlsx with every tab and the values',
    run: (ss) => {
      const t = stopwatch();
      const { blob, name } = excelFile(ss);
      t.lap('build');
      ok(name.endsWith('.xlsx'), name);
      eq(blob.getContentType(), XLSX_MIME, 'type');
      const parts = new Map(
        Utilities.unzip(blob.copyBlob().setContentType('application/zip')).map((b) => [
          b.getName() ?? '',
          b.getDataAsString(),
        ]),
      );
      for (const xml of parts.values()) XmlService.parse(xml); // throws on bad XML
      const tabs = TAB_ORDER.filter((n) => ss.getSheetByName(n));
      eq(
        [...parts.keys()].filter((p) => p.startsWith('xl/worksheets/')).length,
        tabs.length,
        'one sheet per tab',
      );
      const workbook = parts.get('xl/workbook.xml')!;
      ok(workbook.includes('name="Tax &amp; hours"'), 'report tabs included');
      const clients = parts.get(`xl/worksheets/sheet${tabs.indexOf('Clients') + 1}.xml`)!;
      ok(clients.includes('>Birthday<'), 'client values');
      ok(/<c r="[A-Z]+2" s="2"><v>\d+<\/v><\/c>/.test(clients), 'birthday written as a date');
      t.lap('checked');
      return t.summary();
    },
  },
  {
    name: 'Excel copy saved to Drive; once a month from the phone app',
    run: (ss) => {
      const t = stopwatch();
      const file = exportToExcel(ss);
      made.push(file.id);
      t.lap('save');
      const saved = getFile(file.id);
      eq(saved.mimeType, XLSX_MIME, 'stored as an Excel file, not converted');
      ok(Number(saved.size) > 2000, `size ${saved.size}`);

      const first = housekeeping(ss);
      ok(first.exported, 'first time this month: a copy is made');
      made.push(first.exported!.id);
      ok(first.reminders.length === 6, `reminders: ${first.reminders.length}`);
      t.lap('housekeeping');
      eq(housekeeping(ss).exported, null, 'not again the same month');
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const next = monthlyExportIfDue(ss, nextMonth);
      ok(next, 'next month: a new copy');
      made.push(next!.id);
      return t.summary();
    },
  },
  {
    name: 'clean up the copies made by this run',
    run: () => {
      for (const id of made) trashFile(id);
      eq(
        made.map((id) => getFile(id).trashed),
        [true, true, true],
        'copies trashed',
      );
    },
  },
];
