import { describe, expect, it } from 'vitest';
import {
  BENEFICIARY_TYPES,
  CARRIERS,
  MEDICARE_PLAN_TYPES,
  PRODUCT_TYPES,
  SMOKER_OPTIONS,
} from '../src/config/lists';
import { noteDate, parseContact, type ReaderContext } from '../src/lib/contactReader';
import { tc1Card, tc1Notes, tc2, tc3Card, tc3End, tc3Middle } from './fixtures/sampleOcr';

const ctx: ReaderContext = {
  today: '2026-10-22',
  carriers: CARRIERS,
  lists: {
    States: ['OK'],
    ProductTypes: PRODUCT_TYPES,
    MedicarePlanTypes: MEDICARE_PLAN_TYPES,
    Smoker: SMOKER_OPTIONS,
    BeneficiaryTypes: BENEFICIARY_TYPES,
  },
};

// Every private value in the samples, as written or as OCR read it.
const PRIVATE = [
  '123456789', '345678913', 'R0123456789', '00001LI1L0O', '1234.5678.9876.5432', '1234-5678-99',
  '3456.7898.7654.3212', '3456.1898.7654.3212', '6543.3456.7898.7654', '34534534567',
  '34554334565', '21551221565', 'Tfcu', 'Midfirst', 'MidF', 'BOK', '10.10.31', '12.12.33',
  '12.20.33', 'Test client"',
]; // prettier-ignore

function expectNoPrivateData(result: unknown): void {
  const json = JSON.stringify(result);
  for (const value of PRIVATE) expect(json, value).not.toContain(value);
}

describe('contact screenshot reader (client test contacts)', () => {
  it('Test Client 1: card, notes, policy, beneficiaries', () => {
    const r = parseContact([tc1Card, tc1Notes], ctx);
    expect(r.client).toEqual({
      firstName: 'Test',
      lastName: 'Client 1',
      phone: '(405) 123-4567',
      email: 'testemail1@email.com',
      street: '123 Test Street',
      city: 'Test City',
      state: 'OK',
      zip: '73111',
      height: `5'6"`,
      weightLbs: '150',
      smoker: 'Non-smoker',
      notes: 'Met 10/10/2026',
    });
    expect(r.policy).toEqual({
      carrier: 'Combined Insurance',
      productType: 'Final expense - Graded',
      faceAmount: '10000',
      premium: '110', // "10k for 110": monthly (client, 2026-10-22)
      paymentMode: 'Monthly',
      issueDate: '2026-11-25',
      draftDay: '4th Wed',
      policyNumber: 'G77788888',
      applicationDate: '2026-10-10',
      status: 'Pending',
    });
    expect(r.beneficiaries).toEqual([
      { name: 'Test son 1', relationship: 'Son', kind: 'Primary', share: '34' },
      { name: 'Test daughter 1', relationship: 'Daughter', kind: 'Primary', share: '33' },
      { name: 'Test nephew 1', relationship: 'Nephew', kind: 'Primary', share: '33' },
    ]);
    // A birthday in the current year is flagged, not saved (client used it as a test).
    expect(r.client.birthday).toBeUndefined();
    expect(r.warnings).toEqual([expect.stringMatching(/Birthday Wed, Oct 21, 2026 .*left out/)]);
    // Health notes stay out of the sheet; they are only listed for review.
    expect(r.unread).toEqual([
      'Diabetic no neuropathy',
      'Born in Gainesville Tx',
      '2 Strokes last year',
    ]);
    expect(r.removed).toBeGreaterThanOrEqual(8);
    expectNoPrivateData(r);
  });

  it('Test Client 2: Medicare, birthday without a year, linked parent', () => {
    const r = parseContact([tc2], ctx);
    expect(r.client).toEqual({
      firstName: 'Test',
      lastName: 'Client 2',
      phone: '(405) 234-5678',
      medicareId: '2345678987',
      medicarePlan: 'Advantage',
      notes: 'Met 10/10/2026',
    });
    expect(r.policy).toEqual({
      carrier: 'Devoted Health',
      productType: 'Medicare Advantage',
      applicationDate: '2026-10-10',
      status: 'Pending',
    });
    // Linked contacts are beneficiaries (client, 2026-10-22).
    expect(r.beneficiaries).toEqual([
      { name: 'Test Client 1', relationship: 'Parent', kind: 'Primary' },
    ]);
    expect(r.warnings.join('\n')).toMatch(/Birthday "Nov 21" has no year/);
    expect(r.unread).toEqual([]);
  });

  it('Test Client 3: three overlapping screenshots, any order', () => {
    const r = parseContact([tc3Middle, tc3End, tc3Card], ctx);
    expect(r.client).toMatchObject({
      firstName: 'Test',
      lastName: 'Client 3',
      phone: '(405) 345-6789',
      email: 'testemail3@email.com',
      street: '345 Test Street',
      city: 'Test City',
      zip: '73222',
      birthday: '1951-12-21',
      height: `6'5"`,
      weightLbs: '280',
      smoker: 'Smoker',
      existingCoverage:
        'Has 5k policy w AmAm from 02; Had 10k with MOO lapsed; Had 7k GI RN; Had 5k term NYLife',
    });
    expect(r.referredByName).toBe('Test Client 1');
    expect(r.policy).toMatchObject({
      carrier: 'Guarantee Trust Life',
      productType: 'Final expense - Graded',
      faceAmount: '15000',
      premium: '220',
      issueDate: '2026-11-03',
      policyNumber: 'GTL7343456',
    });
    expect(r.beneficiaries).toEqual([
      { name: 'Test Client 2', relationship: 'Child', kind: 'Primary' },
      { name: 'Test Husband 3', relationship: 'Husband', kind: 'Primary', phone: '(405) 345-6788' },
      {
        name: 'Test Daughter 3',
        relationship: 'Daughter',
        kind: 'Primary',
        phone: '(405) 345-6777',
      },
      // "Con." block; the 11-digit phone is kept as written so the form flags it.
      { name: 'Test son 3', relationship: 'Son', kind: 'Contingent', phone: '40534566666' },
    ]);
    expect(r.warnings.join('\n')).toMatch(/Test son 3 \(40534566666\) is not 10 digits/);
    expect(r.unread).toEqual(
      expect.arrayContaining(['Right leg amputated 2010', 'Double Bypass 04']),
    );
    expectNoPrivateData(r);

    // The agent may pick the screenshots in any order; phones must stay with their owner.
    const shots = [tc3Card, tc3Middle, tc3End];
    for (const order of [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ]) {
      const other = parseContact(
        order.map((i) => shots[i]),
        ctx,
      );
      expect(other.client, `order ${order}`).toEqual(r.client);
      expect(other.policy, `order ${order}`).toEqual(r.policy);
      expect(
        other.beneficiaries.map((b) => [b.name, b.phone ?? '']).sort(),
        `order ${order}`,
      ).toEqual(r.beneficiaries.map((b) => [b.name, b.phone ?? '']).sort());
    }
  });
});

