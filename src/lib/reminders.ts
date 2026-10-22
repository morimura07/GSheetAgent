// What needs attention today, from the workbook's rows. Pure (dates are
// "yyyy-mm-dd" text), so every rule is unit tested. The phone app and the
// sheet menu show the list; nothing is emailed.

export interface ReminderInput {
  /** "yyyy-mm-dd" */
  today: string;
  clients: { id: string; name: string; birthday: string }[];
  policies: {
    id: string;
    client: string;
    carrier: string;
    status: string;
    group: string;
    /** Persistency start (effective or issue date). */
    start: string;
    applicationDate: string;
    firstDraftDate: string;
    draftDay: string;
  }[];
  leads: { id: string; name: string; leadType: string; dateReceived: string; contacted: boolean }[];
}

export type ReminderKind = 'atRisk' | 'draft' | 'pending' | 'lead' | 'birthday' | 'anniversary';

export interface Reminder {
  kind: ReminderKind;
  /** The day it is about ("yyyy-mm-dd"). */
  date: string;
  text: string;
  /** ID of the client, policy or lead. */
  ref: string;
}

/** How far ahead birthdays, anniversaries and first drafts are shown. */
export const LOOK_AHEAD_DAYS = 7;
export const FIRST_DRAFT_AHEAD_DAYS = 3;
/** A pending application with no first draft date gets a nudge after this long. */
export const PENDING_DAYS = 21;
/** Uncontacted leads: shown from this many days after they came in, until LEAD_MAX_DAYS. */
export const LEAD_WAIT_DAYS = 2;
export const LEAD_MAX_DAYS = 30;

const ORDER: ReminderKind[] = ['atRisk', 'draft', 'lead', 'pending', 'birthday', 'anniversary'];

export function reminders(input: ReminderInput): Reminder[] {
  const { today } = input;
  const out: Reminder[] = [];

  for (const c of input.clients) {
    if (!c.birthday) continue;
    const next = nextYearly(c.birthday, today);
    if (daysBetween(today, next) > LOOK_AHEAD_DAYS) continue;
    const age = Number(next.slice(0, 4)) - Number(c.birthday.slice(0, 4));
    out.push({
      kind: 'birthday',
      date: next,
      text: `${c.name} turns ${age} ${when(today, next)}`,
      ref: c.id,
    });
  }

  for (const p of input.policies) {
    const label = `${p.client}${p.carrier ? ` (${p.carrier})` : ''}`;
    if (p.group === 'at_risk') {
      out.push({
        kind: 'atRisk',
        date: today,
        text: `${p.status}: ${label}. Call to fix the payment${p.draftDay ? ` (drafts ${p.draftDay})` : ''}`,
        ref: p.id,
      });
    }
    if (p.group === 'pending' && p.firstDraftDate) {
      const days = daysBetween(today, p.firstDraftDate);
      if (days < 0) {
        out.push({
          kind: 'draft',
          date: p.firstDraftDate,
          text: `First draft for ${label} was due ${usDate(p.firstDraftDate)}: check it went through, then update the status`,
          ref: p.id,
        });
      } else if (days <= FIRST_DRAFT_AHEAD_DAYS) {
        out.push({
          kind: 'draft',
          date: p.firstDraftDate,
          text: `First draft for ${label} ${when(today, p.firstDraftDate)}`,
          ref: p.id,
        });
      }
    }
    if (p.group === 'pending' && !p.firstDraftDate && p.applicationDate) {
      const days = daysBetween(p.applicationDate, today);
      if (days >= PENDING_DAYS) {
        out.push({
          kind: 'pending',
          date: p.applicationDate,
          text: `Application for ${label} pending for ${days} days`,
          ref: p.id,
        });
      }
    }
    if ((p.group === 'active' || p.group === 'at_risk') && p.start) {
      const next = nextYearly(p.start, today);
      const years = Number(next.slice(0, 4)) - Number(p.start.slice(0, 4));
      if (years >= 1 && daysBetween(today, next) <= LOOK_AHEAD_DAYS) {
        out.push({
          kind: 'anniversary',
          date: next,
          text: `${label}: policy ${years} year${years === 1 ? '' : 's'} ${when(today, next)}`,
          ref: p.id,
        });
      }
    }
  }

  for (const l of input.leads) {
    if (l.contacted || !l.dateReceived) continue;
    const days = daysBetween(l.dateReceived, today);
    if (days >= LEAD_WAIT_DAYS && days <= LEAD_MAX_DAYS) {
      out.push({
        kind: 'lead',
        date: l.dateReceived,
        text: `${l.name || 'Lead'}${l.leadType ? ` (${l.leadType})` : ''} came in ${days} days ago, not contacted yet`,
        ref: l.id,
      });
    }
  }

  return out.sort(
    (a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || a.date.localeCompare(b.date),
  );
}

// ---- Dates ("yyyy-mm-dd") ------------------------------------------------------

const ms = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export function daysBetween(from: string, to: string): number {
  return Math.round((ms(to) - ms(from)) / 86400000);
}

/** The next time (today or later) the month/day of `iso` comes round. Feb 29 → Feb 28. */
export function nextYearly(iso: string, today: string): string {
  const monthDay = (year: number) => {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const md = iso.slice(5);
    return `${year}-${md === '02-29' && !leap ? '02-28' : md}`;
  };
  const year = Number(today.slice(0, 4));
  const thisYear = monthDay(year);
  return thisYear >= today ? thisYear : monthDay(year + 1);
}

function usDate(iso: string): string {
  return `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "today", "tomorrow" or "on Fri 10/24". */
function when(today: string, iso: string): string {
  const days = daysBetween(today, iso);
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `on ${WEEKDAYS[new Date(ms(iso)).getUTCDay()]} ${usDate(iso)}`;
}
