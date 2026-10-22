/** CL + 7 -> "CL-0007". Grows past 4 digits when needed. */
export function formatId(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(4, '0')}`;
}

/** "CL-0007" -> 7; anything else -> null. */
export function parseIdNumber(prefix: string, value: unknown): number | null {
  const m = new RegExp(`^${prefix}-(\\d+)$`).exec(String(value ?? '').trim());
  return m ? Number(m[1]) : null;
}

/**
 * Next free ID number: above both the stored counter and every ID already in
 * the column, so deleting the last row never reuses an ID other tabs may reference.
 */
export function nextIdNumber(prefix: string, existing: unknown[], storedNext: number): number {
  let max = 0;
  for (const v of existing) max = Math.max(max, parseIdNumber(prefix, v) ?? 0);
  return Math.max(max + 1, storedNext, 1);
}

const isBlank = (v: unknown) => v === '' || v === null || v === undefined || v === false;

/** A row gets an ID once any entry cell has a value. Checkbox `false` counts as blank. */
export function rowNeedsId(row: unknown[], idIndex: number, entryIndexes: number[]): boolean {
  return isBlank(row[idIndex]) && entryIndexes.some((i) => !isBlank(row[i]));
}
