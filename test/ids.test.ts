import { describe, expect, it } from 'vitest';
import { DATA_TABS } from '../src/config/schema';
import { formatId, nextIdNumber, parseIdNumber, rowNeedsId } from '../src/lib/ids';
import { leadCostOn } from '../src/lib/rates';
import { rowFromObject } from '../src/lib/rows';

describe('ids', () => {
  it('formats and parses IDs', () => {
    expect(formatId('CL', 7)).toBe('CL-0007');
    expect(formatId('CL', 12345)).toBe('CL-12345');
    expect(parseIdNumber('CL', 'CL-0007')).toBe(7);
    expect(parseIdNumber('CL', ' CL-0042 ')).toBe(42);
    expect(parseIdNumber('CL', 'PO-0007')).toBeNull();
    expect(parseIdNumber('CL', '')).toBeNull();
  });

  it('never reuses an ID', () => {
    expect(nextIdNumber('CL', [], 0)).toBe(1);
    expect(nextIdNumber('CL', ['CL-0001', 'CL-0009', '', 'junk'], 0)).toBe(10);
    // Last row deleted: the stored counter still wins.
    expect(nextIdNumber('CL', ['CL-0001'], 10)).toBe(10);
  });

  it('assigns an ID once any entry cell is filled', () => {
    expect(rowNeedsId(['', 'Ann', ''], 0, [1, 2])).toBe(true);
    expect(rowNeedsId(['', '', false], 0, [1, 2])).toBe(false);
    expect(rowNeedsId(['', '', true], 0, [1, 2])).toBe(true);
    expect(rowNeedsId(['CL-0001', 'Ann', ''], 0, [1, 2])).toBe(false);
  });
});

describe('leadCostOn', () => {
  const rows = [
    { leadType: 'Yes lead', cost: 10, from: '2026-01-01' },
    { leadType: 'Yes lead', cost: 12, from: '2026-11-01' },
    { leadType: 'Survey lead', cost: 23, from: '2026-01-01' },
  ];

  it('uses the price in effect on the date received', () => {
    expect(leadCostOn(rows, 'Yes lead', '2026-10-31')).toBe(10);
    expect(leadCostOn(rows, 'Yes lead', '2026-11-01')).toBe(12);
    expect(leadCostOn(rows, 'Survey lead', '2026-12-01')).toBe(23);
  });

  it('returns undefined for unknown types or dates before any price', () => {
    expect(leadCostOn(rows, 'Mail-in lead', '2026-10-01')).toBeUndefined();
    expect(leadCostOn(rows, 'Yes lead', '2025-12-31')).toBeUndefined();
  });
});

describe('rowFromObject', () => {
  const leads = DATA_TABS.find((t) => t.name === 'Leads')!;

  it('places values in column order', () => {
    const row = rowFromObject(leads, { leadType: 'Yes lead', contacted: true });
    expect(row).toHaveLength(leads.columns.length);
    expect(row[2]).toBe('Yes lead');
    expect(row[7]).toBe(true);
    expect(row[0]).toBe('');
  });

  it('rejects unknown keys', () => {
    expect(() => rowFromObject(leads, { nope: 1 })).toThrow(/nope/);
  });
});
