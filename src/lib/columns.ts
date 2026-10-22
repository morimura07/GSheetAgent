import { columnNumber, DATA_TABS, type DataTab, type DataTabName } from '../config/schema';

/** 1 -> A, 27 -> AA. */
export function columnLetter(n: number): string {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Rows 2 to the bottom of one column, e.g. `K2:K` or `'Clients'!A2:A`. */
export function columnRange(tab: DataTab, key: string, qualify: boolean): string {
  const col = columnLetter(columnNumber(tab, key));
  return `${qualify ? `'${tab.name}'!` : ''}${col}2:${col}`;
}

/** Replaces [[key]] and [[Tab.key]] placeholders with ranges. */
export function resolveFormula(expr: string, tab: DataTab): string {
  return expr.replace(
    /\[\[(?:(\w+)\.)?(\w+)\]\]/g,
    (_, tabName: string | undefined, key: string) => {
      if (!tabName) return columnRange(tab, key, false);
      const other = DATA_TABS.find((t) => t.name === (tabName as DataTabName));
      if (!other) throw new Error(`${tab.name}: unknown tab in [[${tabName}.${key}]]`);
      return columnRange(other, key, true);
    },
  );
}

/** The full header-cell formula: header text on row 1, the expression fills rows 2+. */
export function headerFormula(header: string, expr: string, tab: DataTab): string {
  return `={"${header.replace(/"/g, '""')}";${resolveFormula(expr, tab)}}`;
}
