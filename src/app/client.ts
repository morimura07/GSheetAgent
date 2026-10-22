// Phone app (runs in the browser). Bundled into dist/App.html by build.mjs.
// Talks to the server only through google.script.run (functions in src/index.ts).

import { initialValues, type FieldSpec } from '../lib/forms';
import { REMINDER_LABELS, type Reminder } from '../lib/reminders';
import {
  BENEFICIARY_FORM,
  CLIENT_FORM,
  CLIENT_LEAD_FIELD,
  CLOCK_IN_FORM,
  EXPENSE_FORM,
  LEAD_FORM,
  POLICY_FORM,
  TRIP_END_FORM,
  TRIP_FORM,
  TRIP_START_FORM,
  type ApiResult,
  type Boot,
  type ContactDraft,
  type HousekeepingResult,
  type Option,
  type ReadResult,
  type ReceiptUpload,
} from './forms';

interface Runner {
  withSuccessHandler(fn: (value: unknown) => void): Runner;
  withFailureHandler(fn: (err: Error) => void): Runner;
}
declare const google: { script: { run: Runner } };

/** google.script.run as a promise. */
function call<T>(fn: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const runner = google.script.run
      .withSuccessHandler((v) => resolve(v as T))
      .withFailureHandler(reject) as unknown as Record<string, (...a: unknown[]) => void>;
    runner[fn](...args);
  });
}

let boot: Boot;
const root = document.getElementById('app')!;

// ---- Tiny DOM helpers ------------------------------------------------------

type Attrs = Record<string, string | boolean | ((e: Event) => void)>;

function h(
  tag: string,
  attrs: Attrs = {},
  ...children: (Node | string | null | false)[]
): HTMLElement {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, ''), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false) el.setAttribute(k, v);
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

function toast(message: string, isError = false): void {
  const el = h('div', { class: `toast${isError ? ' error' : ''}`, role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), isError ? 6000 : 3500);
}

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// ---- Forms -----------------------------------------------------------------

function control(spec: FieldSpec, name: string, value: string): HTMLElement {
  const base: Attrs = { name, id: name };
  const select = (options: Option[]) =>
    h(
      'select',
      base,
      h('option', { value: '' }, ''),
      ...options.map((o) => h('option', { value: o.id, selected: o.id === value }, o.label)),
    );
  switch (spec.kind) {
    case 'list':
      return select((boot.lists[spec.list!] ?? []).map((v) => ({ id: v, label: v })));
    case 'client':
      return select(boot.clients);
    case 'lead':
      return select(boot.openLeads);
    case 'longtext':
      return h('textarea', { ...base, rows: '3' }, value);
    case 'date':
      return h('input', { ...base, type: 'date', value });
    case 'phone':
      return h('input', { ...base, type: 'tel', autocomplete: 'off', value });
    case 'email':
      return h('input', { ...base, type: 'email', autocapitalize: 'off', value });
    case 'money':
    case 'number':
      return h('input', { ...base, type: 'text', inputmode: 'decimal', value });
    default:
      return h('input', { ...base, type: 'text', value });
  }
}

function fields(
  specs: FieldSpec[],
  prefix = '',
  values = initialValues(specs, boot.today),
): HTMLElement {
  return h(
    'div',
    { class: 'fields' },
    ...specs.map((s) =>
      h(
        'label',
        { class: 'field' },
        h('span', {}, s.label + (s.required ? ' *' : '')),
        control(s, prefix + s.key, values[s.key] ?? ''),
        h('small', { class: 'err', 'data-err': prefix + s.key }),
      ),
    ),
  );
}

function collect(form: HTMLElement, specs: FieldSpec[], prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of specs) {
    const el = form.querySelector<HTMLInputElement>(`[name="${prefix + s.key}"]`);
    if (el) out[s.key] = el.value;
  }
  return out;
}

