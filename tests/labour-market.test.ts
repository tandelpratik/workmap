import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import * as prismaEnums from '@/db/generated/client/enums';
import { getDatabase } from '@/db/client';
import { listByLevel } from '@/db/repositories/geography';
import { countSeries } from '@/db/repositories/labour-market';
import {
  buildSeriesKey,
  describeSeries,
  formatPeriod,
  makeObservation,
  metricBases,
  metricLanguageViolations,
  observationIsConsistent,
  periodGranularities,
  startOfPeriod,
  valueStates,
  type SeriesDefinition,
} from '@/domain/labour-market';
import {
  buildGeographyLookup,
  resolveGeography,
  resolveOccupation,
  type GeographyCandidate,
  type OccupationCandidate,
} from '@/ingestion/dimensions';
import { importJsaIvi } from '@/ingestion/jsa-ivi';
import {
  IVI_MEASURE,
  parseIviWorkbook,
  parsePeriodLabel,
  readValueCell,
} from '@/integrations/jsa/ivi';
import { readWorkbook, type Cell, type Worksheet } from '@/integrations/jsa/workbook';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Database sections skip.
}

const withDatabase = describe.skipIf(!process.env['DATABASE_URL']);

function sheet(name: string, rows: readonly (readonly Cell[])[]): Worksheet {
  return { name, rows };
}

