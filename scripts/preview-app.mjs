// Screenshots the phone app (dist/App.html) at iPhone size with a fake
// google.script.run, so the screens can be checked without deploying.
// Usage: node scripts/preview-app.mjs [outDir]   (default .preview/, git-ignored)
// Needs Chrome or Edge. Run `npm run build` first.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = path.resolve(process.argv[2] ?? '.preview');
const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
];
const browser = BROWSERS.find((b) => existsSync(b));
if (!browser) throw new Error('Chrome or Edge not found');

const lists = {
  LeadTypes: ['Yes lead', 'Survey lead', 'Mail-in lead', 'Referral'],
  States: ['OK'],
  Counties: ['Cleveland', 'Oklahoma', 'Tulsa'],
  Smoker: ['Non-smoker', 'Smoker'],
  MedicarePlanTypes: ['None', 'Advantage', 'Supplement', 'Part D'],
  Carriers: ['American Amicable', 'Mutual of Omaha', 'Transamerica'],
  ProductTypes: ['Final expense - Level', 'Final expense - Graded'],
  PaymentModes: ['Monthly', 'Quarterly', 'Semi-annual', 'Annual'],
  PolicyStatuses: ['Pending', 'Paid as issued'],
  ExpenseCategories: ['Gas', 'Leads', 'Food', 'Misc'],
  PaymentMethods: ['Debit card', 'Credit card', 'Cash'],
  HoursActivities: ['Dialing', 'Appointments', 'Travel'],
  BeneficiaryTypes: ['Primary', 'Contingent'],
};
const idle = {
  build: 'preview',
  today: '2026-10-22',
  lists,
  clients: [{ id: 'CL-0001', label: 'Test Alpha (CL-0001)' }],
  openLeads: [
    {
      id: 'LD-0004',
      label: 'Test Delta · Mail-in lead · 2026-10-18',
      fill: { firstName: 'Test', lastName: 'Delta', phone: '(555) 010-0004', referredBy: '' },
    },
  ],
  shift: null,
  trip: null,
};
const now = Date.now();
const running = {
  ...idle,
  shift: {
    shiftId: 'HR-0001',
    start: now - 3.5 * 3600e3,
    breakMinutes: 15,
    onBreakSince: now - 10 * 60e3,
  },
  trip: { tripId: 'MI-0001', startOdometer: 45210, purpose: 'Appointments' },
};

// What the screenshot reader returns for the client's Test Client 3 (fake data).
const draft = {
  client: {
    firstName: 'Test',
    lastName: 'Client 3',
    phone: '(405) 345-6789',
    email: 'testemail3@email.com',
    street: '345 Test Street',
    city: 'Test City',
    state: 'OK',
    zip: '73222',
    birthday: '1951-12-21',
    height: `6'5"`,
    weightLbs: '280',
    smoker: 'Smoker',
    existingCoverage: 'Has 5k policy w AmAm from 02; Had 10k with MOO lapsed',
    referredBy: 'CL-0001',
    notes: 'Met 11/11/2026',
  },
  policy: {
    carrier: 'Transamerica',
    productType: 'Final expense - Graded',
    faceAmount: '15000',
    premium: '220',
    paymentMode: 'Monthly',
    issueDate: '2026-11-03',
    draftDay: '4th Wed',
    policyNumber: 'GTL7343456',
    applicationDate: '2026-10-11',
    status: 'Pending',
  },
  beneficiaries: [
    { name: 'Test Husband 3', relationship: 'Husband', kind: 'Primary', phone: '(405) 345-6788' },
    { name: 'Test son 3', relationship: 'Son', kind: 'Contingent', phone: '40534566666' },
  ],
  leadId: '',
  warnings: ['Phone for Test son 3 (40534566666) is not 10 digits'],
  unread: ['Diabetic w neuropathy 2 stents 04', 'Right leg amputated 2010'],
  removed: 17,
};

// Reminders and a just-saved monthly Excel copy (fake data).
const house = {
  ok: true,
  reminders: [
    { kind: 'atRisk', date: '2026-10-22', ref: 'PO-0002', text: 'Insufficient funds: Test Alpha (Transamerica). Call to fix the payment (drafts 3rd)' },
    { kind: 'draft', date: '2026-10-20', ref: 'PO-0003', text: 'First draft for Test Bravo (Mutual of Omaha) was due 10/20: check it went through, then update the status' },
    { kind: 'lead', date: '2026-10-19', ref: 'LD-0004', text: 'Test Delta (Mail-in lead) came in 3 days ago, not contacted yet' },
    { kind: 'birthday', date: '2026-10-24', ref: 'CL-0001', text: 'Test Alpha turns 70 on Sat 10/24' },
  ],
  exported: { id: 'x', name: 'Agent Tracker 2026-10-22.xlsx', link: '#' },
}; // prettier-ignore

