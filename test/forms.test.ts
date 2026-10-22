import { describe, expect, it } from 'vitest';
import {
  BENEFICIARY_FORM,
  CLIENT_FORM,
  CLOCK_IN_FORM,
  EXPENSE_FORM,
  LEAD_FORM,
  POLICY_FORM,
  TRIP_END_FORM,
  TRIP_FORM,
  TRIP_START_FORM,
  APP_LISTS,
} from '../src/app/forms';
import { SETTINGS_LISTS, SIMPLE_LISTS, dataTab, type DataTabName } from '../src/config/schema';
import {
  cleanForm,
  formatPhone,
  initialValues,
  parseAmount,
  parseDate,
  type FieldSpec,
  type FormContext,
} from '../src/lib/forms';

const ctx: FormContext = {
  lists: { LeadTypes: ['Yes lead', 'Survey lead'], Counties: ['Tulsa', 'Oklahoma'] },
  clientIds: ['CL-0001'],
  leadIds: ['LD-0003'],
  today: '2026-10-22',
};

describe('form specs match the workbook', () => {
  const forms: [string, FieldSpec[], DataTabName][] = [
    ['lead', LEAD_FORM, 'Leads'],
    ['client', CLIENT_FORM, 'Clients'],
    ['policy', POLICY_FORM, 'Policies'],
    ['beneficiary', BENEFICIARY_FORM, 'Beneficiaries'],
    ['expense', EXPENSE_FORM, 'Expenses'],
    ['clock in', CLOCK_IN_FORM, 'Hours'],
    ['trip start', TRIP_START_FORM, 'Mileage'],
    ['trip end', TRIP_END_FORM, 'Mileage'],
    ['trip', TRIP_FORM, 'Mileage'],
  ];

  it.each(forms)(
    '%s fields are entry columns of the tab, with the same dropdown',
    (_, specs, tabName) => {
      const tab = dataTab(tabName);
      for (const spec of specs) {
        const column = tab.columns.find((c) => c.key === spec.key);
        expect(column, `${tabName}.${spec.key}`).toBeDefined();
        expect(['id', 'formula', 'timestamp']).not.toContain(column!.type);
        if (spec.kind === 'list') expect(spec.list).toBe(column!.list);
        if (column!.type === 'date') expect(spec.kind).toBe('date');
        if (column!.type === 'percent') expect(spec.kind).toBe('percent');
        if (column!.type === 'ref') expect(spec.kind).toBe('client');
      }
    },
  );

  it('every app list is a workbook list', () => {
    const known = [...Object.keys(SIMPLE_LISTS), ...Object.keys(SETTINGS_LISTS)];
    for (const name of APP_LISTS) expect(known).toContain(name);
  });

  it('never asks for SSN or banking details', () => {
    const all = [LEAD_FORM, CLIENT_FORM, POLICY_FORM, BENEFICIARY_FORM, EXPENSE_FORM].flat();
    for (const f of all)
      expect(`${f.key} ${f.label}`).not.toMatch(/ssn|social|bank|routing|account/i);
  });
});

