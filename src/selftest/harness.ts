// Minimal test harness that runs inside Apps Script against a real spreadsheet.

type Spreadsheet = GoogleAppsScript.Spreadsheet.Spreadsheet;

export interface TestCase {
  name: string;
  /** May return a note (e.g. timings) that is shown with the result. */
  run: (ss: Spreadsheet) => void | string;
}

export interface TestResult {
  name: string;
  ok: boolean;
  ms: number;
  note?: string;
  error?: string;
}

/** Collects "step 1.2s" laps for a test note. */
export function stopwatch(): { lap: (step: string) => void; summary: () => string } {
  let last = Date.now();
  const laps: string[] = [];
  return {
    lap: (step) => {
      const now = Date.now();
      laps.push(`${step} ${((now - last) / 1000).toFixed(1)}s`);
      last = now;
    },
    summary: () => laps.join(', '),
  };
}

const show = (v: unknown) =>
  JSON.stringify(v, (_, x) => (x instanceof Date ? `Date(${x.toISOString()})` : x));

export function eq(actual: unknown, expected: unknown, label: string): void {
  if (show(actual) !== show(expected)) {
    throw new Error(`${label}: expected ${show(expected)}, got ${show(actual)}`);
  }
}

export function ok(condition: unknown, label: string): void {
  if (!condition) throw new Error(label);
}

export function runCases(ss: Spreadsheet, cases: TestCase[]): TestResult[] {
  return cases.map((c) => {
    const start = Date.now();
    try {
      const note = c.run(ss) || undefined;
      SpreadsheetApp.flush();
      return { name: c.name, ok: true, ms: Date.now() - start, note };
    } catch (err) {
      const e = err as Error;
      return {
        name: c.name,
        ok: false,
        ms: Date.now() - start,
        error: `${e.message}${e.stack ? `\n${e.stack.split('\n').slice(1, 4).join('\n')}` : ''}`,
      };
    }
  });
}