// Each scenario: the boot data, what the fake server answers, and clicks to make after load.
const scenarios = {
  'home-idle': { boot: idle, height: 1000 },
  'home-running': { boot: running, height: 760 },
  'new-client': {
    boot: idle,
    height: 2300,
    steps: ["click('.tile:nth-child(1)')", "check('.check input')"],
  },
  'client-errors': {
    boot: idle,
    height: 1100,
    save: {
      ok: false,
      errors: { lastName: 'Last name is required', 'policy.carrier': 'Carrier is required' },
    },
    steps: ["click('.tile:nth-child(1)')", "check('.check input')", "click('.primary.wide')"],
  },
  'new-lead': { boot: idle, height: 900, steps: ["click('.tile:nth-child(3)')"] },
  expense: { boot: idle, height: 900, steps: ["click('.tile:nth-child(4)')"] },
  screenshots: {
    boot: idle,
    height: 700,
    steps: ["click('.tile:nth-child(2)')", "pickImage('input[type=file]')"],
  },
  'check-contact': {
    boot: idle,
    height: 3600,
    save: { ok: true, draft },
    steps: [
      "click('.tile:nth-child(2)')",
      "pickImage('input[type=file]')",
      "click('.primary.wide')",
      "document.querySelector('details').open = true",
    ],
  },
  saved: {
    boot: idle,
    height: 760,
    save: { ok: true, message: 'Lead LD-0005 saved', boot: idle },
    steps: [
      "click('.tile:nth-child(3)')",
      "fill('[name=firstName]', 'Test')",
      "click('.primary.wide')",
    ],
  },
};

const app = await readFile('dist/App.html', 'utf8');
await mkdir(outDir, { recursive: true });

for (const [name, s] of Object.entries(scenarios)) {
  const stub = `<script>
    const BOOT = ${JSON.stringify(s.boot)};
    const SAVE = ${JSON.stringify(s.save ?? { ok: true, message: 'Saved', boot: s.boot })};
    const HOUSE = ${JSON.stringify(s.house ?? house)};
    function runner() {
      let ok = () => {};
      const r = new Proxy({}, { get: (_, k) =>
        k === 'withSuccessHandler' ? (f) => ((ok = f), r)
        : k === 'withFailureHandler' ? () => r
        : () => setTimeout(() => ok(k === 'appBoot' ? BOOT : k === 'appHousekeeping' ? HOUSE : SAVE), 20) });
      return r;
    }
    window.google = { script: { get run() { return runner(); } } };
    const click = (q) => document.querySelector(q).click();
    const check = (q) => { const el = document.querySelector(q); el.checked = true; el.dispatchEvent(new Event('change')); };
    const fill = (q, v) => { document.querySelector(q).value = v; };
    // A picked file: a small grey PNG (file inputs cannot be filled any other way).
    const pickImage = (q) => {
      const c = document.createElement('canvas'); c.width = 90; c.height = 195;
      const g = c.getContext('2d'); g.fillStyle = '#777'; g.fillRect(0, 0, 90, 195);
      const bytes = atob(c.toDataURL('image/png').split(',')[1]);
      const file = new File([Uint8Array.from(bytes, (ch) => ch.charCodeAt(0))], 'shot.png', { type: 'image/png' });
      const dt = new DataTransfer(); dt.items.add(file);
      const input = document.querySelector(q); input.files = dt.files;
      input.dispatchEvent(new Event('change'));
    };
    const steps = [${(s.steps ?? []).map((st) => `() => ${st}`).join(',')}];
    window.addEventListener('load', () => steps.forEach((f, i) => setTimeout(f, 200 * (i + 1))));
  </script>`;
  const file = path.join(outDir, `${name}.html`);
  await writeFile(file, app.replace('<body>', `<body>${stub}`));
  // Headless Chrome will not make a window narrower than ~500px, so the app is
  // shown in a 390px frame (iPhone width) inside a wider page.
  const frame = path.join(outDir, `${name}.frame.html`);
  await writeFile(
    frame,
    `<!doctype html><body style="margin:0;background:#888">` +
      `<iframe src="${name}.html" style="border:0;width:390px;height:${s.height}px;display:block"></iframe>`,
  );
  const png = path.join(outDir, `${name}.png`);
  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=520,${s.height}`,
      '--virtual-time-budget=3000',
      `--screenshot=${png}`,
      '--allow-file-access-from-files',
      pathToFileURL(frame).href,
    ],
    { stdio: 'ignore' },
  );
  console.log(`${name}: ${png}`);
}
