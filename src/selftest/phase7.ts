// Phase 7 integration tests: the assistant workbook. It is made in the tester's
// Drive, checked for private values, edited as the assistant would, synced, and
// trashed at the end. Cases run in order and share one freshly reset spreadsheet.

import {
  ASSISTANT_LOG_TAB,
  ASSISTANT_TABS,
  assistantWorkbook,
  createAssistantWorkbook,
  syncAssistant,
} from '../app/assistant';
import { LEAD_VIEW, NEW_LEAD_VIEW, POLICY_VIEW } from '../lib/assistant';
import { getFile, trashFile } from '../sheets/drive';
import { appendRecords, readRecords, updateRecord } from '../sheets/records';
import { setupWorkbook } from '../sheets/setup';
import { eq, ok, stopwatch, type TestCase } from './harness';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

/** Values that must never reach the assistant workbook. */
const PRIVATE = ['PRIVATE-NOTE', 'PRIVATE-MBI', 'PRIVATE-BEN', 'PRIVATE-POLICY-NOTE', '123.45'];

let bookId = '';

function loadData(ss: Spreadsheet): void {
  const [client] = appendRecords(ss, 'Clients', [
    { firstName: 'Test', lastName: 'Assist', phone: '(405) 555-0170', medicareId: 'PRIVATE-MBI', notes: 'PRIVATE-NOTE' },
  ]); // prettier-ignore
  const [policy] = appendRecords(ss, 'Policies', [
    { clientId: client.clientId, carrier: 'Mutual of Omaha', policyNumber: 'BU000001', premium: 123.45, status: 'Insufficient funds', draftDay: '3rd', notes: 'PRIVATE-POLICY-NOTE' },
  ]); // prettier-ignore
  appendRecords(ss, 'Beneficiaries', [
    {
      policyId: policy.policyId,
      name: 'PRIVATE-BEN',
      relationship: 'Son',
      kind: 'Primary',
      share: 1,
    },
  ]);
  appendRecords(ss, 'Leads', [
    { dateReceived: new Date(2026, 9, 1), leadType: 'Yes lead', firstName: 'Test', lastName: 'One', phone: '(405) 555-0171', notes: 'PRIVATE-NOTE' },
    { dateReceived: new Date(2026, 9, 2), leadType: 'Survey lead', firstName: 'Test', lastName: 'Two' },
  ]); // prettier-ignore
}

/** Every cell of the assistant workbook, hidden columns included. */
function allValues(book: Spreadsheet): string {
  return book
    .getSheets()
    .map((s) => s.getDataRange().getDisplayValues().flat().join('\n'))
    .join('\n');
}

/** View row of `id` (newest first, so look it up). */
function viewRow(book: Spreadsheet, tab: string, id: string): number {
  const ids = book.getSheetByName(tab)!.getRange('A:A').getValues().flat();
  const at = ids.indexOf(id);
  if (at < 1) throw new Error(`${tab}: no row ${id}`);
  return at + 1;
}

const col = (view: { key: string }[], key: string) => view.findIndex((c) => c.key === key) + 1;

