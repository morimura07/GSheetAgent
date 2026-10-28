// Turns the OCR text of contact screenshots (Samsung Contacts, as the client
// sends them) into new-client form values. Pure: unit-tested on the text Drive
// returns for the client's test screenshots (see docs/screenshot-samples.md).
//
// A contact usually spans several screenshots: the first shows the card (name,
// phone, email, address, birthday, linked contacts) and the start of the notes;
// the rest scroll down the notes and overlap. OCR also joins neighbouring lines
// at times ("Combined graded 10k for 110"), so facts are looked for anywhere in
// a line, and repeats across screenshots are merged.
//
// Lines holding SSN, card, bank or license numbers are dropped with the lines
// that belong to them (expiry, CVV, name on card, bank name) and never returned.

import type { ContactDraft } from '../app/forms';
import { findSensitive, formatPhone } from './forms';

export interface ReaderCarrier {
  name: string;
  aliases: string[];
}

export interface ReaderContext {
  lists: Record<string, string[]>;
  carriers: ReaderCarrier[];
  /** "yyyy-mm-dd" */
  today: string;
}

/** The reader's result before the server matches names to clients and leads. */
export type ParsedContact = Omit<ContactDraft, 'leadId'> & { referredByName: string };

// ---- Line patterns -----------------------------------------------------------

const PHONE_LABEL =
  /^(mobile|home|work|main|phone|other|cell|iphone)\s*:?\s*(\+?1?[\s(]*\d{3}\)?[\s.-]*\d{3}[\s.-]*\d{4})$/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const UI_WORDS = new Set(
  [
    'favorites',
    'edit',
    'share',
    'more',
    'history',
    'storage locations',
    'call',
    'message',
    'video',
    'email',
    'view more',
    'qr code',
    'home',
    'work',
    'other',
    'personal',
  ].map((w) => w.toLowerCase()),
);
const NOTES_LABEL = /^n?otes:?$/i;
const RELATIONS = [
  'Assistant',
  'Brother',
  'Child',
  'Domestic partner',
  'Father',
  'Friend',
  'Manager',
  'Mother',
  'Parent',
  'Partner',
  'Relative',
  'Sister',
  'Spouse',
  'Son',
  'Daughter',
  'Husband',
  'Wife',
];
const REFERRED_LABEL = /^referred by$/i;

/** Relationship initials the client writes before beneficiary names. */
const BEN_PREFIX: Record<string, string> = {
  s: 'Son',
  d: 'Daughter',
  h: 'Husband',
  w: 'Wife',
  ne: 'Nephew',
  ni: 'Niece',
  b: 'Brother',
  br: 'Brother',
  si: 'Sister',
  sis: 'Sister',
  m: 'Mother',
  mo: 'Mother',
  f: 'Father',
  fa: 'Father',
  gs: 'Grandson',
  gd: 'Granddaughter',
  gc: 'Grandchild',
  sp: 'Spouse',
  p: 'Partner',
  fr: 'Friend',
  c: 'Cousin',
};
const PREFIXES = Object.keys(BEN_PREFIX)
  .sort((a, b) => b.length - a.length)
  .join('|');
/** "D. Test daughter 1 33%" (the dot is optional at the start of a line). */
const BEN_START = new RegExp(`^(${PREFIXES})\\.?\\s+(?=[A-Za-z])`, 'i');
/** Where a second beneficiary starts inside a joined line: "... 33% Ne. Test nephew". */
const BEN_SPLIT = new RegExp(`\\s+(?=(?:${PREFIXES})\\.\\s+[A-Za-z])`, 'i');
const BARE_PHONE = /^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4,5}$/;
const PHONE_IN_TEXT = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4,5}\b/;

