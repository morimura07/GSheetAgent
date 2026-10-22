import { describe, expect, it } from 'vitest';
import { columnName, excelSerial, xlsxParts } from '../src/lib/xlsx';

describe('xlsx writer', () => {
  const parts = xlsxParts([
    {
      name: 'Tax & hours',
      rows: [
        ['Name', 'When', 'Paid'],
        ['Test <A> & "B"', { serial: excelSerial(2026, 10, 22), time: false }, true],
        ['=1+1', { serial: excelSerial(1899, 12, 30, 9, 30), time: true }, 110.5],
      ],
    },
    { name: 'Tax & hours', rows: [['dup']] },
  ]);

  it('has every part of a workbook', () => {
    expect(Object.keys(parts).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
  });

  it('escapes text, keeps "=" text as text, and names sheets uniquely', () => {
    const sheet = parts['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<t xml:space="preserve">Test &lt;A&gt; &amp; &quot;B&quot;</t>');
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">=1+1</t>');
    expect(sheet).not.toContain('<f>');
    expect(parts['xl/workbook.xml']).toContain('name="Tax &amp; hours"');
    expect(parts['xl/workbook.xml']).toContain('name="Tax &amp; hours 2"');
  });

  it('writes dates, times, booleans and numbers with the right styles', () => {
    const sheet = parts['xl/worksheets/sheet1.xml'];
    expect(sheet).toContain('<c r="B2" s="2"><v>46317</v></c>');
    expect(sheet).toContain('<c r="B3" s="4"><v>0.39583333</v></c>');
    expect(sheet).toContain('<c r="C2" t="b"><v>1</v></c>');
    expect(sheet).toContain('<c r="C3"><v>110.5</v></c>');
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1">'); // bold header
  });

  it('counts columns and days like Excel', () => {
    expect([1, 26, 27, 52, 703].map(columnName)).toEqual(['A', 'Z', 'AA', 'AZ', 'AAA']);
    expect(excelSerial(1900, 3, 1)).toBe(61);
    expect(excelSerial(2026, 1, 1, 12)).toBe(46023.5);
  });
});