function showErrors(form: HTMLElement, errors: Record<string, string> = {}): void {
  form.querySelectorAll<HTMLElement>('[data-err]').forEach((el) => {
    el.textContent = errors[el.dataset.err!] ?? '';
    el.parentElement!.classList.toggle('invalid', Boolean(errors[el.dataset.err!]));
  });
  const first = form.querySelector('.invalid');
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Runs a save; on success refreshes state and goes home, otherwise shows the errors. */
async function submit(form: HTMLElement, button: HTMLButtonElement, run: () => Promise<ApiResult>) {
  if (button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const result = await run();
    if (result.ok) {
      boot = result.boot;
      toast(result.message);
      home();
      return;
    }
    showErrors(form, result.errors);
    if (result.error) toast(result.error, true);
    else toast('Please fix the highlighted fields', true);
  } catch (err) {
    toast(`Could not save: ${(err as Error).message}`, true);
  }
  button.disabled = false;
  button.textContent = label;
}

function page(title: string, ...body: HTMLElement[]): HTMLElement {
  const form = h('form', { class: 'page', novalidate: true, onsubmit: (e) => e.preventDefault() });
  form.append(
    h(
      'header',
      {},
      h('button', { type: 'button', class: 'back', onclick: home }, '‹ Back'),
      h('h1', {}, title),
    ),
    ...body,
  );
  root.replaceChildren(form);
  window.scrollTo(0, 0);
  return form;
}

function saveButton(text: string, onClick: (b: HTMLButtonElement) => void): HTMLButtonElement {
  const b = h('button', { type: 'submit', class: 'primary wide' }, text) as HTMLButtonElement;
  b.addEventListener('click', () => onClick(b));
  return b;
}

// ---- Screens ---------------------------------------------------------------

let ticker: number | undefined;

function home(): void {
  window.clearInterval(ticker);
  let hours = hoursCard();
  const card = h(
    'div',
    { class: 'page' },
    h('header', {}, h('h1', {}, 'Agent Tracker')),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'tile', onclick: () => newClient() }, 'New client'),
      h('button', { class: 'tile', onclick: readScreenshots }, 'Client from screenshots'),
      h('button', { class: 'tile', onclick: newLead }, 'New lead'),
      h('button', { class: 'tile', onclick: newExpense }, 'Add expense'),
    ),
    remindersCard(),
    hours,
    mileageCard(),
    h(
      'footer',
      {},
      h('button', { class: 'link', onclick: () => void reload() }, 'Refresh'),
      h('span', {}, `Build ${boot.build}`),
    ),
  );
  root.replaceChildren(card);
  // Keep "hours worked" current; only the hours card is redrawn (it has no inputs while clocked in).
  if (boot.shift) {
    ticker = window.setInterval(() => {
      const fresh = hoursCard();
      hours.replaceWith(fresh);
      hours = fresh;
    }, 60_000);
  }
}

// Last answer, shown straight away while a fresh one loads (the home screen is
// redrawn after every save).
let lastHousekeeping: HousekeepingResult | undefined;

const SHOWN_REMINDERS = 6;

/** Reminders (and the monthly Excel copy) load after the home screen is shown. */
function remindersCard(): HTMLElement {
  const card = h('section', { class: 'card' }, h('h2', {}, 'Reminders'));
  const fill = (result: HousekeepingResult | undefined, loading: boolean) => {
    card.replaceChildren(h('h2', {}, 'Reminders'));
    if (!result) {
      card.append(h('p', { class: 'status' }, loading ? 'Checking…' : ''));
      return;
    }
    if (!result.ok) {
      card.append(h('p', { class: 'status error' }, `Could not load: ${result.error}`));
      return;
    }
    const item = (r: Reminder) =>
      h('li', { class: r.kind }, h('strong', {}, `${REMINDER_LABELS[r.kind]} `), r.text);
    const list = result.reminders;
    if (!list.length) card.append(h('p', { class: 'status' }, 'Nothing needs attention today.'));
    else card.append(h('ul', { class: 'reminders' }, ...list.slice(0, SHOWN_REMINDERS).map(item)));
    if (list.length > SHOWN_REMINDERS) {
      card.append(
        h(
          'details',
          {},
          h('summary', {}, `${list.length - SHOWN_REMINDERS} more`),
          h('ul', { class: 'reminders' }, ...list.slice(SHOWN_REMINDERS).map(item)),
        ),
      );
    }
    if (result.assistant) card.append(h('p', { class: 'status' }, result.assistant));
    if (result.exported) {
      card.append(
        h(
          'p',
          { class: 'status' },
          "This month's Excel copy was saved to Drive: ",
          h('a', { href: result.exported.link, target: '_blank' }, result.exported.name),
        ),
      );
    }
  };
  fill(lastHousekeeping, true);
  call<HousekeepingResult>('appHousekeeping')
    .then((result) => {
      // A copy made, or a sync done, once is not news on the next redraw.
      lastHousekeeping = result.ok ? { ...result, exported: null, assistant: null } : result;
      fill(result, false);
    })
    .catch((err: Error) => fill({ ok: false, error: err.message }, false));
  return card;
}

