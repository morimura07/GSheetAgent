/** Returns the row in effect on `isoDate` from a list of `{ from }` rows, or undefined. */
export function rateOn<T extends { from: string }>(rows: T[], isoDate: string): T | undefined {
  let match: T | undefined;
  for (const row of rows) {
    if (row.from <= isoDate && (!match || row.from >= match.from)) match = row;
  }
  return match;
}

/** Cost of one lead of `leadType` received on `isoDate`, from the Settings lead-cost rows. */
export function leadCostOn(
  rows: { leadType: string; cost: number; from: string }[],
  leadType: string,
  isoDate: string,
): number | undefined {
  return rateOn(
    rows.filter((r) => r.leadType === leadType),
    isoDate,
  )?.cost;
}
