import { describe, expect, it } from 'vitest';
import {
  CARRIERS,
  COMMISSION_RATES,
  IRS_MILEAGE_RATES,
  LEAD_TYPES,
  OK_COUNTIES,
  PAYMENT_MODES,
  PLANS,
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
    const group = (name: string) => POLICY_STATUSES.find((s) => s.name === name)?.group;
    expect(['Lapsed', 'Cancelled'].map(group)).toEqual(['inactive', 'inactive']);
    // A death ends the policy too, but is not a lapse: kept out of persistency.
    expect(group('Deceased')).toBe('claim');
  });

  it('has sane lead costs, payment modes and mileage rates', () => {
    expect(LEAD_TYPES.every((l) => l.costPerLead >= 0)).toBe(true);
    expect(PAYMENT_MODES.every((m) => 12 % m.perYear === 0)).toBe(true);
    expect(IRS_MILEAGE_RATES.every((r) => r.dollarsPerMile > 0 && r.dollarsPerMile < 2)).toBe(true);
  });
});

describe('commission plans and rates', () => {
  const carriers = CARRIERS.map((c) => c.name);

  it('gives every plan a known carrier and at least one rate row', () => {
    expect(unique(PLANS.map((p) => p.name))).toBe(true);
    for (const p of PLANS) {
      if (p.carrier) expect(carriers, p.name).toContain(p.carrier);
      expect(
        COMMISSION_RATES.some((r) => r.plan === p.name),
        p.name,
      ).toBe(true);
    }
    for (const r of COMMISSION_RATES) expect(PLANS.map((p) => p.name)).toContain(r.plan);
  });

  it("matches the client's listing: advance months, CICA bank draft, Generational limit", () => {
    const advance = (carrier: string) => [
      ...new Set(PLANS.filter((p) => p.carrier === carrier).map((p) => p.advanceMonths)),
    ];
    expect(
      [
        'American Amicable',
        'Americo',
        'Mutual of Omaha',
        'Corebridge Financial',
        'Transamerica',
        'Generational Life',
      ].map(advance),
    ).toEqual([[9], [9], [9], [9], [9], [3]]);
    expect(['Aetna / CVS', 'Royal Neighbors of America'].map(advance)).toEqual([[0], [0]]);
    expect(
      PLANS.filter((p) => p.advanceLimit !== undefined).map((p) => [p.carrier, p.advanceLimit]),
    ).toEqual(Array(4).fill(['Generational Life', 1000]));
    expect(PLANS.filter((p) => p.bankDraftOnly).map((p) => p.carrier)).toEqual([
      'Citizens Life (CICA)',
      'Citizens Life (CICA)',
    ]);
  });

  it('has age bands that do not overlap within a plan', () => {
    for (const p of PLANS) {
      const bands = COMMISSION_RATES.filter((r) => r.plan === p.name).sort(
        (a, b) => (a.fromAge ?? 0) - (b.fromAge ?? 0),
      );
      if (bands.length > 1)
        expect(
          bands.every((b) => b.fromAge !== null),
          p.name,
        ).toBe(true);
      for (let i = 1; i < bands.length; i++) {
        expect(bands[i].fromAge!, p.name).toBeGreaterThan(bands[i - 1].toAge!);
      }
    }
  });

  it('keeps rates between 0% and 120%, renewals below year 1', () => {
    const flat = PLANS.filter((p) => p.flatMonthly !== undefined).map((p) => p.name);
    for (const r of COMMISSION_RATES.filter((r) => !flat.includes(r.plan))) {
      expect(r.year1).toBeGreaterThan(0);
      expect(r.year1).toBeLessThanOrEqual(1.2);
      for (const renewal of [r.years2to5, r.years6to10, r.years11on]) {
        if (renewal !== null) expect(renewal).toBeLessThan(r.year1);
      }
    }
  });

  it('copies the carrier schedules (spot checks)', () => {
    const find = (plan: string, age: number) =>
      COMMISSION_RATES.find(
        (r) => r.plan === plan && (r.fromAge ?? 0) <= age && age <= (r.toAge ?? 200),
      );
    expect(find('AmAm Level', 70)).toMatchObject({ year1: 1.1, years2to5: 0.065, years11on: 0 });
    expect(find('AmAm ROP / Graded', 82)).toMatchObject({ year1: 0.75, years2to5: 0.045 });
    expect(find('Aetna FE Level', 65)).toMatchObject({
      year1: 1.075,
      years6to10: 0.05,
      years11on: 0.02,
    });
    expect(find('Americo Eagle Select 1', 70)).toMatchObject({ year1: 1.05, years2to5: 0.01 });
    expect(find('RNA SIWL', 83)).toMatchObject({
      year1: 0.7,
      years2to5: 0.0225,
      years6to10: 0.013,
    });
    expect(find('MoO Living Promise Level', 50)).toMatchObject({
      year1: 1.1,
      years2to5: 0.045,
      years6to10: 0.025,
    });
    expect(find('MoO Living Promise Level', 82)).toMatchObject({ year1: 0.7, years11on: 0 });
    expect(find('MoO Living Promise Level', 86)).toBeUndefined();
    expect(find('MoO Term Life Express 15/20/30', 40)).toMatchObject({ year1: 1.1, years2to5: 0 });
    expect(find('Medicare', 70)).toMatchObject({ year1: 1, years11on: 1 });
    expect(PLANS.find((p) => p.name === 'Medicare')).toMatchObject({ flatMonthly: 36 });
    expect(find('TA Final expense', 70)).toMatchObject({ year1: 1.15, years2to5: 0, years11on: 0 });
    expect(find('GTL Heritage', 70)).toMatchObject({
      year1: 0.45,
      years2to5: 0.03,
      years6to10: 0.01,
    });
    expect(find('GL Sub-Standard', 78)).toMatchObject({
      year1: 0.58,
      years2to5: 0.02,
      years6to10: 0.005,
      years11on: 0.005,
    });
  });
});
