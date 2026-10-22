import { describe, expect, it } from 'vitest';
import { IRS_MILEAGE_RATES } from '../src/config/lists';
import { rateOn } from '../src/lib/rates';

describe('rateOn', () => {
  it('picks the latest row that has started', () => {
    expect(rateOn(IRS_MILEAGE_RATES, '2025-06-15')?.dollarsPerMile).toBe(0.7);
    expect(rateOn(IRS_MILEAGE_RATES, '2026-01-01')?.dollarsPerMile).toBe(0.725);
    expect(rateOn(IRS_MILEAGE_RATES, '2026-06-30')?.dollarsPerMile).toBe(0.725);
    expect(rateOn(IRS_MILEAGE_RATES, '2026-10-21')?.dollarsPerMile).toBe(0.76);
  });

  it('returns undefined before the first row', () => {
    expect(rateOn(IRS_MILEAGE_RATES, '2024-12-31')).toBeUndefined();
  });

  it('does not depend on row order', () => {
    const shuffled = [...IRS_MILEAGE_RATES].reverse();
    expect(rateOn(shuffled, '2026-03-01')?.dollarsPerMile).toBe(0.725);
  });
});
