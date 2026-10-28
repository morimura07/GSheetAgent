// Phase 4 integration tests: reading contact screenshots. Uses the client's
// made-up test screenshots (samples/, built in as SampleImages.html) with real
// Drive OCR; without them the OCR cases say so and the rest still run.
// Cases run in order and share one freshly reset spreadsheet.

import {
  FormError,
  draftFromText,
  readContactScreenshots,
  saveClient,
  saveLead,
} from '../app/service';
import type { ContactDraft } from '../app/forms';
import { columnNumber, dataTab, type DataTabName } from '../config/schema';
import { ocrImage, ocrLeftovers } from '../sheets/ocr';
import { readRecords } from '../sheets/records';
import { setupWorkbook } from '../sheets/setup';
import { eq, ok, stopwatch, type TestCase } from './harness';
import { sampleImages, type SampleImage } from './samples';

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

const rows = (ss: Spreadsheet, tab: DataTabName) => readRecords(ss, tab).map((r) => r.rec);

// The sample files of each test contact (WhatsApp names, in samples/).
const CONTACTS: Record<string, string[]> = {
  'Test Client 1': ['at 1.20.44 AM.jpeg', 'at 1.20.44 AM (1).jpeg'],
  'Test Client 2': ['at 1.20.44 AM (2).jpeg'],
  'Test Client 3': ['at 1.20.44 AM (3).jpeg', 'at 1.20.44 AM (4).jpeg', 'at 1.20.45 AM.jpeg'],
};

// Private values in the samples. None may come back from the reader or reach the sheet.
const PRIVATE = [
  '123456789', '345678913', 'R0123456789', '1234.5678', '3456.7898', '6543.3456', '34534534567',
  '34554334565', 'Tfcu', 'Midfirst', '10.10.31', '12.20.33',
]; // prettier-ignore

/** OCR text per sample file, filled by the first OCR case. */
const ocrText = new Map<string, string>();
const drafts: Record<string, ContactDraft> = {};

function images(contact: string): SampleImage[] {
  const all = sampleImages();
  return CONTACTS[contact].map((suffix) => {
    const img = all.find((i) => i.name.endsWith(suffix));
    if (!img) throw new Error(`Sample screenshot "${suffix}" missing from samples/`);
    return img;
  });
}

function formErrors(fn: () => unknown): Record<string, string> {
  try {
    fn();
  } catch (err) {
    if (err instanceof FormError) return err.errors;
    throw err;
  }
  throw new Error('expected a form error, but it saved');
}

function noPrivateData(value: unknown, label: string): void {
  const json = JSON.stringify(value);
  for (const p of PRIVATE) ok(!json.includes(p), `${label} contains private value ${p}`);
}

/** The draft as the app would send it back on Save. */
function asSaved(d: ContactDraft) {
  return { client: d.client, policy: d.policy, beneficiaries: d.beneficiaries, leadId: d.leadId };
}

const NO_SAMPLES = 'samples/ not built in: OCR not tested';