function definition(overrides: Partial<SeriesDefinition> = {}): SeriesDefinition {
  return {
    sourceKey: 'jsa-ivi',
    dataset: 'Internet Vacancy Index',
    measure: IVI_MEASURE,
    unit: 'advertisements',
    basis: 'OFFICIAL',
    granularity: 'MONTH',
    geography: { code: '1', name: 'New South Wales' },
    occupation: { code: '2211', name: 'Accountants' },
    qualifiers: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

describe('domain and persistence enums agree', () => {
  const cases: ReadonlyArray<[string, readonly string[], Record<string, string>]> = [
    ['MetricBasis', metricBases, prismaEnums.MetricBasis],
    ['ValueState', valueStates, prismaEnums.ValueState],
    ['PeriodGranularity', periodGranularities, prismaEnums.PeriodGranularity],
  ];

  for (const [name, domainValues, prismaEnum] of cases) {
    it(`${name} matches the database enum`, () => {
      expect([...domainValues].sort()).toEqual(Object.values(prismaEnum).sort());
    });
  }
});

describe('observations pair a value with a state (ADR-0002)', () => {
  const january = new Date(Date.UTC(2026, 0, 1));

  it('keeps a present value', () => {
    expect(makeObservation(january, 'PRESENT', 1200)).toEqual({
      periodStart: january,
      value: 1200,
      valueState: 'PRESENT',
    });
  });

  it('stores a measured zero as zero, not as nothing', () => {
    expect(makeObservation(january, 'ZERO').value).toBe(0);
  });

  it('refuses a present observation with no value', () => {
    expect(() => makeObservation(january, 'PRESENT', null)).toThrow();
  });

  it('refuses to hide a value behind a zero state', () => {
    expect(() => makeObservation(january, 'ZERO', 500)).toThrow();
  });

  it('drops any value attached to an absent state', () => {
    for (const state of ['UNAVAILABLE', 'SUPPRESSED', 'NOT_COVERED'] as const) {
      expect(makeObservation(january, state, 900).value).toBeNull();
    }
  });

  it('recognises an inconsistent pair', () => {
    expect(
      observationIsConsistent({
        periodStart: january,
        value: 5,
        valueState: 'SUPPRESSED',
      }),
    ).toBe(false);
    expect(
      observationIsConsistent({ periodStart: january, value: 0, valueState: 'ZERO' }),
    ).toBe(true);
  });
});

describe('series identity', () => {
  it('is stable for the same definition', () => {
    expect(buildSeriesKey(definition())).toBe(buildSeriesKey(definition()));
  });

  it('is built from what the source stated, so later resolution cannot split it', () => {
    // No identifier the product assigns appears in the key. When milestone 11
    // loads the occupation classification and this series starts resolving,
    // the key must not move or the history splits in two.
    const key = buildSeriesKey(definition());
    expect(key).toContain('g:c.1');
    expect(key).toContain('o:c.2211');
  });

  it('separates different geographies', () => {
    expect(buildSeriesKey(definition())).not.toBe(
      buildSeriesKey(definition({ geography: { code: '2', name: 'Victoria' } })),
    );
  });

  it('separates series that differ only by a qualifier', () => {
    expect(buildSeriesKey(definition({ qualifiers: { Adjustment: 'Trend' } }))).not.toBe(
      buildSeriesKey(definition({ qualifiers: { Adjustment: 'Original' } })),
    );
  });

  it('does not depend on the order qualifiers were read in', () => {
    expect(
      buildSeriesKey(definition({ qualifiers: { Adjustment: 'Trend', Level: '4' } })),
    ).toBe(
      buildSeriesKey(definition({ qualifiers: { Level: '4', Adjustment: 'Trend' } })),
    );
  });

  it('describes itself in terms a reader can check', () => {
    const description = describeSeries(definition());
    expect(description).toContain(IVI_MEASURE);
    expect(description).toContain('New South Wales');
    expect(description).toContain('Internet Vacancy Index');
  });
});

describe('periods', () => {
  it('normalises to the first day of the period', () => {
    const mid = new Date(Date.UTC(2026, 6, 17));
    expect(startOfPeriod(mid, 'MONTH').toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(startOfPeriod(mid, 'QUARTER').toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(startOfPeriod(mid, 'YEAR').toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('formats a reference period', () => {
    const july = new Date(Date.UTC(2026, 6, 1));
    expect(formatPeriod(july, 'MONTH')).toBe('2026-07');
    expect(formatPeriod(july, 'QUARTER')).toBe('2026-Q3');
    expect(formatPeriod(july, 'YEAR')).toBe('2026');
  });
});

describe('metric language rules (ADR-0002)', () => {
  it('rejects describing an advertisement count as vacancies', () => {
    expect(metricLanguageViolations('Total vacancies in Australia')).toContain(
      'total vacancies',
    );
    expect(metricLanguageViolations('All jobs in Australia')).not.toHaveLength(0);
  });

  it('accepts the wording this product uses', () => {
    expect(metricLanguageViolations(IVI_MEASURE)).toHaveLength(0);
    expect(metricLanguageViolations(describeSeries(definition()))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Dimension resolution
// ---------------------------------------------------------------------------

describe('geography resolution', () => {
  const areas: GeographyCandidate[] = [
    { id: 'aus', code: 'AUS', name: 'Australia', level: 'COUNTRY' },
    { id: 'outside-country', code: 'ZZZ', name: 'Outside Australia', level: 'COUNTRY' },
    { id: 'nsw', code: '1', name: 'New South Wales', level: 'STATE' },
    { id: 'vic', code: '2', name: 'Victoria', level: 'STATE' },
    { id: 'sydney', code: '102', name: 'Sydney - Baulkham Hills', level: 'SA4' },
    { id: 'outside-sa4', code: 'ZZZ', name: 'Outside Australia', level: 'SA4' },
  ];
  const lookup = buildGeographyLookup(areas);

  it('resolves by code', () => {
    expect(resolveGeography(lookup, { code: '102', name: null })).toEqual({
      status: 'RESOLVED',
      id: 'sydney',
      level: 'SA4',
    });
  });

  it('refuses a code that exists at more than one level', () => {
    // The collision that silently overwrote a country row at milestone 04.
    const result = resolveGeography(lookup, { code: 'ZZZ', name: null });
    expect(result.status).toBe('UNRESOLVED');
    expect(result.status === 'UNRESOLVED' && result.reason).toContain('ambiguous');
  });

  it('resolves a state by its full name', () => {
    expect(resolveGeography(lookup, { code: null, name: 'New South Wales' })).toEqual({
      status: 'RESOLVED',
      id: 'nsw',
      level: 'STATE',
    });
  });

  it('resolves a state abbreviation to the same area as its full name', () => {
    expect(resolveGeography(lookup, { code: null, name: 'NSW' })).toEqual(
      resolveGeography(lookup, { code: null, name: 'New South Wales' }),
    );
  });

  it('tolerates a numeric code padded differently', () => {
    expect(resolveGeography(lookup, { code: '01', name: null })).toEqual({
      status: 'RESOLVED',
      id: 'nsw',
      level: 'STATE',
    });
  });

  it('leaves an unknown region unresolved rather than approximating it', () => {
    const result = resolveGeography(lookup, {
      code: null,
      name: 'Sydney Inner Ring',
    });
    expect(result.status).toBe('UNRESOLVED');
  });

  it('does not match on a prefix', () => {
    expect(resolveGeography(lookup, { code: null, name: 'Sydney' }).status).toBe(
      'UNRESOLVED',
    );
  });
});

describe('occupation resolution', () => {
  const byCode = new Map<string, OccupationCandidate[]>([
    ['2211', [{ id: 'acc', code: '2211', classificationVersion: 'ANZSCO-1.3' }]],
    [
      '1111',
      [
        { id: 'a', code: '1111', classificationVersion: 'ANZSCO-1.3' },
        { id: 'b', code: '1111', classificationVersion: 'OSCA-1.0' },
      ],
    ],
  ]);

  it('resolves a known code', () => {
    expect(resolveOccupation(byCode, { code: '2211', name: null })).toEqual({
      status: 'RESOLVED',
      id: 'acc',
    });
  });

  it('never matches on a title', () => {
    expect(resolveOccupation(byCode, { code: null, name: 'Accountants' }).status).toBe(
      'UNRESOLVED',
    );
  });

  it('refuses a code present in two classification versions', () => {
    expect(resolveOccupation(byCode, { code: '1111', name: null }).status).toBe(
      'UNRESOLVED',
    );
  });

  it('leaves everything unresolved while no classification is loaded', () => {
    const empty = new Map<string, OccupationCandidate[]>();
    const result = resolveOccupation(empty, { code: '2211', name: 'Accountants' });
    expect(result.status).toBe('UNRESOLVED');
    expect(result.status === 'UNRESOLVED' && result.reason).toContain('2211');
  });
});

// ---------------------------------------------------------------------------
// Reading a workbook
// ---------------------------------------------------------------------------

describe('period headers', () => {
  const cases: ReadonlyArray<[Cell, string]> = [
    ['Jan-06', '2006-01'],
    ['Jan 2006', '2006-01'],
    ['January 2006', '2006-01'],
    ['Mar-24', '2024-03'],
    ['2006-01', '2006-01'],
    ['2026/07', '2026-07'],
    [new Date(Date.UTC(2026, 6, 15)), '2026-07'],
  ];

  for (const [cell, expected] of cases) {
    it(`reads ${String(cell)} as ${expected}`, () => {
      const parsed = parsePeriodLabel(cell);
      expect(parsed).not.toBeNull();
      expect(parsed && formatPeriod(parsed.periodStart, parsed.granularity)).toBe(
        expected,
      );
    });
  }

  it('reads quarters and years', () => {
    const quarter = parsePeriodLabel('Q3 2026');
    expect(quarter && formatPeriod(quarter.periodStart, quarter.granularity)).toBe(
      '2026-Q3',
    );
    const year = parsePeriodLabel(2026);
    expect(year && formatPeriod(year.periodStart, year.granularity)).toBe('2026');
  });

  it('does not read a bare number as an Excel date serial', () => {
    // 38718 is 2006-01-31 as an Excel serial. Guessing that would date a whole
    // column wrongly, so it is not a period at all.
    expect(parsePeriodLabel(38718)).toBeNull();
  });

  it('is not fooled by ordinary text', () => {
    expect(parsePeriodLabel('ANZSCO_CODE')).toBeNull();
    expect(parsePeriodLabel('Notes')).toBeNull();
  });
});

describe('value cells', () => {
  it('reads numbers, including a genuine zero', () => {
    expect(readValueCell(1200)).toEqual({ ok: true, state: 'PRESENT', value: 1200 });
    expect(readValueCell(0)).toEqual({ ok: true, state: 'ZERO', value: 0 });
    expect(readValueCell('1,234')).toEqual({ ok: true, state: 'PRESENT', value: 1234 });
  });

  it('treats a blank cell as unavailable, never as zero', () => {
    expect(readValueCell(null)).toEqual({
      ok: true,
      state: 'UNAVAILABLE',
      value: null,
    });
    expect(readValueCell('  ')).toEqual({
      ok: true,
      state: 'UNAVAILABLE',
      value: null,
    });
  });

  it('reads the two unambiguous absence notations', () => {
    expect(readValueCell('np')).toEqual({
      ok: true,
      state: 'SUPPRESSED',
      value: null,
    });
    expect(readValueCell('..')).toEqual({
      ok: true,
      state: 'NOT_COVERED',
      value: null,
    });
  });

  it('refuses to interpret a hyphen', () => {
    // In ABS notation "-" can mean nil and can mean rounded to zero. Choosing
    // either would invent a measurement, so the cell is reported instead.
    expect(readValueCell('-')).toEqual({ ok: false, raw: '-' });
  });
});

describe('reading an IVI workbook', () => {
  const dataSheet = sheet('Occupation by state', [
    ['Internet Vacancy Index'],
    ['Jobs and Skills Australia'],
    [],
    ['ANZSCO_CODE', 'ANZSCO_TITLE', 'State', 'Jan-06', 'Feb-06'],
    ['2211', 'Accountants', 'New South Wales', 111, 222],
    ['2211', 'Accountants', 'Victoria', 333, 444],
  ]);

  it('finds the header row beneath the title rows', () => {
    const result = parseIviWorkbook([dataSheet]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [report] = result.value.sheets;
    expect(report?.status).toBe('PARSED');
    expect(report?.headerRow).toBe(4);
    expect(report?.periodColumns).toBe(2);
    expect(report?.dataRows).toBe(2);
    expect(result.value.series).toHaveLength(2);
    expect(result.value.observations).toBe(4);
  });

  it('attributes every figure to the dimensions its row stated', () => {
    const result = parseIviWorkbook([dataSheet]);
    if (!result.ok) throw new Error('expected a parse');

    const nsw = result.value.series.find(
      (series) => series.definition.geography.name === 'New South Wales',
    );
    expect(nsw?.definition.occupation).toEqual({ code: '2211', name: 'Accountants' });
    expect(nsw?.definition.basis).toBe('OFFICIAL');
    expect(nsw?.observations.map((observation) => observation.value)).toEqual([111, 222]);
  });

  it('records every value state without inventing a zero', () => {
    const result = parseIviWorkbook([
      sheet('States', [
        ['State', 'Jan-06', 'Feb-06', 'Mar-06', 'Apr-06', 'May-06', 'Jun-06'],
        ['New South Wales', 0, 'np', '..', '1,234', '-', null],
      ]),
    ]);
    if (!result.ok) throw new Error('expected a parse');

    const [series] = result.value.series;
    expect(series?.observations.map((observation) => observation.valueState)).toEqual([
      'ZERO',
      'SUPPRESSED',
      'NOT_COVERED',
      'PRESENT',
      'UNAVAILABLE',
    ]);
    // The hyphen is quarantined rather than becoming a figure.
    expect(result.value.problems).toHaveLength(1);
    expect(result.value.problems[0]?.kind).toBe('UNREADABLE_VALUE');
    expect(result.value.problems[0]?.column).toBe('May-06');
  });

  it('keeps an unrecognised column as a qualifier so it cannot merge two series', () => {
    const result = parseIviWorkbook([
      sheet('Adjusted', [
        ['State', 'Adjustment', 'Jan-06', 'Feb-06'],
        ['New South Wales', 'Original', 111, 112],
        ['New South Wales', 'Trend', 222, 223],
      ]),
    ]);
    if (!result.ok) throw new Error('expected a parse');

    expect(result.value.series).toHaveLength(2);
    expect(result.value.sheets[0]?.qualifierColumns).toEqual(['Adjustment']);
    const values = result.value.series
      .flatMap((series) => series.observations.map((observation) => observation.value))
      .sort((a, b) => Number(a) - Number(b));
    expect(values).toEqual([111, 112, 222, 223]);
  });

  it('drops an identical repeat of a row', () => {
    const result = parseIviWorkbook([
      sheet('Repeat', [
        ['State', 'Jan-06', 'Feb-06'],
        ['New South Wales', 111, 222],
        ['New South Wales', 111, 222],
      ]),
    ]);
    if (!result.ok) throw new Error('expected a parse');

    expect(result.value.series).toHaveLength(1);
    expect(result.value.observations).toBe(2);
    expect(result.value.duplicatesDropped).toBe(2);
    expect(result.value.problems).toHaveLength(0);
  });

  it('quarantines two rows that disagree, and keeps the first', () => {
    const result = parseIviWorkbook([
      sheet('Conflict', [
        ['State', 'Jan-06', 'Feb-06'],
        ['New South Wales', 111, 112],
        ['New South Wales', 999, 112],
      ]),
    ]);
    if (!result.ok) throw new Error('expected a parse');

    expect(result.value.series[0]?.observations[0]?.value).toBe(111);
    expect(result.value.problems).toHaveLength(1);
    expect(result.value.problems[0]?.kind).toBe('CONFLICTING_DUPLICATE');
    // The February figures agree, so that repeat is a duplicate, not a conflict.
    expect(result.value.duplicatesDropped).toBe(1);
  });

  it('quarantines a row that names nothing to attribute figures to', () => {
    const result = parseIviWorkbook([
      sheet('Orphan', [
        ['State', 'Jan-06', 'Feb-06'],
        ['New South Wales', 111, 112],
        [null, 999, 998],
      ]),
    ]);
    if (!result.ok) throw new Error('expected a parse');

    expect(result.value.problems[0]?.kind).toBe('NO_DIMENSIONS');
  });

  it('skips a sheet whose dimension columns it does not recognise, and says which', () => {
    const result = parseIviWorkbook([
      dataSheet,
      sheet('Renamed', [
        ['Widget group', 'Jan-06', 'Feb-06'],
        ['Something', 1, 2],
      ]),
    ]);
    if (!result.ok) throw new Error('expected a parse');

    const renamed = result.value.sheets.find((report) => report.sheet === 'Renamed');
    expect(renamed?.status).toBe('SKIPPED');
    expect(renamed?.reason).toContain('no recognised dimension column');
    expect(renamed?.unmatchedHeaders).toContain('Widget group');
  });

  it('fails when nothing in the workbook can be read', () => {
    const result = parseIviWorkbook([
      sheet('Notes', [['This release explains the methodology.'], ['Contact JSA.']]),
    ]);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('INVALID_INPUT');
  });

  it('refuses labelling that calls the index a count of vacancies', () => {
    const result = parseIviWorkbook([dataSheet], { measure: 'Total vacancies' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message).toContain('online job advertisements');
  });
});

// ---------------------------------------------------------------------------
// A real file, end to end
// ---------------------------------------------------------------------------

/**
 * A synthetic workbook shaped like a wide monthly release.
 *
 * The figures are invented and exist only to exercise the reader. They are
 * never imported into a database that outlives a test: the import test below
 * runs inside a transaction that is rolled back, so no fabricated figure can
 * be stored under an official source (ADR-0009).
 */
async function fixtureWorkbook(): Promise<Buffer> {
  return writeXlsxFile([
    {
      sheet: 'Notes',
      data: [[{ value: 'Fixture workbook. The figures are not real.', type: String }]],
    },
    {
      sheet: 'Occupation by state',
      data: [
        [{ value: 'Fixture release', type: String }],
        [],
        [
          { value: 'ANZSCO_CODE', type: String },
          { value: 'ANZSCO_TITLE', type: String },
          { value: 'State', type: String },
          { value: 'Jan-06', type: String },
          { value: 'Feb-06', type: String },
        ],
        [
          { value: '2211', type: String },
          { value: 'Accountants', type: String },
          { value: 'New South Wales', type: String },
          { value: 111, type: Number },
          { value: 222, type: Number },
        ],
        [
          { value: '2211', type: String },
          { value: 'Accountants', type: String },
          { value: 'Nowhere Region', type: String },
          { value: 333, type: Number },
          { value: 0, type: Number },
        ],
      ],
    },
  ]).toBuffer();
}

describe('a real xlsx file', () => {
  it('is read and parsed from its bytes', async () => {
    const workbook = await readWorkbook(await fixtureWorkbook());
    expect(workbook.ok).toBe(true);
    if (!workbook.ok) return;

    expect(workbook.value.map((worksheet) => worksheet.name)).toEqual([
      'Notes',
      'Occupation by state',
    ]);

    const parsed = parseIviWorkbook(workbook.value);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.value.series).toHaveLength(2);
    expect(parsed.value.observations).toBe(4);
    expect(parsed.value.sheets.find((report) => report.sheet === 'Notes')?.status).toBe(
      'SKIPPED',
    );

    const zero = parsed.value.series
      .flatMap((series) => series.observations)
      .find((observation) => observation.valueState === 'ZERO');
    expect(zero?.value).toBe(0);
  });

  it('rejects a file that is not a spreadsheet', async () => {
    const result = await readWorkbook(Buffer.from('not a spreadsheet'));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('INVALID_INPUT');
  });
});

// ---------------------------------------------------------------------------
// Against the loaded registry
// ---------------------------------------------------------------------------

withDatabase('resolution against the ABS registry', () => {
  it('resolves state names and abbreviations to the loaded areas', async () => {
    const countries = await listByLevel('ASGS2026', 'COUNTRY');
    const states = await listByLevel('ASGS2026', 'STATE');
    const sa4s = await listByLevel('ASGS2026', 'SA4');
    if (!countries.ok || !states.ok || !sa4s.ok) throw new Error('registry unreadable');

    const lookup = buildGeographyLookup([
      ...countries.value,
      ...states.value,
      ...sa4s.value,
    ]);

    const byName = resolveGeography(lookup, { code: null, name: 'New South Wales' });
    const byAbbreviation = resolveGeography(lookup, { code: null, name: 'NSW' });
    expect(byName.status).toBe('RESOLVED');
    expect(byAbbreviation).toEqual(byName);

    // ZZZ is a country and an SA4 in the real registry, so it must not resolve.
    expect(resolveGeography(lookup, { code: 'ZZZ', name: null }).status).toBe(
      'UNRESOLVED',
    );
  });
});

class Rollback extends Error {}

withDatabase('importing a workbook', () => {
  it('writes once, then changes nothing on a second run', async () => {
    const database = getDatabase();
    if (!database.ok) throw new Error('no database');

    // What the table held before this test touched it.
    const baseline = await countSeries('jsa-ivi');
    const seriesBaseline = baseline.ok ? baseline.value : 0;

    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');

    const directory = await mkdtemp(join(tmpdir(), 'workmap-ivi-'));
    const filePath = join(directory, 'fixture-ivi.xlsx');
    await writeFile(filePath, await fixtureWorkbook());

    // Everything below happens inside a transaction that is deliberately
    // rolled back. The fixture's invented figures exercise the real schema,
    // its CHECK constraints and its unique indexes, and none of them survive
    // the test: an official source must never hold fabricated data.
    let first: Awaited<ReturnType<typeof importJsaIvi>> | null = null;
    let second: Awaited<ReturnType<typeof importJsaIvi>> | null = null;
    let third: Awaited<ReturnType<typeof importJsaIvi>> | null = null;
    // Counted as deltas, not absolutes. A real IVI release in the database is
    // a normal state for a developer machine, and asserting "the table holds
    // exactly 2 series" fails the moment anyone imports actual data. What this
    // test is about is what one import writes, so that is what it measures.
    let storedSeries = -1;
    let storedMetrics = -1;

    try {
      await database.value.$transaction(
        async (tx) => {
          const seriesBefore = await tx.labourMarketSeries.count({
            where: { sourceKey: 'jsa-ivi' },
          });
          const metricsBefore = await tx.labourMarketMetric.count({
            where: { series: { sourceKey: 'jsa-ivi' } },
          });
          first = await importJsaIvi({
            filePath,
            client: tx,
            triggeredBy: 'test',
          });
          second = await importJsaIvi({ filePath, client: tx, triggeredBy: 'test' });
          third = await importJsaIvi({
            filePath,
            client: tx,
            force: true,
            triggeredBy: 'test',
          });

          storedSeries =
            (await tx.labourMarketSeries.count({ where: { sourceKey: 'jsa-ivi' } })) -
            seriesBefore;
          storedMetrics =
            (await tx.labourMarketMetric.count({
              where: { series: { sourceKey: 'jsa-ivi' } },
            })) - metricsBefore;

          throw new Rollback();
        },
        { timeout: 120_000, maxWait: 30_000 },
      );
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }

    const firstRun = first as Awaited<ReturnType<typeof importJsaIvi>> | null;
    if (firstRun === null || !firstRun.ok) {
      throw new Error(
        `first import failed: ${firstRun === null ? 'not run' : firstRun.error.message}`,
      );
    }

    expect(firstRun.value.status).toBe('COMPLETED');
    expect(firstRun.value.seriesWritten).toBe(2);
    expect(firstRun.value.written).toBe(4);
    expect(firstRun.value.quarantined).toBe(0);
    // One geography is a real state, the other is invented and must stay
    // unresolved with the source's own label kept.
    expect(firstRun.value.geography.resolved).toBe(1);
    expect(firstRun.value.geography.examples).toContain('Nowhere Region');
    // Nothing resolves until the occupation classification is loaded.
    expect(firstRun.value.occupation.resolved).toBe(0);

    const secondRun = second as Awaited<ReturnType<typeof importJsaIvi>> | null;
    if (secondRun === null || !secondRun.ok) throw new Error('second import failed');
    expect(secondRun.value.status).toBe('SKIPPED_UNCHANGED');

    const thirdRun = third as Awaited<ReturnType<typeof importJsaIvi>> | null;
    if (thirdRun === null || !thirdRun.ok) throw new Error('third import failed');
    expect(thirdRun.value.status).toBe('COMPLETED');
    // The forced re-import reads the same file and writes nothing at all.
    expect(thirdRun.value.written).toBe(0);
    expect(thirdRun.value.skipped).toBe(4);

    expect(storedSeries).toBe(2);
    expect(storedMetrics).toBe(4);

    // And none of it was kept: the rollback leaves the table exactly as the
    // test found it, whether that was empty or held a real release.
    const remaining = await countSeries('jsa-ivi');
    expect(remaining.ok && remaining.value).toBe(seriesBaseline);
  }, 180_000);
});
