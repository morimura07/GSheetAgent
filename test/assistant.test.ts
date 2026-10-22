import { describe, expect, it } from 'vitest';
import { dataTab } from '../src/config/schema';
import {
  LEAD_VIEW,
  NEW_LEAD_VIEW,
  POLICY_VIEW,
  findEdits,
  newLeadRows,
  viewRows,
} from '../src/lib/assistant';

const keys = (view: { key: string }[]) => view.map((c) => c.key);

describe('assistant views', () => {
  it('show only the agreed columns', () => {
    // Names, phones, carrier, policy number, status and follow-up fields only.
    // Changing these lists means asking the client first.
    expect(keys(LEAD_VIEW)).toEqual([
      'leadId', 'dateReceived', 'leadType', 'firstName', 'lastName', 'phone',
      'contacted', 'appointmentSet', 'applicationWritten', 'assistantNotes',
    ]); // prettier-ignore
    expect(keys(POLICY_VIEW)).toEqual([
      'policyId', 'clientName', 'phone', 'carrier', 'policyNumber', 'status',
      'statusDate', 'firstDraftDate', 'draftDay', 'assistantNotes',
    ]); // prettier-ignore
  });

  it('use real columns that are not marked sensitive', () => {
    const check = (tab: 'Leads' | 'Policies' | 'Clients', key: string) => {
      const column = dataTab(tab).columns.find((c) => c.key === key);
      expect(column, `${tab}.${key}`).toBeDefined();
      expect(column!.sensitive, `${tab}.${key}`).toBeFalsy();
    };
    for (const c of [...LEAD_VIEW, ...NEW_LEAD_VIEW]) check('Leads', c.key);
    for (const c of POLICY_VIEW) check(c.key === 'phone' ? 'Clients' : 'Policies', c.key);
  });

  it('never include notes, Medicare or money columns', () => {
    const all = keys([...LEAD_VIEW, ...POLICY_VIEW, ...NEW_LEAD_VIEW]);
    for (const k of ['notes', 'medicareId', 'medicarePlan', 'premium', 'faceAmount', 'cost']) {
      expect(all).not.toContain(k);
    }
  });
});

describe('assistant edits', () => {
  const lead = {
    leadId: 'LD-0001',
    dateReceived: new Date(2026, 9, 1),
    leadType: 'Yes lead',
    firstName: 'Test',
    lastName: 'Lead',
    phone: '(405) 555-0101',
    contacted: false,
    appointmentSet: '',
    applicationWritten: true,
    assistantNotes: ' called once ',
    notes: 'private',
  };

  it('writes the view columns and a copy of the editable values', () => {
    const [row] = viewRows(LEAD_VIEW, [lead]);
    expect(row.slice(0, LEAD_VIEW.length)).toEqual([
      'LD-0001', lead.dateReceived, 'Yes lead', 'Test', 'Lead', '(405) 555-0101',
      false, false, true, ' called once ',
    ]); // prettier-ignore
    expect(JSON.parse(String(row[LEAD_VIEW.length]))).toEqual({
      contacted: false,
      appointmentSet: false,
      assistantNotes: 'called once',
    });
    expect(row).not.toContain('private');
  });

  it('finds only the editable cells the assistant changed', () => {
    const [row] = viewRows(LEAD_VIEW, [lead]);
    expect(findEdits(LEAD_VIEW, [row])).toEqual([]);

    const edited = [...row];
    edited[6] = true; // contacted
    edited[9] = 'called once  '; // only spaces changed: no edit
    edited[3] = 'Changed'; // not editable: ignored
    edited[8] = false; // not editable: ignored
    expect(findEdits(LEAD_VIEW, [edited])).toEqual([
      { id: 'LD-0001', key: 'contacted', value: true },
    ]);
    edited[9] = 'left a voicemail';
    expect(findEdits(LEAD_VIEW, [edited])).toEqual([
      { id: 'LD-0001', key: 'contacted', value: true },
      { id: 'LD-0001', key: 'assistantNotes', value: 'left a voicemail' },
    ]);
  });

  it('skips rows without an ID or a readable sent copy', () => {
    const [row] = viewRows(LEAD_VIEW, [lead]);
    const noId = ['', ...row.slice(1)];
    const noSent = [...row.slice(0, LEAD_VIEW.length), 'garbled'];
    noSent[6] = true;
    expect(findEdits(LEAD_VIEW, [noId, noSent])).toEqual([]);
  });

  it('picks the typed-in new lead rows', () => {
    const rows = [
      ['', '', '', '', '', ''],
      ['', 'Yes lead', 'Test', 'New', '4055550102', 'call after 5'],
      ['  ', '', '', '', '', ''],
    ];
    expect(newLeadRows(rows)).toEqual([
      {
        index: 1,
        rec: {
          dateReceived: '',
          leadType: 'Yes lead',
          firstName: 'Test',
          lastName: 'New',
          phone: '4055550102',
          assistantNotes: 'call after 5',
        },
      },
    ]);
  });
});
