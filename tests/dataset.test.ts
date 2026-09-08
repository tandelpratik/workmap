import { describe, expect, it } from 'vitest';
import {
  datasetFilename,
  toCsv,
  toJson,
  type DatasetColumn,
  type DatasetProvenance,
} from '@/domain/dataset';

/**
 * A file that leaves this site takes its licence with it or it does not leave.
 *
 * That is the property most of these assert. The escaping cases are the other
 * half: a heading here genuinely contains a comma, and a CSV that gets that
 * wrong silently shifts every column after it.
 */

interface Row {
  readonly name: string;
  readonly value: number | null;
}

const columns: readonly DatasetColumn<Row>[] = [
  { key: 'name', heading: 'State or territory', value: (row) => row.name },
  { key: 'value', heading: 'Advertisements', value: (row) => row.value },
];

const provenance: DatasetProvenance = {
  title: 'Online job advertisements by state',
  publisher: 'Jobs and Skills Australia',
  dataset: 'Internet Vacancy Index',
  referencePeriod: 'July 2026',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Based on Jobs and Skills Australia data.',
  derivation: 'Summed from the regions the publisher reports on.',
  source: 'https://example.test/data-and-licensing',
  retrievedAt: new Date('2026-09-09T00:00:00Z'),
};

const rows: Row[] = [
  { name: 'New South Wales', value: 60675 },
  { name: 'Queensland', value: 49296 },
];

describe('the licence travels inside the file', () => {
  it('names the licence and links it', () => {
    const csv = toCsv(rows, columns, provenance);
    expect(csv).toContain(
      '# Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)',
    );
  });

  it('carries the required attribution wording verbatim', () => {
    expect(toCsv(rows, columns, provenance)).toContain(
      '# Attribution: Based on Jobs and Skills Australia data.',
    );
  });

  it('says what was calculated here rather than published', () => {
    const csv = toCsv(rows, columns, provenance);
    expect(csv).toContain('# Derivation: Summed from the regions');
  });

  it('states the reference period and where the file came from', () => {
    const csv = toCsv(rows, columns, provenance);
    expect(csv).toContain('# Reference period: July 2026');
    expect(csv).toContain('# Source: https://example.test/data-and-licensing');
    expect(csv).toContain('# Retrieved: 2026-09-09T00:00:00.000Z');
  });

  it('repeats the one caveat that matters most', () => {
    expect(toCsv(rows, columns, provenance)).toContain(
      'Figures count online job advertisements, not vacancies.',
    );
  });

  it('carries the same provenance in JSON', () => {
    const parsed = JSON.parse(toJson(rows, columns, provenance)) as {
      provenance: Record<string, unknown>;
      rows: Record<string, unknown>[];
    };
    expect(parsed.provenance['licence']).toBe('CC BY 4.0');
    expect(parsed.provenance['attribution']).toBe(
      'Based on Jobs and Skills Australia data.',
    );
    expect(parsed.provenance['retrievedAt']).toBe('2026-09-09T00:00:00.000Z');
  });
});

describe('csv escaping', () => {
  it('quotes a heading containing a comma', () => {
    // Not hypothetical: "Advertisements, previous period" is a real column.
    const withComma: DatasetColumn<Row>[] = [
      { key: 'name', heading: 'Advertisements, previous period', value: (r) => r.name },
    ];
    const csv = toCsv(rows, withComma, provenance);
    expect(csv).toContain('"Advertisements, previous period"');
  });

  it('quotes and doubles an embedded quote', () => {
    const csv = toCsv([{ name: 'The "Big" State', value: 1 }], columns, provenance);
    expect(csv).toContain('"The ""Big"" State"');
  });

  it('quotes a value containing a newline', () => {
    const csv = toCsv([{ name: 'Two\nLines', value: 1 }], columns, provenance);
    expect(csv).toContain('"Two\nLines"');
  });

  it('leaves an ordinary value unquoted', () => {
    expect(toCsv(rows, columns, provenance)).toContain('New South Wales,60675');
  });

  it('writes an absent figure as empty rather than as zero', () => {
    // The distinction the whole product rests on, and a file is the easiest
    // place to lose it.
    const csv = toCsv([{ name: 'Tasmania', value: null }], columns, provenance);
    expect(csv).toContain('Tasmania,\r\n');
    expect(csv).not.toContain('Tasmania,0');
  });

  it('separates rows with CRLF, as the format specifies', () => {
    const csv = toCsv(rows, columns, provenance);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n').at(-2)).toBe('Queensland,49296');
  });
});

describe('json shape', () => {
  it('keys each row by the column key rather than its heading', () => {
    const parsed = JSON.parse(toJson(rows, columns, provenance)) as {
      rows: Record<string, unknown>[];
    };
    expect(parsed.rows[0]).toEqual({ name: 'New South Wales', value: 60675 });
  });

  it('keeps an absent figure null rather than zero', () => {
    const parsed = JSON.parse(
      toJson([{ name: 'Tasmania', value: null }], columns, provenance),
    ) as { rows: Record<string, unknown>[] };
    expect(parsed.rows[0]?.['value']).toBeNull();
  });
});

describe('filenames', () => {
  it('says what the file is and which release it belongs to', () => {
    expect(datasetFilename('advertisements-by-state', 'July 2026', 'csv')).toBe(
      'advertisements-by-state-july-2026.csv',
    );
  });

  it('omits the period when there is none rather than inventing one', () => {
    expect(datasetFilename('advertisements-by-state', null, 'json')).toBe(
      'advertisements-by-state.json',
    );
  });
});