const NOTE_DATE = '(\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4})';
const MET = new RegExp(`\\bmet\\s*:?\\s*${NOTE_DATE}`, 'i');
const ISSUED = new RegExp(`\\bissued?\\s*:?\\s*${NOTE_DATE}`, 'i');
const HEIGHT_WEIGHT = /\b([4-7])\s*['’]\s*(\d{1,2})\s*"?\s+(\d{2,3})\b/;
const FACE_PREMIUM = /\b(\d+(?:\.\d+)?)\s*k\s*(?:for|@|at)\s*\$?(\d+(?:\.\d{1,2})?)\b/i;
const DRAFT_DAY = /\b(1st|2nd|3rd|4th)\s+(wed(?:nesday)?)\b/i;
const DRAFT_DATE = /\bdraft(?:s|\s+day)?\s*:?\s*(\d{1,2})(?:st|nd|rd|th)?\b/i;
const EXISTING = /\b(has|had)\b.*\d\s*k\b/i;
/** Medicare words in notes -> the word in the client's Medicare list ("Advantage" = MAPD). */
const MEDICARE_WORDS: [RegExp, string][] = [
  [/\bmapd\b|\badvantage\b/i, 'mapd'],
  [/\bmao\b/i, 'mao'],
  [/\bc-?snp\b/i, 'c-snp'],
  [/\bd-?snp\b/i, 'd-snp'],
  [/\bpart d\b|\bpdp\b/i, 'part d'],
];
const REFERRED = /\b\w*erred by\s*:?\s*(.+)$/i;
const MEDICARE_ID = /\b(?:MID|MBI|medicare(?:\s*id)?)\s*[:#]?\s*([A-Z0-9-]{8,13})\b/i;
const POLICY_NUMBER = /\b([A-Z]{1,5}-?\d{5,12})\b/;
const BARE_POLICY_NUMBER = /^\d{6,9}$/;
const LABELLED_POLICY_NUMBER =
  /\b(?:policy|pol)\s*(?:#|no\.?|number)?\s*:?\s*([A-Z0-9][A-Z0-9-]{4,19})\b/i;

/** Lines that belong to a card or bank block: expiry, CVV, card/bank names. */
const CARD_LABEL =
  /\b(debit|credit|card|visa|master\s?card|amex|discover|bank|fcu|cu|credit union|checking|savings)\b/i;
const EXPIRY = /^(exp\w*\s*:?\s*)?\d{1,2}[./-]\d{2}([./-]\d{2,4})?$/i;
const CVV = /^\d{3,4}$/;
const SHORT_NAME = /^[A-Za-z][A-Za-z .'-]{1,40}$/;

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// prettier-ignore
const STATE_CODES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR',
  pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA',
  'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
};
const CITY_STATE_ZIP = new RegExp(
  `^(.+?),?\\s+(${Object.keys(STATE_CODES).join('|')}|[A-Z]{2})\\s+(\\d{5})(?:-\\d{4})?$`,
  'i',
);

// ---- Entry point -------------------------------------------------------------

export function parseContact(texts: string[], ctx: ReaderContext): ParsedContact {
  const out: ParsedContact = {
    client: {},
    policy: null,
    beneficiaries: [],
    warnings: [],
    unread: [],
    removed: 0,
    referredByName: '',
  };
  const images = texts.map(toLines);
  const headers = images.filter((lines) => lines.some((l) => PHONE_LABEL.test(l)));
  const header = headers[0];
  // The card screenshot first, then the rest in the order they were picked.
  const ordered = header ? [header, ...images.filter((i) => i !== header)] : images;

  const consumed: string[] = [];
  const notes: string[][] = [];
  for (const lines of ordered) {
    const kept = dropSensitive(lines, out);
    if (lines === header) notes.push(readCard(kept, out, consumed, ctx));
    else notes.push(kept);
  }
  const names = new Set(headers.map((h) => cardName(h)).filter(Boolean));
  if (names.size > 1) {
    out.warnings.push(`These screenshots show more than one contact (${[...names].join(', ')})`);
  }
  if (!header) out.warnings.push('No screenshot shows the top of the contact (name and phone)');

  const facts = new Facts(ctx, out);
  for (const lines of notes) facts.read(lines, consumed);
  facts.finish();

  const unread = unique(out.unread).filter(
    (u) => !consumed.some((c) => c === u || (u.length >= 4 && c.includes(u))),
  );
  // A line OCR joined on one screenshot and split on another: keep the split one.
  const joined = (u: string) =>
    unread.some((x) => x !== u && u.startsWith(`${x} `) && unread.includes(u.slice(x.length + 1)));
  out.unread = unread.filter((u) => !joined(u));
  return out;
}

// ---- Lines -------------------------------------------------------------------

const CLOCK = /^\d{1,2}:\d{2}\b/;

function toLines(text: string): string[] {
  const lines = text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  // The status bar shows the clock, then what is playing ("10:54" / "Run Your Mout").
  const clock = lines.slice(0, 2).findIndex((l) => CLOCK.test(l));
  const playing = lines[clock + 1] ?? '';
  const isName = PHONE_LABEL.test(lines[clock + 2] ?? '');
  if (clock >= 0 && /^\D{1,25}$/.test(playing) && !NOTES_LABEL.test(playing) && !isName) {
    lines.splice(clock + 1, 1);
  }
  // Battery level: top of the screen, or at the end where OCR sometimes puts it.
  // Elsewhere a short number may be a CVV, which dropSensitive needs to see.
  const battery = (l: string, i: number) =>
    /^\d{1,3}\.?$/.test(l) && (i < 3 || i >= lines.length - 2);
  return lines.filter((l, i) => !battery(l, i) && !isJunk(l));
}

/** Status bar, toolbar, avatars and OCR noise from icons. */
function isJunk(line: string): boolean {
  if (CLOCK.test(line)) return true; // clock (and the music title on the same line)
  if (/^[<>]/.test(line) || line.length <= 2) return true; // back arrow, stray marks
  if (/^[A-Z]{1,2}\d{0,2}$/.test(line)) return true; // avatar initials: T, T1
  if (/^[^A-Za-z0-9]+$/.test(line) || /^[a-z]$/.test(line)) return true;
  if (/[^\x20-\x7E]/.test(line) && line.length < 8) return true;
  return UI_WORDS.has(line.toLowerCase()) && line.toLowerCase() !== 'home';
}

/** Removes SSN/card/bank/license lines and the lines that go with them. */
function dropSensitive(lines: string[], out: ParsedContact): string[] {
  const drop = new Set<number>();
  const kept = [...lines];
  lines.forEach((line, i) => {
    const hit = findSensitive(line);
    if (!hit) return;
    drop.add(i);
    out.removed++;
    // "2 Strokes last year Ss:123456789": keep what comes before, if it is clean.
    const before = line.slice(0, hit.index).trim();
    if (before.length > 3 && !findSensitive(before)) {
      kept[i] = before;
      drop.delete(i);
    }
    const isMoney = /card|bank/i.test(hit.message);
    if (isMoney && i > 0 && CARD_LABEL.test(lines[i - 1]) && !/\d{4}/.test(lines[i - 1])) {
      if (!drop.has(i - 1)) out.removed++;
      drop.add(i - 1);
    }
    // Lines that follow: expiry, CVV, then the name on the card.
    for (let j = i + 1, n = 0; j < lines.length && n < 4; j++, n++) {
      const next = lines[j];
      const tail = EXPIRY.test(next) || CVV.test(next);
      const cardName = isMoney && n >= 1 && SHORT_NAME.test(next) && CVV.test(lines[j - 1]);
      if (!tail && !cardName) break;
      if (!drop.has(j)) out.removed++;
      drop.add(j);
      if (cardName) break;
    }
  });
  return kept.filter((_, i) => !drop.has(i));
}

// ---- The contact card --------------------------------------------------------

function cardName(lines: string[]): string {
  const at = lines.findIndex((l) => PHONE_LABEL.test(l));
  return at > 0 ? lines[at - 1] : '';
}

/** Reads the card fields of the first screenshot; returns its note lines. */
function readCard(
  lines: string[],
  out: ParsedContact,
  consumed: string[],
  ctx: ReaderContext,
): string[] {
  const c = out.client;
  const phoneAt = lines.findIndex((l) => PHONE_LABEL.test(l));
  const name = phoneAt > 0 ? lines[phoneAt - 1] : '';
  const [first, ...rest] = name.split(' ');
  c.firstName = first ?? '';
  c.lastName = rest.join(' ');
  if (name && !c.lastName) out.warnings.push('Only one name on the contact: add the last name');
  c.phone = formatPhone(PHONE_LABEL.exec(lines[phoneAt])![2]) ?? '';
  consumed.push(name, lines[phoneAt]);

  const notes: string[] = [];
  let inNotes = false;
  for (let i = phoneAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (inNotes) {
      notes.push(line);
      continue;
    }
    if (NOTES_LABEL.test(line)) {
      inNotes = true;
      continue;
    }
    if (line.toLowerCase() === 'home') continue;
    const email = EMAIL.exec(line);
    if (email) {
      c.email = email[0].toLowerCase();
      consumed.push(line);
      continue;
    }
    const place = CITY_STATE_ZIP.exec(line);
    if (place) {
      c.city = place[1].trim();
      const state = place[2];
      c.state = STATE_CODES[state.toLowerCase()] ?? state.toUpperCase();
      if (!(ctx.lists.States ?? []).includes(c.state)) {
        out.warnings.push(`State ${c.state} is not on the States list`);
      }
      c.zip = place[3];
      const prev = lines[i - 1];
      if (prev && /^\d+\s+\S/.test(prev)) {
        c.street = prev;
        consumed.push(prev);
        notes.splice(notes.indexOf(prev), notes.includes(prev) ? 1 : 0);
      }
      consumed.push(line);
      continue;
    }
    const birthday = /^birthday\s*:?\s*(.*)$/i.exec(line);
    if (birthday) {
      const value = birthday[1] || lines[++i] || '';
      readBirthday(value, out, ctx.today);
      consumed.push(line, value);
      continue;
    }
    const relation = RELATIONS.find((r) => r.toLowerCase() === line.toLowerCase());
    if (relation || REFERRED_LABEL.test(line)) {
      const who = (lines[++i] ?? '').replace(/^([A-Z])\s+(?=\1)/, '');
      consumed.push(line, lines[i] ?? '', who);
      if (!who) continue;
      if (relation) {
        out.beneficiaries.push({ name: who, relationship: relation, kind: 'Primary' });
        out.warnings.push(
          `${who} is linked on the contact as ${relation}: added as a beneficiary, check type and share`,
        );
      } else out.referredByName = who;
      continue;
    }
    // A street line comes right before its city line; anything else here is a note.
    notes.push(line);
  }
  return notes;
}

function readBirthday(value: string, out: ParsedContact, today: string): void {
  const v = value.replace(/^[A-Za-z]{3},\s*/, '').trim();
  let m = /^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?$/.exec(v);
  let iso: string | undefined;
  let year: string | undefined;
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    year = m[3];
    if (month && year) iso = isoDate(Number(year), month, Number(m[2]));
  } else if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(v))) {
    iso = noteDate(v, today);
    year = m[3];
  }
  if (!year) {
    out.warnings.push(`Birthday "${value}" has no year: add it`);
  } else if (!iso) {
    out.warnings.push(`Could not read the birthday "${value}"`);
  } else if (iso >= `${today.slice(0, 4)}-01-01`) {
    out.warnings.push(`Birthday ${value} is this year or later: left out, add the real one`);
  } else {
    out.client.birthday = iso;
  }
}