export const PHASE4_CASES: TestCase[] = [
  {
    name: 'setup: Draft day and beneficiary Type columns, no health column',
    run: (ss) => {
      const t = stopwatch();
      setupWorkbook(ss, t.lap);
      const headers = (name: DataTabName) =>
        ss
          .getSheetByName(name)!
          .getRange(1, 1, 1, dataTab(name).columns.length)
          .getDisplayValues()[0];
      ok(headers('Policies').includes('Draft day'), 'Policies has Draft day');
      ok(headers('Beneficiaries').includes('Type'), 'Beneficiaries has Type');
      ok(!headers('Clients').includes('Health conditions'), 'Clients has no Health conditions');
      const kind = ss
        .getSheetByName('Beneficiaries')!
        .getRange(2, columnNumber(dataTab('Beneficiaries'), 'kind'))
        .getDataValidation();
      ok(kind, 'beneficiary Type has a dropdown');
      return t.summary();
    },
  },
  {
    name: 'Drive reads every sample screenshot and keeps nothing',
    run: () => {
      const samples = sampleImages();
      if (!samples.length) return NO_SAMPLES;
      const before = ocrLeftovers();
      const t = stopwatch();
      for (const s of samples) {
        ocrText.set(s.name, ocrImage(s.base64, s.mimeType));
        t.lap(s.name.replace(/^WhatsApp Image 2026-10-22 at /, ''));
      }
      for (const [name, text] of ocrText) ok(/Test|Ben|Met/.test(text), `${name}: no text read`);
      eq(ocrLeftovers(), before, 'OCR Docs left in Drive (trash included)');
      return t.summary();
    },
  },
  {
    name: 'Test Client 1 read from two screenshots',
    run: (ss) => {
      if (!ocrText.size) return NO_SAMPLES;
      const d = draftFromText(
        ss,
        images('Test Client 1').map((i) => ocrText.get(i.name)!),
      );
      drafts['Test Client 1'] = d;
      eq(
        [d.client.firstName, d.client.lastName, d.client.phone, d.client.email, d.client.zip],
        ['Test', 'Client 1', '(405) 123-4567', 'testemail1@email.com', '73111'],
        'contact card',
      );
      eq(
        [d.client.height, d.client.weightLbs, d.client.smoker],
        [`5'6"`, '150', 'Non-smoker'],
        'notes',
      );
      eq(
        [d.policy?.carrier, d.policy?.faceAmount, d.policy?.premium, d.policy?.paymentMode],
        ['Combined Insurance', '10000', '110', 'Monthly'],
        'policy',
      );
      eq([d.policy?.draftDay, d.policy?.policyNumber], ['4th Wed', 'G77788888'], 'draft day, #');
      eq(
        d.beneficiaries.map((b) => `${b.relationship} ${b.share}%`),
        ['Son 34%', 'Daughter 33%', 'Nephew 33%'],
        'beneficiaries',
      );
      ok(d.removed >= 8, `private lines removed: ${d.removed}`);
      noPrivateData(d, 'draft');
    },
  },
  {
    name: 'Test Client 1 saved: policy with draft day, three beneficiaries',
    run: (ss) => {
      const d = drafts['Test Client 1'];
      if (!d) return NO_SAMPLES;
      const message = saveClient(ss, asSaved(d));
      ok(/Client CL-0001 saved, policy PO-0001, 3 beneficiaries/.test(message), message);
      const [policy] = rows(ss, 'Policies');
      eq([policy.draftDay, policy.premium, policy.monthlyPremium], ['4th Wed', 110, 110], 'policy');
      const bens = rows(ss, 'Beneficiaries');
      eq(
        bens.map((b) => [b.name, b.kind, b.share, b.policyShareTotal]),
        [
          ['Test son 1', 'Primary', 0.34, 1],
          ['Test daughter 1', 'Primary', 0.33, 1],
          ['Test nephew 1', 'Primary', 0.33, 1],
        ],
        'beneficiaries',
      );
    },
  },
  {
    name: 'Test Client 2 read end to end (OCR included); matched to its lead',
    run: (ss) => {
      if (!sampleImages().length) return NO_SAMPLES;
      saveLead(ss, {
        dateReceived: '2026-10-01',
        leadType: 'Yes lead',
        firstName: 'Test',
        lastName: 'Client 2',
        phone: '405-234-5678',
      });
      const t = stopwatch();
      const d = readContactScreenshots(ss, images('Test Client 2'));
      t.lap('read');
      eq(
        [d.client.medicareId, d.client.medicarePlan, d.policy?.carrier],
        ['2345678987', 'MAPD', 'Devoted Health'],
        'Medicare',
      );
      eq(d.leadId, 'LD-0001', 'open lead with the same phone');
      eq(
        d.beneficiaries,
        [{ name: 'Test Client 1', relationship: 'Parent', kind: 'Primary' }],
        'linked contact',
      );
      ok(
        d.warnings.some((w) => /no year/.test(w)),
        'birthday without a year is flagged',
      );
      return t.summary();
    },
  },
  {
    name: 'Test Client 3 read from three screenshots; referral found; form flags what is wrong',
    run: (ss) => {
      if (!ocrText.size) return NO_SAMPLES;
      const texts = images('Test Client 3').map((i) => ocrText.get(i.name)!);
      const d = draftFromText(ss, [texts[2], texts[0], texts[1]]); // any order
      eq(d.client.referredBy, 'CL-0001', 'referred by Test Client 1');
      eq(d.client.birthday, '1951-12-21', 'birthday');
      eq(
        [d.policy?.carrier, d.policy?.policyNumber, d.policy?.premium],
        ['Guarantee Trust Life', 'GTL7343456', '220'],
        'policy',
      );
      eq(
        d.beneficiaries.map((b) => `${b.name} ${b.kind}`),
        [
          'Test Client 2 Primary',
          'Test Husband 3 Primary',
          'Test Daughter 3 Primary',
          'Test son 3 Contingent',
        ],
        'beneficiaries',
      );
      noPrivateData(d, 'draft');
      eq(d.beneficiaries[3].phone, '40534566666', 'contingent phone as written (11 digits)');

      // Saved as read: the 11-digit phone in the notes is flagged, nothing is written.
      const errors = formErrors(() => saveClient(ss, asSaved(d)));
      ok(errors['ben.3.phone'], `11-digit phone flagged: ${JSON.stringify(errors)}`);
      eq(rows(ss, 'Clients').length, 1, 'nothing written');

      const fixed = asSaved(d);
      fixed.beneficiaries[3].phone = '405-345-6666';
      fixed.policy!.applicationDate = '2026-10-20'; // "Met 11.11.26" is after today
      saveClient(ss, fixed);
      eq(rows(ss, 'Beneficiaries').length, 7, 'beneficiaries saved');
    },
  },
  {
    name: 'beneficiary checks: share, policy needed',
    run: (ss) => {
      const client = { firstName: 'Test', lastName: 'Bens' };
      const policy = { carrier: 'Mutual of Omaha', paymentMode: 'Monthly', status: 'Pending' };
      const errors = formErrors(() =>
        saveClient(ss, {
          client,
          policy,
          beneficiaries: [
            { name: '', share: '150' },
            { name: 'Test Ok', kind: 'Spouse' },
          ],
        }),
      );
      eq(Object.keys(errors).sort(), ['ben.0.name', 'ben.0.share', 'ben.1.kind'], 'field errors');
      const noPolicy = formErrors(() =>
        saveClient(ss, { client, policy: null, beneficiaries: [{ name: 'Test Ok' }] }),
      );
      ok(noPolicy.beneficiaries, 'beneficiaries without a policy are refused');
    },
  },
  {
    name: 'no private value from the screenshots is anywhere in the workbook',
    run: (ss) => {
      for (const sheet of ss.getSheets()) {
        const values = sheet.getDataRange().getDisplayValues();
        noPrivateData(values, sheet.getName());
      }
    },
  },
  {
    name: 'bad screenshot uploads are refused',
    run: (ss) => {
      const refuse = (fn: () => unknown, pattern: RegExp) => {
        try {
          fn();
        } catch (err) {
          ok(pattern.test((err as Error).message), (err as Error).message);
          return;
        }
        throw new Error(`accepted: ${pattern}`);
      };
      refuse(() => readContactScreenshots(ss, []), /at least one/);
      refuse(
        () => readContactScreenshots(ss, [{ base64: 'AA==', mimeType: 'text/html' }]),
        /JPEG or PNG/,
      );
      refuse(
        () => readContactScreenshots(ss, Array(7).fill({ base64: 'AA==', mimeType: 'image/png' })),
        /up to 6/,
      );
    },
  },
];
