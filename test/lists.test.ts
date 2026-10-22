import { describe, expect, it } from 'vitest';
import {
  CARRIERS,
  IRS_MILEAGE_RATES,
  LEAD_TYPES,
  OK_COUNTIES,
  PAYMENT_MODES,
  POLICY_STATUSES,
} from '../src/config/lists';

const unique = (xs: string[]) => new Set(xs).size === xs.length;

describe('default lists', () => {
  it('has all 77 Oklahoma counties, once each', () => {
    expect(OK_COUNTIES).toHaveLength(77);
    expect(unique(OK_COUNTIES)).toBe(true);
  });

  it('has unique carrier names and aliases', () => {
    expect(unique(CARRIERS.map((c) => c.name))).toBe(true);
    const aliases = CARRIERS.flatMap((c) => c.aliases.map((a) => a.toLowerCase()));
    expect(unique(aliases)).toBe(true);
  });

  it('keeps Devoted as the only Medicare carrier', () => {
    const medicare = CARRIERS.filter((c) => c.lines.includes('medicare')).map((c) => c.name);
    expect(medicare).toEqual(['Devoted Health']);
  });

  it('covers every inactive reason the client asked for', () => {
    const inactive = POLICY_STATUSES.filter((s) => s.group === 'inactive').map((s) => s.name);
    expect(inactive).toEqual(expect.arrayContaining(['Lapsed', 'Cancelled', 'Deceased']));
  });

  it('has sane lead costs, payment modes and mileage rates', () => {
    expect(LEAD_TYPES.every((l) => l.costPerLead >= 0)).toBe(true);
    expect(PAYMENT_MODES.every((m) => 12 % m.perYear === 0)).toBe(true);
    expect(IRS_MILEAGE_RATES.every((r) => r.dollarsPerMile > 0 && r.dollarsPerMile < 2)).toBe(true);
  });
});
