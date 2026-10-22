import { describe, expect, it } from 'vitest';
import {
  DATA_TABS,
  SETTINGS_LISTS,
  SETTINGS_TABLES,
  SIMPLE_LISTS,
  settingsTableStart,
} from '../src/config/schema';
import { columnLetter, headerFormula, resolveFormula } from '../src/lib/columns';

const listNames = new Set([...Object.keys(SIMPLE_LISTS), ...Object.keys(SETTINGS_LISTS)]);
const settingsNames = new Set(
  SETTINGS_TABLES.flatMap((t) => t.columns.map((c) => `set_${t.key}_${c.key}`)),
);

describe('schema', () => {
  it('has unique tab names, ID prefixes and column keys', () => {
    const unique = (xs: string[]) => new Set(xs).size === xs.length;
    expect(unique(DATA_TABS.map((t) => t.name))).toBe(true);
    expect(unique(DATA_TABS.map((t) => t.idPrefix))).toBe(true);
    for (const tab of DATA_TABS) expect(unique(tab.columns.map((c) => c.key))).toBe(true);
  });

  it('starts every data tab with exactly one ID column', () => {
    for (const tab of DATA_TABS) {
      expect(tab.columns[0].type).toBe('id');
      expect(tab.columns.filter((c) => c.type === 'id')).toHaveLength(1);
    }
  });

  it('points every dropdown and reference at something that exists', () => {
    for (const tab of DATA_TABS) {
      for (const c of tab.columns) {
        if (c.type === 'list') expect(listNames, `${tab.name}.${c.key}`).toContain(c.list);
        if (c.type === 'ref') expect(DATA_TABS.map((t) => t.name)).toContain(c.refTab);
        if (c.type === 'formula') expect(c.formula, `${tab.name}.${c.key}`).toBeTruthy();
      }
    }
    for (const [name, src] of Object.entries(SETTINGS_LISTS)) {
      expect(settingsNames, name).toContain(`set_${src.table}_${src.column}`);
    }
  });

  it('resolves every formula placeholder and named range', () => {
    for (const tab of DATA_TABS) {
      for (const c of tab.columns.filter((x) => x.type === 'formula')) {
        const f = resolveFormula(c.formula!, tab);
        expect(f, `${tab.name}.${c.key}`).not.toMatch(/\[\[/);
        for (const name of f.match(/\bset_\w+/g) ?? []) expect(settingsNames).toContain(name);
      }
    }
  });

  it('keeps settings seed rows the same width as their tables', () => {
    for (const t of SETTINGS_TABLES) {
      for (const row of t.seed) expect(row, t.key).toHaveLength(t.columns.length);
    }
  });

  it('lays settings tables out left to right with a gap', () => {
    expect(settingsTableStart('Carriers')).toBe(1);
    expect(settingsTableStart('PolicyStatuses')).toBe(5);
  });
});

describe('columns', () => {
  it('converts numbers to column letters', () => {
    expect([1, 26, 27, 52, 703].map(columnLetter)).toEqual(['A', 'Z', 'AA', 'AZ', 'AAA']);
  });

  it('resolves same-tab and cross-tab placeholders', () => {
    const policies = DATA_TABS.find((t) => t.name === 'Policies')!;
    expect(resolveFormula('[[clientId]]', policies)).toBe('B2:B');
    expect(resolveFormula('[[Clients.lastName]]', policies)).toBe(`'Clients'!C2:C`);
    expect(() => resolveFormula('[[Nope.x]]', policies)).toThrow();
    expect(() => resolveFormula('[[nope]]', policies)).toThrow();
  });

  it('builds the header-cell array formula', () => {
    const clients = DATA_TABS.find((t) => t.name === 'Clients')!;
    expect(headerFormula('Say "hi"', 'ARRAYFORMULA([[birthday]])', clients)).toBe(
      '={"Say ""hi""";ARRAYFORMULA(K2:K)}',
    );
  });
});
