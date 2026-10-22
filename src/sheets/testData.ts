// Fake records for the DEV workbook. Refuses to run once Clients has data,
// so it can never mix into real client records.

import { DATA_TABS, dataTab, type DataTabName } from '../config/schema';
import { isoToDate } from '../lib/rows';
import { appendRecords, lastIdRow } from './records';

type Rec = Record<string, unknown>;
type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

export function loadTestData(ss: Spreadsheet): { ok: boolean; message: string } {
  const missing = DATA_TABS.filter((t) => !ss.getSheetByName(t.name));
  if (missing.length) return { ok: false, message: 'Run "Set up workbook" first.' };
  if (lastIdRow(ss.getSheetByName('Clients')!, dataTab('Clients')) > 1) {
    return {
      ok: false,
      message: 'Clients already has data. Test data only loads into an empty workbook.',
    };
  }
  const append = (tabName: DataTabName, records: Rec[]) => appendRecords(ss, tabName, records);

  const d = isoToDate;
  const year = new Date().getFullYear();

  const [alpha, bravo, charlie] = append('Clients', [
    {
      firstName: 'Test',
      lastName: 'Alpha',
      phone: '(555) 010-0001',
      email: 'alpha@example.com',
      street: '1 Test St',
      city: 'Tulsa',
      state: 'OK',
      zip: '74103',
      county: 'Tulsa',
      birthday: d('1956-03-14'),
      smoker: 'Non-smoker',
      height: `5'10"`,
      weightLbs: 200,
      healthConditions: 'Test condition',
      existingCoverage: '10k American Amicable',
      medicarePlan: 'None',
      notes: 'FAKE TEST RECORD',
    },
    {
      // Saved without a birth year: the phone filled in the current year.
      firstName: 'Test',
      lastName: 'Bravo',
      phone: '(555) 010-0002',
      city: 'Norman',
      state: 'OK',
      zip: '73069',
      county: 'Cleveland',
      birthday: new Date(year, 11, 31),
      smoker: 'Smoker',
      notes: 'FAKE TEST RECORD: birthday without year',
    },
    {
      firstName: 'Test',
      lastName: 'Charlie',
      phone: '(555) 010-0003',
      city: 'Oklahoma City',
      state: 'OK',
      zip: '73102',
      county: 'Oklahoma',
      birthday: d('1950-07-04'),
      smoker: 'Non-smoker',
      medicarePlan: 'Advantage',
      medicareId: 'TEST-MBI-0000',
      notes: 'FAKE TEST RECORD',
    },
  ]).map((r) => r.clientId);

  const [levelPolicy] = append('Policies', [
    {
      clientId: alpha,
      carrier: 'Mutual of Omaha',
      productType: 'Final expense - Level',
      policyNumber: 'TEST-0001',
      faceAmount: 15000,
      premium: 120,
      paymentMode: 'Monthly',
      applicationDate: d('2026-10-15'),
      issueDate: d('2026-11-03'),
      effectiveDate: d('2026-11-03'),
      status: 'Paid as issued',
    },
    {
      clientId: alpha,
      carrier: 'American Amicable',
      productType: 'Final expense - Graded',
      policyNumber: 'TEST-0002',
      faceAmount: 10000,
      premium: 540,
      paymentMode: 'Annual',
      applicationDate: d('2025-09-01'),
      issueDate: d('2025-09-10'),
      effectiveDate: d('2025-09-15'),
      status: 'Lapsed',
    },
    {
      clientId: charlie,
      carrier: 'Devoted Health',
      productType: 'Medicare Advantage',
      policyNumber: 'TEST-0003',
      premium: 0,
      paymentMode: 'Monthly',
      applicationDate: d('2026-10-01'),
      status: 'Pending',
    },
  ]).map((r) => r.policyId);

  append('Beneficiaries', [
    {
      policyId: levelPolicy,
      name: 'Test Son',
      relationship: 'Son',
      share: 0.5,
      phone: '(555) 010-0101',
    },
    {
      policyId: levelPolicy,
      name: 'Test Daughter',
      relationship: 'Daughter',
      share: 0.5,
      phone: '(555) 010-0102',
    },
  ]);

  append('Leads', [
    {
      dateReceived: d('2026-10-10'),
      leadType: 'Yes lead',
      firstName: 'Test',
      lastName: 'Alpha',
      contacted: true,
      appointmentSet: true,
      applicationWritten: true,
      clientId: alpha,
    },
    {
      dateReceived: d('2026-10-12'),
      leadType: 'Survey lead',
      firstName: 'Test',
      lastName: 'Bravo',
      contacted: true,
      clientId: bravo,
    },
    {
      dateReceived: d('2026-10-15'),
      leadType: 'Referral',
      firstName: 'Test',
      lastName: 'Sister',
      referredBy: alpha,
      notes: 'Wants policy for sister',
    },
    {
      dateReceived: d('2026-10-18'),
      leadType: 'Mail-in lead',
      firstName: 'Test',
      lastName: 'Delta',
    },
  ]);

  return {
    ok: true,
    message: 'Test data loaded: 3 clients, 3 policies, 2 beneficiaries, 4 leads.',
  };
}