describe('contact reader rules', () => {
  const card = (notes: string) => `12:00\nTest Person\nMobile (405) 555-0100\nNotes\n${notes}`;

  it('reads notes written other ways', () => {
    const r = parseContact(
      [card('Ben: W. Test Wife 100%\nMoO level 15k for 120\nDraft 3rd\nPolicy BU654321')],
      ctx,
    );
    expect(r.policy).toMatchObject({
      carrier: 'Mutual of Omaha',
      productType: 'Final expense - Level',
      faceAmount: '15000',
      premium: '120',
      draftDay: '3rd',
      policyNumber: 'BU654321',
    });
    expect(r.beneficiaries).toEqual([
      { name: 'Test Wife', relationship: 'Wife', kind: 'Primary', share: '100' },
    ]);
  });

  it('drops a whole card block and a cut-off card number', () => {
    const r = parseContact(
      [card('Visa\n4111 1111 1111 1111\n01/29\n123\nTest Person\nRouting 103000648\n4111-1111-11')],
      ctx,
    );
    expect(r.unread).toEqual([]);
    expect(r.removed).toBe(7);
    expect(JSON.stringify(r)).not.toMatch(/4111|103000648|01\/29/);
  });

  it('warns about shares that do not add up and beneficiaries without a policy', () => {
    const r = parseContact([card('Ben:\nS. Test Son 50%\nD. Test Daughter 40%')], ctx);
    expect(r.warnings).toEqual(
      expect.arrayContaining([
        'Beneficiaries need a policy: add the policy or remove them',
        'Primary beneficiary shares add up to 90%, not 100%',
      ]),
    );
  });

  it('warns when the top of the contact is missing or contacts are mixed', () => {
    expect(parseContact([tc1Notes], ctx).warnings).toContain(
      'No screenshot shows the top of the contact (name and phone)',
    );
    expect(parseContact([tc1Card, tc2], ctx).warnings.join('\n')).toMatch(/more than one contact/);
  });

  it('reads note dates', () => {
    expect(noteDate('10.10.26', '2026-10-22')).toBe('2026-10-10');
    expect(noteDate('11.3.26', '2026-10-22')).toBe('2026-11-03');
    expect(noteDate('4/2/51', '2026-10-22')).toBe('1951-04-02');
    expect(noteDate('2/30/26', '2026-10-22')).toBeUndefined();
  });
});