// ---- The notes ---------------------------------------------------------------

class Facts {
  private block: 'none' | 'Primary' | 'Contingent' = 'none';
  private existing: string[] = [];
  private policy: Record<string, string> = {};
  private otherCarriers = new Set<string>();
  private met = '';

  constructor(
    private ctx: ReaderContext,
    private out: ParsedContact,
  ) {}

  read(lines: string[], consumed: string[]): void {
    this.block = 'none'; // a new screenshot: the Ben:/Con. heading may be off screen
    this.last = undefined;
    for (const line of lines) {
      if (this.readLine(line)) consumed.push(line);
      else this.out.unread.push(line);
    }
  }

  /** True if the line was used. */
  private readLine(line: string): boolean {
    if (NOTES_LABEL.test(line)) return true; // scrolled-up "Notes" heading
    const ben = /^ben(?:eficiar(?:y|ies))?\s*[:.]\s*(.*)$|^ben$/i.exec(line);
    const con = /^(?:con[.:]|con$|contingent\b:?)\s*(.*)$/i.exec(line);
    if (ben || con) {
      this.block = ben ? 'Primary' : 'Contingent';
      const rest = (ben ? ben[1] : con![1]) ?? '';
      return rest ? this.readBeneficiaries(rest) || true : true;
    }
    if (this.block !== 'none') {
      if (BARE_PHONE.test(line) && this.lastBeneficiary()) {
        this.lastBeneficiary()!.phone = phoneValue(line);
        return true;
      }
      if (BEN_START.test(line)) return this.readBeneficiaries(line);
    }
    // OCR can move a line into the beneficiary list ("Ben:" / "...erred by Test
    // Client 1" / "H. ..."), so only a line the reader cannot use ends the list.
    const used = this.readFact(line);
    if (!used) this.block = 'none';
    return used;
  }