describe('cleanForm', () => {
  const specs: FieldSpec[] = [
    { key: 'name', label: 'Name', kind: 'text', required: true },
    { key: 'type', label: 'Type', kind: 'list', list: 'LeadTypes' },
    { key: 'phone', label: 'Phone', kind: 'phone' },
    { key: 'email', label: 'Email', kind: 'email' },
    { key: 'when', label: 'When', kind: 'date', notFuture: true },
    { key: 'cost', label: 'Cost', kind: 'money' },
    { key: 'miles', label: 'Miles', kind: 'number' },
    { key: 'by', label: 'Referred by', kind: 'client' },
    { key: 'lead', label: 'Lead', kind: 'lead' },
    { key: 'notes', label: 'Notes', kind: 'longtext' },
  ];

  it('cleans good input', () => {
    const { values, errors } = cleanForm(
      specs,
      {
        name: '  Test Alpha ',
        type: 'YES LEAD',
        phone: '+1 405-555-0123',
        email: 'Alpha@Example.com',
        when: '10/21/2026',
        cost: '$1,250.555',
        miles: '45 210.5',
        by: 'CL-0001',
        lead: 'LD-0003',
        notes: 'Policy 123456789X',
      },
      ctx,
    );
    expect(errors).toEqual({});
    expect(values).toEqual({
      name: 'Test Alpha',
      type: 'Yes lead',
      phone: '(405) 555-0123',
      email: 'alpha@example.com',
      when: '2026-10-21',
      cost: 1250.56,
      miles: 45210.5,
      by: 'CL-0001',
      lead: 'LD-0003',
      notes: 'Policy 123456789X',
    });
  });

  it('skips blank optional fields and reports blank required ones', () => {
    const { values, errors } = cleanForm(specs, { name: ' ', phone: '' }, ctx);
    expect(values).toEqual({});
    expect(errors).toEqual({ name: 'Name is required' });
  });

  it('reports each bad field', () => {
    const { errors } = cleanForm(
      specs,
      {
        name: 'x',
        type: 'Cold call',
        phone: '555-1234',
        email: 'nope',
        when: '2026-10-23',
        cost: '-1',
        miles: 'ten',
        by: 'CL-9999',
        lead: 'LD-0001',
      },
      ctx,
    );
    expect(Object.keys(errors).sort()).toEqual([
      'by',
      'cost',
      'email',
      'lead',
      'miles',
      'phone',
      'type',
      'when',
    ]);
    expect(errors.when).toBe('Date is in the future');
  });

  it('refuses Social Security numbers', () => {
    const ssn = (notes: string, kind: 'text' | 'longtext' = 'longtext') =>
      cleanForm([{ key: 'n', label: 'N', kind }], { n: notes }, ctx).errors.n;
    expect(ssn('SSN 123-45-6789')).toMatch(/Social Security/);
    expect(ssn('ss 123 45 6789', 'text')).toMatch(/Social Security/);
    expect(ssn('ss#123456789')).toMatch(/Social Security/);
    expect(ssn('her SSN is 123456789')).toMatch(/Social Security/);
    expect(ssn('policy 123456789 issued')).toBeUndefined();
    expect(ssn('123456789', 'text')).toBeUndefined(); // could be a policy number
    expect(ssn('call (405) 555-0123')).toBeUndefined();
  });

  // Lines as the client writes them in contact notes (fake values from the samples).
  it('refuses card, bank and license numbers as written in contact notes', () => {
    const msg = (notes: string) =>
      cleanForm([{ key: 'n', label: 'N', kind: 'longtext' }], { n: notes }, ctx).errors.n;
    expect(msg('Met 10.10.26\nSs:123456789')).toMatch(/Social Security/);
    expect(msg('Ss: 345678913')).toMatch(/Social Security/);
    expect(msg('Tfcu Debit\n1234.5678.9876.5432\n10.10.31\n567')).toMatch(/card/);
    expect(msg('3456 7898 7654 3212')).toMatch(/card/);
    expect(msg('card 4111111111111111')).toMatch(/card/); // Luhn-valid, no separators
    expect(msg('Midfirst Bank\nR: 34534534567')).toMatch(/bank/);
    expect(msg('A: 34554334565')).toMatch(/bank/);
    expect(msg('routing 103000648')).toMatch(/bank/);
    expect(msg('DL:R0123456789')).toMatch(/license/);
    expect(msg('DL: O0O01LI1L0O')).toMatch(/license/);
    // Everything else in the samples must still be allowed.
    for (const ok of [
      "Met 10.10.26\n5'6 150\nNon smoker\nDiabetic no neuropathy\n2 Strokes last year",
      'EXP:10.10.31',
      'Ben:\nS. Test son 1 34%\nD. Test daughter 1 33%',
      'H. Test Husband 3\n4053456788\nCon.\nS Test son 3\n40534566666',
      'Combined graded\n10k for 110\nIssued 11.25.26\n4th wed\nG77788888',
      'GTL Graded\n15k for 220\nIssued 11.3.26\nGTL7343456',
      'MID: 2345678987\nDevoted advantage',
      'Has 5k policy w AmAm from 02\nHad 10k with MoO lapsed\nHad 7k GI RN',
      'Referred by Test Client 1',
    ])
      expect(msg(ok), ok).toBeUndefined();
  });

  it('limits text length', () => {
    const { errors } = cleanForm(
      [{ key: 'n', label: 'N', kind: 'text' }],
      { n: 'x'.repeat(201) },
      ctx,
    );
    expect(errors.n).toMatch(/200/);
  });
});

describe('parsers', () => {
  it('formatPhone', () => {
    expect(formatPhone('4055550123')).toBe('(405) 555-0123');
    expect(formatPhone('1 (405) 555 0123')).toBe('(405) 555-0123');
    expect(formatPhone('555-0123')).toBeUndefined();
  });

  it('parseDate', () => {
    expect(parseDate('2026-2-3')).toBe('2026-02-03');
    expect(parseDate('2/3/2026')).toBe('2026-02-03');
    expect(parseDate('2026-02-30')).toBeUndefined();
    expect(parseDate('13/01/2026')).toBeUndefined();
    expect(parseDate('yesterday')).toBeUndefined();
  });

  it('parseAmount', () => {
    expect(parseAmount('$1,234.50')).toBe(1234.5);
    expect(parseAmount('.5')).toBe(0.5);
    expect(parseAmount('12abc')).toBeUndefined();
    expect(parseAmount('')).toBeUndefined();
  });

  it('initialValues fills defaults and today', () => {
    expect(initialValues(POLICY_FORM, '2026-10-22')).toEqual({
      paymentMode: 'Monthly',
      applicationDate: '2026-10-22',
      status: 'Pending',
    });
  });
});
