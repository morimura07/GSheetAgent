// Form checking shared by the phone app (in the browser) and the server.
// Pure: no Apps Script or DOM calls, so it is unit-tested with Vitest.

export type FieldKind =
  | 'text'
  | 'longtext'
  | 'phone'
  | 'email'
  | 'date'
  | 'money'
  | 'number'
  | 'percent'
  | 'list'
  | 'client'
  | 'lead';

export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** Dropdown source for `list` fields (a ListName from config/schema). */
  list?: string;
  /** Pre-filled value. */
  default?: string;
  /** Date fields: pre-fill with today. */
  today?: boolean;
  /** Date fields: reject dates after today. */
  notFuture?: boolean;
}

export interface FormContext {
  lists: Record<string, string[]>;
  clientIds: string[];
  leadIds: string[];
  /** "yyyy-mm-dd" in the workbook's time zone. */
  today: string;
}

/** Cleaned values: text as trimmed strings, dates as "yyyy-mm-dd", amounts as numbers. */
export type CleanValues = Record<string, string | number>;

export interface CleanResult {
  values: CleanValues;
  errors: Record<string, string>;
}

const MAX_TEXT = 200;
const MAX_LONGTEXT = 2000;

// SSNs, card and bank numbers and driver's licenses are never stored (client
// decision). The client's contact notes write them as "Ss:123456789",
// "1234.5678.9876.5432", "R: 345..." / "A: 345..." and "DL:R0123456789".
// Bare digit runs only count next to a keyword (or as a grouped/Luhn-valid card
// number), since policy numbers, phones and Medicare IDs are digit runs too.
const SENSITIVE: { pattern: RegExp; message: string }[] = [
  {
    pattern:
      /\b\d{3}[- ]\d{2}[- ]\d{4}\b|\b(ssn?|social security)[^\d\n]{0,6}\d{3}[- ]?\d{2}[- ]?\d{4}(?!\d)/i,
    message: "Looks like a Social Security number. Don't store SSNs here.",
  },
  {
    pattern: /\b\d{4}([ .-])\d{4}\1\d{4}\1\d{1,7}\b|\b\d{4}([ .-])\d{6}\2\d{5}\b/,
    message: "Looks like a card number. Don't store card details here.",
  },
  {
    pattern:
      /\b(routing|rtn|aba|acct|account|checking|savings|[ra])\s*(#|no\.?|:)\s*\d{6,17}\b|\b(routing|account|acct)\s+\d{6,17}\b/i,
    message: "Looks like a bank routing or account number. Don't store banking details here.",
  },
  {
    pattern:
      /\b(dl|d\/l|driver'?s? licen[cs]e)\s*(#|no\.?|:)?\s*[a-z]?\d[a-z0-9]{5,}|\bdl\s*(#|:)\s*[a-z0-9]{6,}/i,
    message: "Looks like a driver's license number. Don't store it here.",
  },
];

export function sensitiveText(text: string): string | undefined {
  return findSensitive(text)?.message;
}

/** The first SSN, card, bank or license number in `text`: where it starts and why. */
export function findSensitive(text: string): { index: number; message: string } | undefined {
  let found: { index: number; message: string } | undefined;
  const consider = (index: number, message: string) => {
    if (!found || index < found.index) found = { index, message };
  };
  for (const { pattern, message } of SENSITIVE) {
    const m = pattern.exec(text);
    if (m) consider(m.index, message);
  }
  for (const m of text.matchAll(/\d{13,19}/g)) {
    if (luhn(m[0])) consider(m.index!, SENSITIVE[1].message);
  }
  return found;
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

export function cleanForm(
  specs: FieldSpec[],
  input: Record<string, unknown>,
  ctx: FormContext,
): CleanResult {
  const values: CleanValues = {};
  const errors: Record<string, string> = {};
  for (const spec of specs) {
    const raw = input[spec.key];
    const text = raw === undefined || raw === null ? '' : String(raw).trim();
    if (text === '') {
      if (spec.required) errors[spec.key] = `${spec.label} is required`;
      continue;
    }
    const result = cleanField(spec, text, ctx);
    if ('error' in result) errors[spec.key] = result.error;
    else values[spec.key] = result.value;
  }
  return { values, errors };
}

type FieldResult = { value: string | number } | { error: string };

function cleanField(spec: FieldSpec, text: string, ctx: FormContext): FieldResult {
  switch (spec.kind) {
    case 'text':
    case 'longtext': {
      const max = spec.kind === 'text' ? MAX_TEXT : MAX_LONGTEXT;
      if (text.length > max) return { error: `Keep it under ${max} characters` };
      const sensitive = sensitiveText(text);
      return sensitive ? { error: sensitive } : { value: text };
    }
    case 'phone': {
      const phone = formatPhone(text);
      return phone ? { value: phone } : { error: 'Enter a 10-digit phone number' };
    }
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
        ? { value: text.toLowerCase() }
        : { error: 'Enter a valid email' };
    case 'date': {
      const iso = parseDate(text);
      if (!iso) return { error: 'Enter a valid date' };
      if (spec.notFuture && iso > ctx.today) return { error: 'Date is in the future' };
      return { value: iso };
    }
    case 'money':
    case 'number': {
      const n = parseAmount(text);
      if (n === undefined || n < 0) return { error: 'Enter a number (0 or more)' };
      return { value: spec.kind === 'money' ? Math.round(n * 100) / 100 : n };
    }
    case 'percent': {
      const n = parseAmount(text.replace(/%$/, ''));
      if (n === undefined || n <= 0 || n > 100) return { error: 'Enter a percent from 1 to 100' };
      return { value: n };
    }
    case 'list': {
      const options = ctx.lists[spec.list ?? ''] ?? [];
      const match = options.find((o) => o.toLowerCase() === text.toLowerCase());
      return match ? { value: match } : { error: 'Pick one from the list' };
    }
    case 'client':
      return ctx.clientIds.includes(text) ? { value: text } : { error: 'Pick an existing client' };
    case 'lead':
      return ctx.leadIds.includes(text) ? { value: text } : { error: 'Pick an existing lead' };
  }
}

/** "(405) 555-0123" from any 10-digit (or 1 + 10-digit) input; undefined otherwise. */
export function formatPhone(text: string): string | undefined {
  let digits = text.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return undefined;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** "yyyy-mm-dd" from "yyyy-mm-dd" (date inputs) or "m/d/yyyy"; undefined if not a real date. */
export function parseDate(text: string): string | undefined {
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else {
    match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (!match) return undefined;
    [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return undefined;
  }
  if (y < 1900 || y > 2100) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Number from "$1,250.50" / "1250.5" / "45 210"; undefined if not a number. */
export function parseAmount(text: string): number | undefined {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$|^-?\.\d+$/.test(cleaned)) return undefined;
  return Number(cleaned);
}

/** Starting values for a form: defaults, and today for `today` date fields. */
export function initialValues(specs: FieldSpec[], today: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const s of specs) {
    if (s.today) values[s.key] = today;
    else if (s.default !== undefined) values[s.key] = s.default;
  }
  return values;
}
