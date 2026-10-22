import { describe, expect, it } from 'vitest';
import { daysBetween, nextYearly, reminders, type ReminderInput } from '../src/lib/reminders';

const policy = (over: Partial<ReminderInput['policies'][0]>): ReminderInput['policies'][0] => ({
  id: 'PO-0001',
  client: 'Test Alpha',
  carrier: 'Mutual of Omaha',
  status: 'Paid as issued',
  group: 'active',
  start: '',
  applicationDate: '',
  firstDraftDate: '',
  draftDay: '',
  ...over,
});

const base: ReminderInput = { today: '2026-10-22', clients: [], policies: [], leads: [] };
const texts = (input: Partial<ReminderInput>) =>
  reminders({ ...base, ...input }).map((r) => r.text);

describe('reminders', () => {
  it('birthdays in the next 7 days, with the age', () => {
    expect(
      texts({
        clients: [
          { id: 'CL-1', name: 'Test Today', birthday: '1951-10-22' },
          { id: 'CL-2', name: 'Test Friday', birthday: '1960-10-24' },
          { id: 'CL-3', name: 'Test Later', birthday: '1960-10-30' },
          { id: 'CL-4', name: 'Test Past', birthday: '1960-10-21' },
          { id: 'CL-5', name: 'Test None', birthday: '' },
        ],
      }),
    ).toEqual(['Test Today turns 75 today', 'Test Friday turns 66 on Sat 10/24']);
  });

  it('policy anniversaries from 1 year, active or at risk only', () => {
    expect(
      texts({
        policies: [
          policy({ id: 'P1', start: '2025-10-23' }),
          policy({ id: 'P2', start: '2026-10-23' }), // starts this year: no anniversary yet
          policy({ id: 'P3', start: '2023-10-25', group: 'inactive', status: 'Lapsed' }),
        ],
      }),
    ).toEqual(['Test Alpha (Mutual of Omaha): policy 1 year tomorrow']);
  });

  it('first drafts: overdue first, then the next 3 days', () => {
    const r = reminders({
      ...base,
      policies: [
        policy({ id: 'P1', group: 'pending', status: 'Pending', firstDraftDate: '2026-10-25' }),
        policy({ id: 'P2', group: 'pending', status: 'Pending', firstDraftDate: '2026-10-20' }),
        policy({ id: 'P3', group: 'pending', status: 'Pending', firstDraftDate: '2026-11-20' }),
        policy({ id: 'P4', group: 'active', firstDraftDate: '2026-10-20' }), // already paid
      ],
    });
    expect(r.map((x) => [x.ref, x.text])).toEqual([
      ['P2', 'First draft for Test Alpha (Mutual of Omaha) was due 10/20: check it went through, then update the status'],
      ['P1', 'First draft for Test Alpha (Mutual of Omaha) on Sun 10/25'],
    ]); // prettier-ignore
  });

  it('insufficient funds come first, with the draft day', () => {
    const r = reminders({
      ...base,
      clients: [{ id: 'CL-1', name: 'Test Bday', birthday: '1950-10-22' }],
      policies: [policy({ group: 'at_risk', status: 'Insufficient funds', draftDay: '4th Wed' })],
    });
    expect(r[0].kind).toBe('atRisk');
    expect(r[0].text).toBe(
      'Insufficient funds: Test Alpha (Mutual of Omaha). Call to fix the payment (drafts 4th Wed)',
    );
  });

  it('applications pending 21+ days with no first draft date', () => {
    expect(
      texts({
        policies: [
          policy({ id: 'P1', group: 'pending', status: 'Pending', applicationDate: '2026-09-30' }),
          policy({ id: 'P2', group: 'pending', status: 'Pending', applicationDate: '2026-10-10' }),
        ],
      }),
    ).toEqual(['Application for Test Alpha (Mutual of Omaha) pending for 22 days']);
  });

  it('leads not contacted after 2 days, for up to 30 days', () => {
    const lead = (id: string, dateReceived: string, contacted = false) => ({
      id,
      name: `Test ${id}`,
      leadType: 'Yes lead',
      dateReceived,
      contacted,
    });
    expect(
      texts({
        leads: [
          lead('A', '2026-10-20'),
          lead('B', '2026-10-21'), // only 1 day
          lead('C', '2026-09-01'), // too old
          lead('D', '2026-10-15', true),
        ],
      }),
    ).toEqual(['Test A (Yes lead) came in 2 days ago, not contacted yet']);
  });
});

describe('reminder dates', () => {
  it('counts days and finds the next yearly date, Feb 29 included', () => {
    expect(daysBetween('2026-10-22', '2026-11-01')).toBe(10);
    expect(nextYearly('1950-12-01', '2026-10-22')).toBe('2026-12-01');
    expect(nextYearly('1950-01-05', '2026-10-22')).toBe('2027-01-05');
    expect(nextYearly('1952-02-29', '2027-01-10')).toBe('2027-02-28');
    expect(nextYearly('1952-02-29', '2028-01-10')).toBe('2028-02-29');
  });
});