  private readFact(line: string): boolean {
    if (EXISTING.test(line)) {
      this.existing.push(line);
      return true;
    }
    const referred = REFERRED.exec(line);
    if (referred) {
      this.out.referredByName ||= referred[1].trim();
      return true;
    }

    let used = false;
    const c = this.out.client;
    const met = MET.exec(line);
    if (met) {
      this.met ||= noteDate(met[1], this.ctx.today) ?? '';
      used = true;
    }
    const hw = HEIGHT_WEIGHT.exec(line);
    if (hw) {
      c.height ||= `${hw[1]}'${hw[2]}"`;
      c.weightLbs ||= hw[3];
      used = true;
    }
    if (/\bnon[- ]?smok(er|ing)\b|\bno tobacco\b/i.test(line)) {
      c.smoker ||= this.listValue('Smoker', 'non');
      used = true;
    } else if (/\bsmok(er|es|ing)\b|\btobacco\b/i.test(line)) {
      // "Smoker w COPD": the health part is not stored (client's choice).
      c.smoker ||= this.listValue('Smoker', 'smoker', 'non');
      used = true;
    }
    const mid = MEDICARE_ID.exec(line);
    if (mid) {
      c.medicareId ||= mid[1];
      used = true;
    }
    const plan = this.medicarePlan(line);
    if (plan) {
      c.medicarePlan ||= plan;
      used = true;
    }
    return this.readPolicy(mid ? line.replace(mid[0], '') : line) || used;
  }

