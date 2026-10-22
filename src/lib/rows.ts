import type { DataTab } from '../config/schema';

/** Lays out `{ key: value }` in the tab's column order; missing keys become blank cells. */
export function rowFromObject(tab: DataTab, obj: Record<string, unknown>): unknown[] {
  const unknown = Object.keys(obj).filter((k) => !tab.columns.some((c) => c.key === k));
  if (unknown.length) throw new Error(`${tab.name} has no column(s): ${unknown.join(', ')}`);
  return tab.columns.map((c) => obj[c.key] ?? '');
}

/** "2026-10-21" -> local Date at midnight (the script's time zone). */
export function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