function hoursCard(): HTMLElement {
  const s = boot.shift;
  const card = h('section', { class: 'card' }, h('h2', {}, 'Hours'));
  const act =
    (action: string, input: Record<string, string> = {}) =>
    (b: HTMLButtonElement) =>
      submit(card, b, () => call<ApiResult>('appShift', action, input));

  if (!s) {
    card.append(h('p', { class: 'status' }, 'Not clocked in'), fields(CLOCK_IN_FORM, 'shift.'));
    card.append(
      saveButton('Clock in', (b) => act('clockIn', collect(card, CLOCK_IN_FORM, 'shift.'))(b)),
    );
    return card;
  }
  const breakNow = s.onBreakSince === null ? 0 : Math.round((Date.now() - s.onBreakSince) / 60000);
  const worked = Math.max(0, (Date.now() - s.start) / 3600000 - (s.breakMinutes + breakNow) / 60);
  card.append(
    h(
      'p',
      { class: 'status on' },
      `Clocked in at ${time(s.start)} · ${worked.toFixed(2)} h worked`,
      h('br'),
      s.onBreakSince === null
        ? `Breaks: ${s.breakMinutes} min`
        : `On break since ${time(s.onBreakSince)} (${s.breakMinutes + breakNow} min total)`,
    ),
    h(
      'div',
      { class: 'row' },
      s.onBreakSince === null
        ? saveButton('Start break', act('startBreak'))
        : saveButton('End break', act('endBreak')),
      saveButton('Clock out', act('clockOut')),
    ),
  );
  return card;
}

function mileageCard(): HTMLElement {
  const t = boot.trip;
  const card = h('section', { class: 'card' }, h('h2', {}, 'Mileage'));
  if (!t) {
    card.append(
      h('p', { class: 'status' }, 'No trip running'),
      fields(TRIP_START_FORM, 'trip.'),
      saveButton('Start trip', (b) =>
        submit(card, b, () =>
          call<ApiResult>('appTrip', 'start', collect(card, TRIP_START_FORM, 'trip.')),
        ),
      ),
      h('button', { class: 'link', onclick: pastTrip }, 'Add a past trip'),
    );
    return card;
  }
  card.append(
    h(
      'p',
      { class: 'status on' },
      `Trip started at ${t.startOdometer.toLocaleString()} mi${t.purpose ? ` · ${t.purpose}` : ''}`,
    ),
    fields(TRIP_END_FORM, 'trip.'),
    saveButton('End trip', (b) =>
      submit(card, b, () =>
        call<ApiResult>('appTrip', 'end', collect(card, TRIP_END_FORM, 'trip.')),
      ),
    ),
  );
  return card;
}

function pastTrip(): void {
  const form = page('Past trip', fields(TRIP_FORM));
  form.append(
    saveButton('Save trip', (b) =>
      submit(form, b, () => call('appTrip', 'full', collect(form, TRIP_FORM))),
    ),
  );
}

function newLead(): void {
  const form = page('New lead', fields(LEAD_FORM));
  form.append(
    saveButton('Save lead', (b) =>
      submit(form, b, () => call('appSaveLead', collect(form, LEAD_FORM))),
    ),
  );
}