  private readPolicy(line: string): boolean {
    const p = this.policy;
    let used = false;
    const carrier = this.carrier(line);
    if (carrier) {
      if (!p.carrier) p.carrier = carrier;
      else if (p.carrier !== carrier) this.otherCarriers.add(carrier);
      const product = this.productType(line);
      if (product) p.productType ||= product;
      used = true;
    }
    const fp = FACE_PREMIUM.exec(line);
    if (fp) {
      p.faceAmount ||= String(Math.round(Number(fp[1]) * 1000));
      p.premium ||= fp[2];
      used = true;
    }
    const issued = ISSUED.exec(line);
    if (issued) {
      p.issueDate ||= noteDate(issued[1], this.ctx.today) ?? '';
      used = true;
    }
    const draft = DRAFT_DAY.exec(line);
    const draftDate = DRAFT_DATE.exec(line);
    if (draft) {
      p.draftDay ||= `${draft[1].toLowerCase()} Wed`;
      used = true;
    } else if (draftDate) {
      p.draftDay ||= ordinal(Number(draftDate[1]));
      used = true;
    }
    const labelled = LABELLED_POLICY_NUMBER.exec(line);
    const number = POLICY_NUMBER.exec(line);
    const bare = BARE_POLICY_NUMBER.test(line);
    if (labelled && /\d/.test(labelled[1])) {
      p.policyNumber ||= labelled[1];
      used = true;
    } else if ((number && (used || line === number[1])) || bare) {
      p.policyNumber ||= bare ? line : number![1];
      used = true;
    }
    return used;
  }

