import {
  buildSeriesKey,
  makeObservation,
  metricLanguageViolations,
  slug,
  startOfPeriod,
  formatPeriod,
  type Observation,
  type ParsedSeries,
  type PeriodGranularity,
  type SeriesDefinition,
  type SourceDimension,
  type ValueState,
} from '@/domain/labour-market';
import { failure, type Failure } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
import { cellText, type Cell, type Worksheet } from './workbook';

/**
 * Reader for the Jobs and Skills Australia Internet Vacancy Index workbooks.
 *
 * The IVI is published as a wide matrix: some columns identify what is being
 * counted and where, and the rest are one column per reference period. This
 * module turns that shape into domain series without knowing the specific
 * layout of any one release.
 *
 * That is deliberate. The milestone requires the importer to survive changed
 * column names, and a hard-coded column map cannot: it would either break or,
 * far worse, quietly read the wrong column. So the layout is discovered from
 * the file and every decision is reported:
 *
 *   - the header row is found by looking for a row that names at least one
 *     dimension and at least two reference periods;
 *   - dimension columns are matched against alias sets, case and punctuation
 *     insensitively;
 *   - a column that is neither a period nor a known dimension becomes a
 *     qualifier, so an unrecognised dimension splits series correctly instead
 *     of being dropped and merging two different series into one;
 *   - anything that cannot be classified is reported rather than assumed, and
 *     a workbook where nothing matches fails with the headers it actually saw.
 *
 * Nothing here decides that a figure is zero. Only a numeric zero in the file
 * produces ZERO (ADR-0002).
 */

export const JSA_SOURCE_KEY = 'jsa-ivi';

/**
 * Default labelling for the series this reader produces.
 *
 * The measure wording comes from ADR-0002, which fixes how an
 * advertisement-based indicator must be described. It is never "vacancies".
 */
export const IVI_DATASET = 'Internet Vacancy Index';
export const IVI_MEASURE = 'Online job advertisements';
export const IVI_UNIT = 'advertisements';

/** Rows scanned for a header before a sheet is given up on. */
const DEFAULT_HEADER_SCAN_ROWS = 25;

/** A header row must name at least this many periods to be believable. */
const MIN_PERIOD_COLUMNS = 2;

export interface IviReadOptions {
  readonly dataset?: string;
  readonly measure?: string;
  readonly unit?: string;
  readonly headerScanRows?: number;
}

// ---------------------------------------------------------------------------
// Header vocabulary
// ---------------------------------------------------------------------------

type DimensionRole =
  | 'occupationCode'
  | 'occupationName'
  | 'geographyCode'
  | 'geographyName'
  /** Which ASGS level the row's code belongs to, when the file says. */
  | 'geographyLevel';

/**
 * Header spellings that identify a dimension column.
 *
 * Compared after normalisation, so "ANZSCO_CODE", "ANZSCO Code" and
 * "anzsco code" are one entry. This list is the only assumption the reader
 * makes about a release, it is cheap to extend, and a header that matches
 * nothing here is reported rather than ignored.
 */
const dimensionAliases: Record<DimensionRole, readonly string[]> = {
  occupationCode: [
    'anzsco code',
    'anzsco',
    'anzsco id',
    'occupation code',
    'occupation id',
    'osca code',
    'code',
  ],
  occupationName: [
    'anzsco title',
    'anzsco name',
    'anzsco description',
    'occupation',
    'occupation title',
    'occupation name',
    'osca title',
    'title',
  ],
  geographyCode: [
    'state code',
    'region code',
    'sa4 code',
    'asgs code',
    'geography code',
    'area code',
  ],
  /**
   * Ordered most specific first. Order is precedence, not preference: a
   * regional release carries both a `State` column and a `region_name`
   * column, and the region is the subject of the row while the state is
   * context. Reading the state as the area name labelled SA4 101 "NSW"
   * instead of "Capital Region", which is why order is load-bearing here and
   * why dimensionFrom selects by rank rather than by column position.
   */
  geographyName: [
    'region name',
    'sa4 name',
    'sa4',
    'gccsa name',
    'gccsa',
    'ivi region',
    'region',
    'geography',
    'location',
    'area',
    'state',
    'state territory',
    'state and territory',
    'states and territories',
  ],
  geographyLevel: ['region level', 'geography level', 'asgs level', 'level type'],
};