function newClient(draft?: ContactDraft): void {
  const policy = h(
    'div',
    { class: `card${draft?.policy ? '' : ' hidden'}` },
    h('h2', {}, 'Policy'),
    fields(POLICY_FORM, 'policy.', { ...initialValues(POLICY_FORM, boot.today), ...draft?.policy }),
  );
  const bens = beneficiaryEditor(draft?.beneficiaries ?? []);
  policy.append(h('h2', { class: 'sub' }, 'Beneficiaries'), bens.el);
  const hasPolicy = h('input', {
    type: 'checkbox',
    checked: Boolean(draft?.policy),
  }) as HTMLInputElement;
  hasPolicy.addEventListener('change', () => policy.classList.toggle('hidden', !hasPolicy.checked));

  const clientFields = fields(CLIENT_FORM, '', {
    ...initialValues(CLIENT_FORM, boot.today),
    ...draft?.client,
  });
  const leadPicker = boot.openLeads.length
    ? fields([CLIENT_LEAD_FIELD], '', { leadId: draft?.leadId ?? '' })
    : null;
  leadPicker?.querySelector('select')!.addEventListener('change', (e) => {
    const lead = boot.openLeads.find((l) => l.id === (e.target as HTMLSelectElement).value);
    for (const [key, value] of Object.entries(lead?.fill ?? {})) {
      const el = clientFields.querySelector<HTMLInputElement>(`[name="${key}"]`);
      if (el && !el.value && value) el.value = value;
    }
  });

  const form = page(
    draft ? 'Check contact' : 'New client',
    ...(draft ? [draftNotice(draft)] : []),
    ...(leadPicker ? [leadPicker] : []),
    clientFields,
    h('label', { class: 'check' }, hasPolicy, ' Add a policy (application written)'),
    policy,
  );
  form.append(
    saveButton('Save client', (b) =>
      submit(form, b, () =>
        call('appSaveClient', {
          client: collect(form, CLIENT_FORM),
          policy: hasPolicy.checked ? collect(form, POLICY_FORM, 'policy.') : null,
          beneficiaries: hasPolicy.checked ? bens.read() : [],
          leadId: leadPicker ? collect(form, [CLIENT_LEAD_FIELD]).leadId : '',
        }),
      ),
    ),
  );
}

/** What the reader wants checked, and what it left out. */
function draftNotice(draft: ContactDraft): HTMLElement {
  const box = h('section', { class: 'card notice' }, h('h2', {}, 'Check before saving'));
  if (draft.warnings.length) {
    box.append(h('ul', {}, ...draft.warnings.map((w) => h('li', {}, w))));
  } else {
    box.append(h('p', {}, 'Read from the screenshots. Check the fields, then tap Save.'));
  }
  if (draft.removed) {
    const lines = `${draft.removed} line${draft.removed === 1 ? '' : 's'}`;
    box.append(
      h('p', { class: 'status' }, `${lines} with SSN, card, bank or license numbers left out.`),
    );
  }
  if (draft.unread.length) {
    box.append(
      h(
        'details',
        {},
        h('summary', {}, `Not saved from the notes (${draft.unread.length})`),
        h('ul', {}, ...draft.unread.map((u) => h('li', {}, u))),
      ),
    );
  }
  return box;
}

/** Any number of beneficiaries; field names are ben.<n>.<key> so server errors find them. */
function beneficiaryEditor(initial: Record<string, string>[]): {
  el: HTMLElement;
  read: () => Record<string, string>[];
} {
  const box = h('div', { class: 'bens' });
  let rows = initial;
  const read = () => rows.map((_, i) => collect(box, BENEFICIARY_FORM, `ben.${i}.`));
  const render = () => {
    const remove = (i: number) => () => {
      rows = read().filter((_, j) => j !== i);
      render();
    };
    const add = () => {
      rows = [...read(), {}];
      render();
    };
    box.replaceChildren(
      ...rows.map((values, i) =>
        h(
          'div',
          { class: 'ben' },
          h(
            'div',
            { class: 'ben-head' },
            h('strong', {}, `Beneficiary ${i + 1}`),
            h('button', { type: 'button', class: 'link', onclick: remove(i) }, 'Remove'),
          ),
          fields(BENEFICIARY_FORM, `ben.${i}.`, {
            ...initialValues(BENEFICIARY_FORM, boot.today),
            ...values,
          }),
        ),
      ),
      h('button', { type: 'button', class: 'link', onclick: add }, '+ Add beneficiary'),
    );
  };
  render();
  return { el: box, read };
}