  private readBeneficiaries(line: string): boolean {
    if (this.block === 'none') return false;
    let any = false;
    for (const part of line.split(BEN_SPLIT)) {
      const start = BEN_START.exec(part);
      if (!start) {
        if (BARE_PHONE.test(part) && this.lastBeneficiary()) {
          this.lastBeneficiary()!.phone = phoneValue(part);
          any = true;
        }
        continue;
      }
      let rest = part.slice(start[0].length);
      const ben: Record<string, string> = {
        relationship: BEN_PREFIX[start[1].toLowerCase()],
        kind: this.block,
      };
      const share = /\s*(\d{1,3})\s*%/.exec(rest);
      if (share) {
        ben.share = share[1];
        rest = rest.replace(share[0], ' ');
      }
      const phone = PHONE_IN_TEXT.exec(rest);
      if (phone) {
        ben.phone = phoneValue(phone[0]);
        rest = rest.replace(phone[0], ' ');
      }
      ben.name = rest.replace(/\s+/g, ' ').trim();
      if (!ben.name) continue;
      const known = this.out.beneficiaries.find((b) => same(b.name, ben.name));
      if (known) {
        // Seen on another screenshot or as a linked contact: the notes say who they
        // are (relationship, type); otherwise only fill in what was missing.
        for (const [k, v] of Object.entries(ben)) {
          if (v && (!known[k] || k === 'kind' || k === 'relationship')) known[k] = v;
        }
      } else {
        this.out.beneficiaries.push(ben);
      }
      this.last = known ?? ben;
      any = true;
    }
    return any;
  }

  /** The beneficiary read last on this screenshot: a phone on the next line is theirs. */
  private last: Record<string, string> | undefined;

  private lastBeneficiary(): Record<string, string> | undefined {
    return this.last;
  }

  private carrier(line: string): string {
    for (const c of this.ctx.carriers) {
      for (const word of [c.name, ...c.aliases]) {
        if (!word) continue;
        // Short aliases ("AA", "TA", "GTL") only count in capitals.
        const flags = word.length <= 3 ? '' : 'i';
        if (new RegExp(`(^|[^A-Za-z])${escape(word)}([^A-Za-z]|$)`, flags).test(line)) {
          return c.name;
        }
      }
    }
    return '';
  }

  private productType(line: string): string {
    const words: [RegExp, string][] = [
      [/\bgraded\b/i, 'graded'],
      [/\blevel\b/i, 'level'],
      [/\b(gi|guaranteed)\b/i, 'guaranteed'],
      [/\bwhole life\b/i, 'whole life'],
      [/\bterm\b/i, 'term'],
      ...MEDICARE_WORDS,
    ];
    for (const [re, word] of words) {
      if (re.test(line)) return this.listValue('ProductTypes', word);
    }
    return '';
  }