export const PHASE7_CASES: TestCase[] = [
  {
    name: 'assistant workbook: made, filled, nothing private in it',
    run: (ss) => {
      const t = stopwatch();
      setupWorkbook(ss);
      loadData(ss);
      t.lap('setup');
      const sync = createAssistantWorkbook(ss);
      const book = assistantWorkbook(ss)!;
      bookId = book.getId();
      t.lap('create');
      eq([sync.changes, sync.added, sync.problems], [0, 0, 0], 'nothing to bring in yet');
      eq(
        book.getSheets().map((s) => s.getName()),
        Object.values(ASSISTANT_TABS),
        'tabs',
      );
      const leads = book
        .getSheetByName(ASSISTANT_TABS.leads)!
        .getRange(2, 1, 2, 6)
        .getDisplayValues();
      eq(
        leads.map((r) => r[4]),
        ['Two', 'One'],
        'leads, newest first',
      );
      const policy = book
        .getSheetByName(ASSISTANT_TABS.policies)!
        .getRange(2, 1, 1, 9)
        .getDisplayValues()[0];
      eq(
        [policy[1], policy[2], policy[3], policy[4], policy[5], policy[8]],
        [
          'Test Assist',
          '(405) 555-0170',
          'Mutual of Omaha',
          'BU000001',
          'Insufficient funds',
          '3rd',
        ],
        'policy view',
      );
      ok(/Insufficient funds: Test Assist/.test(allValues(book)), 'to-do list');
      const leaked = PRIVATE.filter((p) => allValues(book).includes(p));
      eq(leaked, [], 'private values in the assistant workbook');
      return t.summary();
    },
  },
  {
    name: 'assistant workbook: only the follow-up cells are editable, for the owner alone',
    run: () => {
      const book = SpreadsheetApp.openById(bookId);
      const editable = (tab: string) => {
        const [p] = book.getSheetByName(tab)!.getProtections(SpreadsheetApp.ProtectionType.SHEET);
        ok(p && !p.isWarningOnly(), `${tab}: protected, not just a warning`);
        return p
          .getUnprotectedRanges()
          .map((r) => r.getA1Notation().replace(/\d+/g, ''))
          .sort();
      };
      eq(
        editable(ASSISTANT_TABS.leads),
        ['G:G', 'H:H', 'J:J'],
        'Leads: contacted, appointment, notes',
      );
      eq(editable(ASSISTANT_TABS.policies), ['J:J'], 'Policies: notes');
      eq(editable(ASSISTANT_TABS.newLeads), ['A:F'], 'New leads: the entry cells');
      eq(editable(ASSISTANT_TABS.toDo), [], 'To do: read only');
      ok(
        book.getSheetByName(ASSISTANT_TABS.leads)!.isColumnHiddenByUser(LEAD_VIEW.length + 1),
        'sent copy hidden',
      );
    },
  },
  {
    name: "sync: the assistant's changes and new leads reach the tracker, logged",
    run: (ss) => {
      const t = stopwatch();
      const book = SpreadsheetApp.openById(bookId);
      const leadsTab = book.getSheetByName(ASSISTANT_TABS.leads)!;
      const [one] = readRecords(ss, 'Leads').map((r) => r.rec);
      const policyId = String(readRecords(ss, 'Policies')[0].rec.policyId);

      // As the assistant: tick and note lead One, note the policy, type two new leads.
      const r1 = viewRow(book, ASSISTANT_TABS.leads, String(one.leadId));
      leadsTab.getRange(r1, col(LEAD_VIEW, 'contacted')).setValue(true);
      leadsTab.getRange(r1, col(LEAD_VIEW, 'assistantNotes')).setValue('Left a voicemail');
      leadsTab.getRange(r1, col(LEAD_VIEW, 'firstName')).setValue('Ignored'); // read-only column
      const policies = book.getSheetByName(ASSISTANT_TABS.policies)!;
      policies
        .getRange(
          viewRow(book, ASSISTANT_TABS.policies, policyId),
          col(POLICY_VIEW, 'assistantNotes'),
        )
        .setValue('Will pay Friday');
      book
        .getSheetByName(ASSISTANT_TABS.newLeads)!
        .getRange(2, 1, 2, NEW_LEAD_VIEW.length)
        .setValues([
          [new Date(2026, 9, 5), 'Yes lead', 'Test', 'New', '4055550172', 'Call after 5'],
          [new Date(2026, 9, 5), 'Yes lead', '', 'Nameless', '', ''],
        ]);
      // Meanwhile the agent changes lead Two in the tracker: the stale view must not undo it.
      const twoRow = readRecords(ss, 'Leads')[1].row;
      updateRecord(ss, 'Leads', twoRow, { appointmentSet: true, contacted: true });

      const sync = syncAssistant(ss)!;
      t.lap('sync');
      eq([sync.changes, sync.added, sync.problems], [3, 1, 1], 'changes, added, problems');

      const leads = readRecords(ss, 'Leads').map((r) => r.rec);
      eq(
        leads.map((l) => [l.lastName, l.contacted, l.appointmentSet, l.assistantNotes]),
        [
          ['One', true, false, 'Left a voicemail'],
          ['Two', true, true, ''],
          ['New', false, false, 'Call after 5'],
        ],
        'leads in the tracker',
      );
      eq(leads[0].firstName, 'Test', 'read-only column not copied');
      eq(leads[0].notes, 'PRIVATE-NOTE', 'agent notes untouched');
      eq(readRecords(ss, 'Policies')[0].rec.assistantNotes, 'Will pay Friday', 'policy note');

      const log = ss.getSheetByName(ASSISTANT_LOG_TAB)!.getDataRange().getValues().slice(1);
      eq(
        log.map((r) => [r[1], r[3], r[5]]),
        [
          ['Changed', 'Contacted', true],
          ['Changed', 'Assistant notes', 'Left a voicemail'],
          ['Changed', 'Assistant notes', 'Will pay Friday'],
          ['New lead', '', 'Test New'],
        ],
        'log',
      );

      const newLeads = book
        .getSheetByName(ASSISTANT_TABS.newLeads)!
        .getRange(2, 1, 3, 7)
        .getValues();
      eq(newLeads[0][3], 'Nameless', 'the bad row stays');
      ok(
        /First name/i.test(String(newLeads[0][6])) || /required/i.test(String(newLeads[0][6])),
        `problem: ${newLeads[0][6]}`,
      );
      eq(newLeads[1].join(''), '', 'the added row is cleared');
      ok(
        book.getSheetByName(ASSISTANT_TABS.leads)!.getRange('E2').getValue() === 'New',
        'new lead shows in the view',
      );
      eq(
        PRIVATE.filter((p) => allValues(book).includes(p)),
        [],
        'still nothing private',
      );
      return t.summary();
    },
  },
  {
    name: 'sync again: nothing new, nothing changed',
    run: (ss) => {
      const sync = syncAssistant(ss)!;
      eq([sync.changes, sync.added, sync.problems], [0, 0, 1], 'only the bad row is left');
      eq(ss.getSheetByName(ASSISTANT_LOG_TAB)!.getLastRow(), 5, 'log unchanged');
    },
  },
  {
    name: 'clean up: assistant workbook trashed',
    run: (ss) => {
      trashFile(bookId);
      eq(getFile(bookId).trashed, true, 'trashed');
      eq(assistantWorkbook(ss), null, 'a trashed workbook counts as none');
      eq(syncAssistant(ss), null, 'no sync without one');
    },
  },
];
