// A minimal .xlsx writer: the XML parts of a workbook with values only (no
// formulas), bold frozen header rows and date formats. Pure, so it is unit
// tested; Apps Script zips the parts (Utilities.zip). Writing the file
// ourselves means the monthly Excel copy needs no extra Google permission.

export type XlsxCell = string | number | boolean | null | { serial: number; time: boolean };

export interface XlsxSheet {
  name: string;
  rows: XlsxCell[][];
  /** Column widths in characters (optional). */
  widths?: number[];
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Cell styles (index into cellXfs in styles.xml).
const STYLE = { normal: 0, bold: 1, date: 2, dateTime: 3, time: 4 };

/** The files of the .xlsx package: path → XML text. */
export function xlsxParts(sheets: XlsxSheet[]): Record<string, string> {
  if (!sheets.length) throw new Error('A workbook needs at least one sheet');
  const names = uniqueNames(sheets.map((s) => s.name));
  const parts: Record<string, string> = {
    '[Content_Types].xml':
      HEAD +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      `</Types>`,
    '_rels/.rels':
      HEAD +
      `<Relationships xmlns="${PKG_REL}">` +
      `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
    'xl/workbook.xml':
      HEAD +
      `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>` +
      names
        .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('') +
      `</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':
      HEAD +
      `<Relationships xmlns="${PKG_REL}">` +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="${REL}/styles" Target="styles.xml"/>` +
      `</Relationships>`,
    'xl/styles.xml': STYLES,
  };
  sheets.forEach((s, i) => (parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s)));
  return parts;
}

const STYLES =
  HEAD +
  `<styleSheet xmlns="${MAIN}">` +
  `<numFmts count="3"><numFmt numFmtId="164" formatCode="mm/dd/yyyy"/>` +
  `<numFmt numFmtId="165" formatCode="mm/dd/yyyy h:mm AM/PM"/>` +
  `<numFmt numFmtId="166" formatCode="h:mm AM/PM"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill>` +
  `<fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

function sheetXml(sheet: XlsxSheet): string {
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.map((v, c) => cellXml(v, `${columnName(c + 1)}${r + 1}`, r === 0)).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return (
    HEAD +
    `<worksheet xmlns="${MAIN}">` +
    `<sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` +
    `</sheetView></sheetViews>` +
    cols +
    `<sheetData>${rows}</sheetData></worksheet>`
  );
}

function cellXml(v: XlsxCell, ref: string, header: boolean): string {
  if (v === null || v === '') return '';
  const s = header ? ` s="${STYLE.bold}"` : '';
  if (typeof v === 'string') {
    return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
  }
  if (typeof v === 'boolean') return `<c r="${ref}" t="b"${s}><v>${v ? 1 : 0}</v></c>`;
  if (typeof v === 'number') {
    return Number.isFinite(v) ? `<c r="${ref}"${s}><v>${v}</v></c>` : '';
  }
  // A time of day alone (clock in/out) is a fraction of a day.
  const style = v.serial < 1 ? STYLE.time : v.time ? STYLE.dateTime : STYLE.date;
  return `<c r="${ref}" s="${style}"><v>${v.serial}</v></c>`;
}

/** 1 → A, 27 → AA. */
export function columnName(n: number): string {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Excel's day number for a date and time given as its parts (no time zone involved). */
export function excelSerial(y: number, m: number, d: number, h = 0, min = 0, s = 0): number {
  const ms = Date.UTC(y, m - 1, d, h, min, s) - Date.UTC(1899, 11, 30);
  return Math.round((ms / 86400000) * 1e8) / 1e8;
}

/** Excel sheet names: at most 31 characters, none of []:*?/\, unique. */
function uniqueNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((n) => {
    const base = n.replace(/[[\]:*?/\\]/g, '-').slice(0, 31) || 'Sheet';
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28)} ${i}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/** XML text: escapes markup and drops characters XML cannot hold. */
function esc(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