  private medicarePlan(line: string): string {
    for (const [re, word] of MEDICARE_WORDS) {
      if (re.test(line)) return this.listValue('MedicarePlanTypes', word);
    }
    return '';
  }

  /** The list entry containing `word` (and not `unless`); '' if none. */
  private listValue(list: string, word: string, unless?: string): string {
    return (
      (this.ctx.lists[list] ?? []).find(
        (v) => v.toLowerCase().includes(word) && !(unless && v.toLowerCase().includes(unless)),
      ) ?? ''
    );
  }

  finish(): void {
    const out = this.out;
    const c = out.client;
    if (this.existing.length) c.existingCoverage = unique(this.existing).join('; ').slice(0, 200);
    if (this.met) c.notes = `Met ${usDate(this.met)}`;

    const p = this.policy;
    if (Object.keys(p).length) {
      if (!p.carrier) out.warnings.push('Policy details found but no carrier: pick one');
      if (p.premium) p.paymentMode = 'Monthly'; // "10k for 110": $110 a month (client, 2026-10-22)
      if (this.met) p.applicationDate = this.met;
      p.status = 'Pending';
      out.policy = p;
    }
    if (this.otherCarriers.size) {
      out.warnings.push(
        `Notes also mention ${[...this.otherCarriers].join(', ')}: only the first policy was filled in`,
      );
    }
    if (out.beneficiaries.length && !out.policy) {
      out.warnings.push('Beneficiaries need a policy: add the policy or remove them');
    }
    for (const kind of ['Primary', 'Contingent']) {
      const shares = out.beneficiaries.filter((b) => b.kind === kind && b.share);
      const total = shares.reduce((sum, b) => sum + Number(b.share), 0);
      if (shares.length && total !== 100) {
        out.warnings.push(`${kind} beneficiary shares add up to ${total}%, not 100%`);
      }
    }
    for (const b of out.beneficiaries) {
      if (b.phone && !formatPhone(b.phone)) {
        out.warnings.push(`Phone for ${b.name} (${b.phone}) is not 10 digits`);
      }
    }
    // Long digit runs the reader did not recognise could be cut-off card or
    // account numbers: never shown.
    // A leftover "label: date" is an expiry whose label OCR garbled ("Fvn: 12.12.33").
    const expiry = /^\W*[A-Za-z]{1,4}\s*:?\s*\d{1,2}[./-]\d{1,2}([./-]\d{2,4})?$/;
    const unread = out.unread.filter((l) => (l.match(/\d/g) ?? []).length < 8 && !expiry.test(l));
    out.removed += out.unread.length - unread.length;
    out.unread = unread;
  }
}

// ---- Helpers -----------------------------------------------------------------

/** "10.10.26" / "11/3/2026" → "yyyy-mm-dd"; two-digit years are 20yy unless that is far ahead. */
export function noteDate(text: string, today: string): string | undefined {
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/.exec(text);
  if (!m) return undefined;
  let year = Number(m[3]);
  if (m[3].length === 2) {
    const thisYear = Number(today.slice(2, 4));
    year += year <= thisYear + 5 ? 2000 : 1900;
  }
  return isoDate(year, Number(m[1]), Number(m[2]));
}

function isoDate(y: number, m: number, d: number): string | undefined {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function usDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
}

function ordinal(n: number): string {
  const suffix =
    n % 10 === 1 && n !== 11
      ? 'st'
      : n % 10 === 2 && n !== 12
        ? 'nd'
        : n % 10 === 3 && n !== 13
          ? 'rd'
          : 'th';
  return `${n}${suffix}`;
}

/** A phone as typed into the form: formatted if it is a valid number, else as written. */
function phoneValue(text: string): string {
  return formatPhone(text) ?? text.replace(/\s+/g, '');
}

function same(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return norm(a) === norm(b);
}

function unique(lines: string[]): string[] {
  const seen = new Set<string>();
  return lines.filter((l) => {
    const key = l.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