/** Lowercase, punctuation flattened to single spaces. */
function normaliseHeader(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * The role a header plays, and how specific the match was.
 *
 * `rank` is the alias's position in its list, lowest being most specific. It
 * exists so that a sheet carrying two columns for one role resolves to the
 * more specific of them rather than to whichever appears first.
 */
function dimensionRoleOf(header: string): { role: DimensionRole; rank: number } | null {
  const normalised = normaliseHeader(header);
  for (const [role, aliases] of Object.entries(dimensionAliases)) {
    const rank = aliases.indexOf(normalised);
    if (rank !== -1) return { role: role as DimensionRole, rank };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Period headers
// ---------------------------------------------------------------------------

const monthNames = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

function monthIndexOf(name: string): number | null {
  const normalised = name.toLowerCase();
  const index = monthNames.findIndex(
    (month) => month === normalised || month.slice(0, 3) === normalised.slice(0, 3),
  );
  return index === -1 ? null : index;
}

/**
 * Two-digit years, resolved against a 1980 pivot.
 *
 * "Jan-06" is 2006, not 1906. The IVI series begins in 2006 and no Australian
 * labour series this product will carry predates 1980, so the pivot cannot
 * misread a real header.
 */
function expandYear(year: number): number {
  if (year >= 100) return year;
  return year < 80 ? 2000 + year : 1900 + year;
}

export interface ParsedPeriod {
  readonly periodStart: Date;
  readonly granularity: PeriodGranularity;
}

/**
 * Reads a reference period from a header cell, or returns null when the cell
 * is not a period at all.
 *
 * A bare number is only read as a year, never as an Excel date serial: a cell
 * holding 38718 is ambiguous, and guessing would silently date a whole column
 * wrongly. Date-formatted cells arrive as real dates and are read as such.
 */
export function parsePeriodLabel(cell: Cell): ParsedPeriod | null {
  if (cell instanceof Date) {
    return { periodStart: startOfPeriod(cell, 'MONTH'), granularity: 'MONTH' };
  }

  if (typeof cell === 'number') {
    if (Number.isInteger(cell) && cell >= 1900 && cell <= 2100) {
      return { periodStart: new Date(Date.UTC(cell, 0, 1)), granularity: 'YEAR' };
    }
    return null;
  }

  const text = cellText(cell);
  if (text === null) return null;
  const compact = text.replace(/\s+/g, ' ').trim();

  // Jan-06, Jan 2006, January 2006, Jan.06
  const monthFirst = /^([A-Za-z]{3,9})[\s./-]+(\d{2}|\d{4})$/.exec(compact);
  if (monthFirst) {
    const month = monthIndexOf(monthFirst[1] ?? '');
    const year = Number(monthFirst[2]);
    if (month !== null && Number.isFinite(year)) {
      return {
        periodStart: new Date(Date.UTC(expandYear(year), month, 1)),
        granularity: 'MONTH',
      };
    }
  }

  // 2006-01, 2006/01
  const yearMonth = /^(\d{4})[/-](\d{1,2})$/.exec(compact);
  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Number(yearMonth[2]);
    if (month >= 1 && month <= 12) {
      return {
        periodStart: new Date(Date.UTC(year, month - 1, 1)),
        granularity: 'MONTH',
      };
    }
  }

  // Q1 2006, 2006 Q1
  const quarter =
    /^Q([1-4])[\s-]+(\d{4})$/i.exec(compact) ?? /^(\d{4})[\s-]+Q([1-4])$/i.exec(compact);
  if (quarter) {
    const [first, second] = [quarter[1] ?? '', quarter[2] ?? ''];
    const isQuarterFirst = first.length === 1;
    const quarterNumber = Number(isQuarterFirst ? first : second);
    const year = Number(isQuarterFirst ? second : first);
    return {
      periodStart: new Date(Date.UTC(year, (quarterNumber - 1) * 3, 1)),
      granularity: 'QUARTER',
    };
  }

  // 2006
  const yearOnly = /^(\d{4})$/.exec(compact);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    if (year >= 1900 && year <= 2100) {
      return { periodStart: new Date(Date.UTC(year, 0, 1)), granularity: 'YEAR' };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * Notations that state why a figure is absent.
 *
 * Only the two that are unambiguous in Australian official statistics are
 * mapped: "np" is not available for publication, and ".." is not applicable.
 *
 * "-" is deliberately absent. In ABS notation it can mean nil, and it can mean
 * a figure rounded to zero, and the two are different observations. Mapping it
 * either way would invent a measurement, so a cell holding it is quarantined
 * and an operator resolves it against the release's own notes.
 */
const absenceMarkers: Readonly<Record<string, ValueState>> = {
  np: 'SUPPRESSED',
  'n.p.': 'SUPPRESSED',
  'n.p': 'SUPPRESSED',
  '..': 'NOT_COVERED',
};

type ValueReading =
  | { readonly ok: true; readonly state: ValueState; readonly value: number | null }
  | { readonly ok: false; readonly raw: string };

/** Reads one data cell, or reports that it cannot be read. */
export function readValueCell(cell: Cell): ValueReading {
  if (cell === null) return { ok: true, state: 'UNAVAILABLE', value: null };

  if (typeof cell === 'number') {
    if (!Number.isFinite(cell)) return { ok: false, raw: String(cell) };
    return cell === 0
      ? { ok: true, state: 'ZERO', value: 0 }
      : { ok: true, state: 'PRESENT', value: cell };
  }

  if (cell instanceof Date || typeof cell === 'boolean') {
    return { ok: false, raw: String(cell) };
  }

  const text = cell.trim();
  if (text === '') return { ok: true, state: 'UNAVAILABLE', value: null };

  const marker = absenceMarkers[text.toLowerCase()];
  if (marker !== undefined) return { ok: true, state: marker, value: null };

  // Thousands separators are the only formatting removed. Anything else that
  // is not a number is reported, never coerced.
  const numeric = Number(text.replace(/[,\s]/g, ''));
  if (text !== '' && Number.isFinite(numeric)) {
    return numeric === 0
      ? { ok: true, state: 'ZERO', value: 0 }
      : { ok: true, state: 'PRESENT', value: numeric };
  }

  return { ok: false, raw: text };
}

// ---------------------------------------------------------------------------
// Parse results
// ---------------------------------------------------------------------------

export type RowProblemKind =
  'NO_DIMENSIONS' | 'UNREADABLE_VALUE' | 'CONFLICTING_DUPLICATE';

export interface RowProblem {
  readonly kind: RowProblemKind;
  readonly sheet: string;
  /** 1-based, as a spreadsheet application numbers rows. */
  readonly row: number;
  readonly column?: string;
  readonly seriesKey?: string;
  readonly message: string;
  /** Preserved for the quarantine record, so the cell can be inspected. */
  readonly raw?: string;
}

export interface SheetReport {
  readonly sheet: string;
  readonly status: 'PARSED' | 'SKIPPED';
  readonly reason?: string;
  readonly headerRow?: number;
  readonly dimensionColumns?: readonly string[];
  readonly qualifierColumns?: readonly string[];
  readonly unmatchedHeaders?: readonly string[];
  readonly periodColumns?: number;
  readonly firstPeriod?: string;
  readonly lastPeriod?: string;
  readonly dataRows?: number;
}

export interface IviParseResult {
  readonly series: readonly ParsedSeries[];
  readonly observations: number;
  /** Identical repeats of an observation already read, safely dropped. */
  readonly duplicatesDropped: number;
  readonly problems: readonly RowProblem[];
  readonly sheets: readonly SheetReport[];
}

// ---------------------------------------------------------------------------
// Layout discovery
// ---------------------------------------------------------------------------

interface PeriodColumn extends ParsedPeriod {
  readonly index: number;
  readonly label: string;
}

interface DimensionColumn {
  readonly index: number;
  readonly role: DimensionRole;
  /** Alias specificity; lowest wins when a role has several columns. */
  readonly rank: number;
  readonly label: string;
}

interface QualifierColumn {
  readonly index: number;
  readonly name: string;
}

interface Layout {
  readonly headerRow: number;
  readonly periods: readonly PeriodColumn[];
  readonly dimensions: readonly DimensionColumn[];
  readonly qualifiers: readonly QualifierColumn[];
  readonly unmatched: readonly string[];
}

function classifyRow(row: readonly Cell[]): Layout {
  const periods: PeriodColumn[] = [];
  const dimensions: DimensionColumn[] = [];
  const qualifiers: QualifierColumn[] = [];
  const unmatched: string[] = [];

  row.forEach((cell, index) => {
    const period = parsePeriodLabel(cell);
    if (period !== null) {
      periods.push({ index, label: cellText(cell) ?? '', ...period });
      return;
    }

    const label = cellText(cell);
    if (label === null) return;

    const matched = dimensionRoleOf(label);
    if (matched !== null) {
      dimensions.push({ index, role: matched.role, rank: matched.rank, label });
      return;
    }

    // Unrecognised, but it is a named column in a header row, so it is treated
    // as a dimension we do not have a name for. Recorded in both places: as a
    // qualifier so it distinguishes series, and as unmatched so an operator can
    // see what the reader did not understand.
    qualifiers.push({ index, name: label });
    unmatched.push(label);
  });

  return { headerRow: 0, periods, dimensions, qualifiers, unmatched };
}

/** First row that names a dimension and at least two periods. */
function findLayout(worksheet: Worksheet, scanRows: number): Layout | null {
  const limit = Math.min(scanRows, worksheet.rows.length);

  for (let index = 0; index < limit; index += 1) {
    const row = worksheet.rows[index];
    if (row === undefined) continue;

    const layout = classifyRow(row);
    if (layout.periods.length >= MIN_PERIOD_COLUMNS && layout.dimensions.length > 0) {
      return { ...layout, headerRow: index };
    }
  }

  return null;
}

/**
 * Explains a sheet that could not be read, in terms an operator can act on.
 *
 * The case that matters is a sheet with periods but no recognised dimension:
 * that is a real data sheet whose column names have changed, and the fix is to
 * add the spelling to the alias list above. The message names the headers.
 */
function explainSkip(worksheet: Worksheet, scanRows: number): SheetReport {
  const limit = Math.min(scanRows, worksheet.rows.length);

  for (let index = 0; index < limit; index += 1) {
    const row = worksheet.rows[index];
    if (row === undefined) continue;

    const layout = classifyRow(row);
    if (layout.periods.length >= MIN_PERIOD_COLUMNS) {
      return {
        sheet: worksheet.name,
        status: 'SKIPPED',
        reason:
          `Row ${index + 1} names ${layout.periods.length} reference periods but no ` +
          'recognised dimension column, so its figures cannot be attributed. Add the ' +
          'column spelling to dimensionAliases in integrations/jsa/ivi.ts.',
        headerRow: index + 1,
        periodColumns: layout.periods.length,
        unmatchedHeaders: layout.unmatched.slice(0, 20),
      };
    }
  }

  return {
    sheet: worksheet.name,
    status: 'SKIPPED',
    reason: `No header row naming at least ${MIN_PERIOD_COLUMNS} reference periods was found in the first ${limit} rows.`,
  };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

interface Accumulated {
  readonly definition: SeriesDefinition;
  readonly observations: Map<number, Observation>;
}

function dimensionFrom(
  row: readonly Cell[],
  columns: readonly DimensionColumn[],
  codeRole: DimensionRole,
  nameRole: DimensionRole,
): SourceDimension {
  // Most specific alias wins, not the leftmost column. A regional release has
  // both `State` and `region_name` under geographyName, and the region is the
  // subject of the row.
  const read = (role: DimensionRole): string | null => {
    let best: DimensionColumn | undefined;
    for (const candidate of columns) {
      if (candidate.role !== role) continue;
      if (best === undefined || candidate.rank < best.rank) best = candidate;
    }
    if (best === undefined) return null;
    return cellText(row[best.index] ?? null);
  };

  return { code: read(codeRole), name: read(nameRole) };
}

/**
 * Turns worksheets into series.
 *
 * Returns a failure only when the workbook as a whole yields nothing, because
 * a release containing a cover sheet and a notes sheet alongside the data is
 * normal and must not fail the import.
 */
export function parseIviWorkbook(
  worksheets: readonly Worksheet[],
  options: IviReadOptions = {},
): Result<IviParseResult, Failure> {
  const dataset = options.dataset ?? IVI_DATASET;
  const measure = options.measure ?? IVI_MEASURE;
  const unit = options.unit ?? IVI_UNIT;
  const scanRows = options.headerScanRows ?? DEFAULT_HEADER_SCAN_ROWS;

  // Labelling is checked before anything is read, because these strings are
  // stored on every series and shown next to every figure (ADR-0002).
  const violations = [dataset, measure, unit].flatMap(metricLanguageViolations);
  if (violations.length > 0) {
    return err(
      failure(
        'INVALID_INPUT',
        `Series labelling describes the indicator as a count of vacancies (${[
          ...new Set(violations),
        ].join(', ')}). The Internet Vacancy Index counts online job advertisements.`,
      ),
    );
  }

  const accumulated = new Map<string, Accumulated>();
  const problems: RowProblem[] = [];
  const sheets: SheetReport[] = [];
  let observations = 0;
  let duplicatesDropped = 0;

  for (const worksheet of worksheets) {
    const layout = findLayout(worksheet, scanRows);
    if (layout === null) {
      sheets.push(explainSkip(worksheet, scanRows));
      continue;
    }

    let dataRows = 0;

    for (let index = layout.headerRow + 1; index < worksheet.rows.length; index += 1) {
      const row = worksheet.rows[index];
      if (row === undefined) continue;
      // 1-based, matching what an operator sees in the spreadsheet.
      const rowNumber = index + 1;

      const hasContent = row.some((cell) => cellText(cell) !== null);
      if (!hasContent) continue;

      const geography = dimensionFrom(
        row,
        layout.dimensions,
        'geographyCode',
        'geographyName',
      );
      const occupation = dimensionFrom(
        row,
        layout.dimensions,
        'occupationCode',
        'occupationName',
      );

      const qualifiers: Record<string, string> = {};
      for (const column of layout.qualifiers) {
        const value = cellText(row[column.index] ?? null);
        if (value !== null) qualifiers[column.name] = value;
      }

      const stated =
        geography.code !== null ||
        geography.name !== null ||
        occupation.code !== null ||
        occupation.name !== null;

      if (!stated) {
        problems.push({
          kind: 'NO_DIMENSIONS',
          sheet: worksheet.name,
          row: rowNumber,
          message:
            'Row carries figures but names neither a geography nor an occupation, so ' +
            'they cannot be attributed to anything.',
          raw: row
            .slice(0, 8)
            .map((cell) => cellText(cell) ?? '')
            .join(' | '),
        });
        continue;
      }

      dataRows += 1;

      // One granularity per sheet in practice, but the header is the authority
      // on each column, so the series takes the granularity of its own periods.
      const granularity = layout.periods[0]?.granularity ?? 'MONTH';

      const definition: SeriesDefinition = {
        sourceKey: JSA_SOURCE_KEY,
        dataset,
        measure,
        unit,
        basis: 'OFFICIAL',
        granularity,
        geography,
        occupation,
        qualifiers,
      };
      const seriesKey = buildSeriesKey(definition);

      let series = accumulated.get(seriesKey);
      if (series === undefined) {
        series = { definition, observations: new Map<number, Observation>() };
        accumulated.set(seriesKey, series);
      }

      for (const column of layout.periods) {
        const reading = readValueCell(row[column.index] ?? null);

        if (!reading.ok) {
          problems.push({
            kind: 'UNREADABLE_VALUE',
            sheet: worksheet.name,
            row: rowNumber,
            column: column.label,
            seriesKey,
            message:
              `Cell holds "${reading.raw}", which is neither a number nor a ` +
              'recognised absence notation. It is not assumed to be zero.',
            raw: reading.raw,
          });
          continue;
        }

        const periodStart = startOfPeriod(column.periodStart, column.granularity);
        const observation = makeObservation(periodStart, reading.state, reading.value);
        const at = periodStart.getTime();
        const existing = series.observations.get(at);

        if (existing === undefined) {
          series.observations.set(at, observation);
          observations += 1;
          continue;
        }

        if (
          existing.valueState === observation.valueState &&
          existing.value === observation.value
        ) {
          duplicatesDropped += 1;
          continue;
        }

        // Two rows describing the same series and period disagree. The first
        // reading is kept and the conflict is quarantined: overwriting would
        // make the result depend on row order, and neither figure is known to
        // be the right one.
        problems.push({
          kind: 'CONFLICTING_DUPLICATE',
          sheet: worksheet.name,
          row: rowNumber,
          column: column.label,
          seriesKey,
          message:
            `Period ${formatPeriod(periodStart, column.granularity)} already read as ` +
            `${existing.valueState}/${String(existing.value)} for this series, and this ` +
            `row states ${observation.valueState}/${String(observation.value)}. The ` +
            'first reading was kept.',
          raw: String(observation.value ?? observation.valueState),
        });
      }
    }

    const first = layout.periods[0];
    const last = layout.periods[layout.periods.length - 1];

    sheets.push({
      sheet: worksheet.name,
      status: 'PARSED',
      headerRow: layout.headerRow + 1,
      dimensionColumns: layout.dimensions.map(
        (column) => `${column.label} (${column.role})`,
      ),
      qualifierColumns: layout.qualifiers.map((column) => column.name),
      unmatchedHeaders: layout.unmatched,
      periodColumns: layout.periods.length,
      ...(first
        ? { firstPeriod: formatPeriod(first.periodStart, first.granularity) }
        : {}),
      ...(last ? { lastPeriod: formatPeriod(last.periodStart, last.granularity) } : {}),
      dataRows,
    });
  }

  if (accumulated.size === 0) {
    const seen = sheets
      .map((sheet) => `${sheet.sheet}: ${sheet.reason ?? 'no rows'}`)
      .join('; ');
    return err(
      failure(
        'INVALID_INPUT',
        `No series could be read from this workbook. ${seen || 'It contains no sheets.'}`,
      ),
    );
  }

  const series: ParsedSeries[] = [...accumulated.entries()].map(([seriesKey, entry]) => ({
    seriesKey,
    definition: entry.definition,
    observations: [...entry.observations.values()].sort(
      (a, b) => a.periodStart.getTime() - b.periodStart.getTime(),
    ),
  }));

  return ok({ series, observations, duplicatesDropped, problems, sheets });
}

/** Series key prefix for this dataset, for diagnostics and repository queries. */
export function iviSeriesKeyPrefix(dataset = IVI_DATASET): string {
  return `${slug(JSA_SOURCE_KEY)}|${slug(dataset)}|`;
}