function readScreenshots(): void {
  const file = h('input', { type: 'file', accept: 'image/*', multiple: true }) as HTMLInputElement;
  const thumbs = h('div', { class: 'thumbs' });
  file.addEventListener('change', () => {
    thumbs.replaceChildren(
      ...[...(file.files ?? [])].map((f) => h('img', { src: URL.createObjectURL(f), alt: '' })),
    );
  });
  const form = page(
    'Client from screenshots',
    h(
      'p',
      { class: 'status' },
      'Pick the screenshots of one contact: the top of the contact and the notes. ' +
        'They are read and deleted straight away. Nothing is saved until you check the form.',
    ),
    h('label', { class: 'field' }, h('span', {}, 'Screenshots'), file),
    thumbs,
  );
  form.append(
    saveButton('Read contact', async (b) => {
      const files = [...(file.files ?? [])];
      if (b.disabled) return;
      if (!files.length) return toast('Pick at least one screenshot', true);
      b.disabled = true;
      b.textContent = 'Reading…';
      try {
        const shots = await Promise.all(files.map((f) => shrinkPhoto(f, OCR_SIDE, 0.85)));
        const result = await call<ReadResult>('appReadContact', shots);
        if (result.ok) return newClient(result.draft);
        toast(result.error, true);
      } catch (err) {
        toast(`Could not read: ${(err as Error).message}`, true);
      }
      b.disabled = false;
      b.textContent = 'Read contact';
    }),
  );
}

function newExpense(): void {
  const file = h('input', { type: 'file', accept: 'image/*,application/pdf' }) as HTMLInputElement;
  const preview = h('img', { class: 'preview hidden', alt: 'Receipt preview' }) as HTMLImageElement;
  file.addEventListener('change', () => {
    const f = file.files?.[0];
    preview.classList.toggle('hidden', !f || !f.type.startsWith('image/'));
    if (f && f.type.startsWith('image/')) preview.src = URL.createObjectURL(f);
  });
  const form = page(
    'Add expense',
    fields(EXPENSE_FORM),
    h('label', { class: 'field' }, h('span', {}, 'Receipt photo (optional)'), file, preview),
  );
  form.append(
    saveButton('Save expense', (b) =>
      submit(form, b, async () => {
        const f = file.files?.[0];
        const receipt = f ? await readReceipt(f) : null;
        return call<ApiResult>('appSaveExpense', collect(form, EXPENSE_FORM), receipt);
      }),
    ),
  );
}

// ---- Receipts --------------------------------------------------------------

const RECEIPT_SIDE = 1600;
/** Screenshots keep their full height (about 2340 px) so small note text stays readable. */
const OCR_SIDE = 2400;

/** Photos are shrunk to JPEG (phone photos are several MB); PDFs are sent as they are. */
async function readReceipt(file: File): Promise<ReceiptUpload> {
  if (!file.type.startsWith('image/')) {
    return { base64: await fileBase64(file), mimeType: file.type, name: file.name };
  }
  return { ...(await shrinkPhoto(file, RECEIPT_SIDE, 0.8)), name: 'receipt.jpg' };
}

async function shrinkPhoto(
  file: File,
  maxSide: number,
  quality: number,
): Promise<{ base64: string; mimeType: string }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error('Could not read that photo'));
    i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg' };
}

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsDataURL(file);
  });
}

// ---- Start -----------------------------------------------------------------

async function reload(): Promise<void> {
  try {
    boot = await call<Boot>('appBoot');
    home();
  } catch (err) {
    root.replaceChildren(
      h(
        'div',
        { class: 'page' },
        h('p', { class: 'status error' }, `Could not load: ${(err as Error).message}`),
        h('button', { class: 'primary wide', onclick: () => void reload() }, 'Try again'),
      ),
    );
  }
}

void reload();
