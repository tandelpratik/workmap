/**
 * Labour market contracts (ADR-0001, ADR-0002).
 *
 * A measured series and its observations, described without reference to any
 * provider. The workbook reader in /integrations produces these; the importer
 * in /ingestion persists them. Neither knows the other's vocabulary, and
 * nothing here knows that JSA publishes spreadsheets.
 *
 * The unions below deliberately do not import Prisma's generated enums, for
 * the reason given in domain/source.ts. A test asserts the two agree, so the
 * duplication cannot drift silently.
 */

import { invariant } from '@/lib/errors';

export const metricBases = ['OFFICIAL', 'DERIVED', 'SYNTHETIC'] as const;
export type MetricBasis = (typeof metricBases)[number];

export const valueStates = [
  'PRESENT',
  'ZERO',
  'UNAVAILABLE',
  'SUPPRESSED',
  'NOT_COVERED',
] as const;
export type ValueState = (typeof valueStates)[number];

export const periodGranularities = ['MONTH', 'QUARTER', 'YEAR'] as const;
export type PeriodGranularity = (typeof periodGranularities)[number];

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

/**
 * One measurement in a series.
 *
 * The value and the state are a pair, not a number with a nullable fallback.
 * A database CHECK enforces the same rule, so a bug in this layer fails at the
 * write rather than turning a gap into a zero (ADR-0002).
 */
export interface Observation {
  /** First day of the reference period, in UTC. */
  readonly periodStart: Date;
  readonly value: number | null;
  readonly valueState: ValueState;
}

/**
 * The only way to build an observation.
 *
 * PRESENT must carry a finite number, ZERO must carry exactly zero, and the
 * three absent states must carry nothing. Allowing the pair to be assembled
 * anywhere else would let a caller attach a value to SUPPRESSED, which the
 * database would reject far from the code that caused it.
 */
export function makeObservation(
  periodStart: Date,
  valueState: ValueState,
  value: number | null = null,
): Observation {
  switch (valueState) {
    case 'PRESENT':
      invariant(
        value !== null && Number.isFinite(value),
        'A PRESENT observation must carry a finite value.',
      );
      return { periodStart, value, valueState };
    case 'ZERO':
      invariant(
        value === null || value === 0,
        'A ZERO observation cannot carry a non-zero value.',
      );
      // Stored as 0 rather than null: the database CHECK requires it, and the
      // difference between "measured as zero" and "not measured" is the entire
      // point of the state (ADR-0002).
      return { periodStart, value: 0, valueState };
    case 'UNAVAILABLE':
    case 'SUPPRESSED':
    case 'NOT_COVERED':
      return { periodStart, value: null, valueState };
  }
}

/**
 * Whether a value and state are a legal pair.
 *
 * Checked once more before a batch write, where observations may have travelled
 * through several transformations since construction.
 */
export function observationIsConsistent(observation: Observation): boolean {
  switch (observation.valueState) {
    case 'PRESENT':
      return observation.value !== null && Number.isFinite(observation.value);
    case 'ZERO':
      return observation.value === 0;
    case 'UNAVAILABLE':
    case 'SUPPRESSED':
    case 'NOT_COVERED':
      return observation.value === null;
  }
}

/**
 * Movement between two observations.
 *
 * Null whenever either side has no value. A gap is not zero, so a region that
 * was not published last month has no change rather than a fall to nothing,
 * and a region newly covered has no change rather than a rise from nothing
 * (ADR-0002). This is the whole reason it returns a type instead of a number.
 *
 * `percent` is separately nullable: a rise from zero has no percentage, and
 * reporting one as infinite or as 100 would be inventing a figure.
 */
export interface PeriodChange {
  readonly absolute: number;
  readonly percent: number | null;
  readonly direction: 'UP' | 'DOWN' | 'FLAT';
}

export function changeBetween(
  latest: Observation,
  previous: Observation | null,
): PeriodChange | null {
  if (previous === null) return null;
  if (latest.value === null || previous.value === null) return null;

  const absolute = latest.value - previous.value;
  const direction = absolute > 0 ? 'UP' : absolute < 0 ? 'DOWN' : 'FLAT';
  const percent = previous.value === 0 ? null : (absolute / previous.value) * 100;

  return { absolute, percent, direction };
}

// ---------------------------------------------------------------------------
// Series
// ---------------------------------------------------------------------------

/**
 * A dimension exactly as the source stated it, before any resolution.
 *
 * Retained whether or not it resolves to a known geography or occupation. A
 * region the registry does not recognise keeps the source's own code and label,
 * so it can be resolved later without re-importing. Guessing the mapping and
 * dropping the row both lose what the source told us.
 */
export interface SourceDimension {
  readonly code: string | null;
  readonly name: string | null;
}

export const unstatedDimension: SourceDimension = { code: null, name: null };
/**
 * What a series measures, for whom, where, on what basis.
 *
 * Provenance is stated once here rather than repeated on every observation,
 * and none of it is optional: a series that cannot say what it measures or
 * where the figure came from is a bug (ADR-0002).
 */
export interface SeriesDefinition {
  readonly sourceKey: string;
  /** Named dataset within the source, for example "Internet Vacancy Index". */
  readonly dataset: string;
  /** What is counted, for example "Online job advertisements". */
  readonly measure: string;
  /** Unit of the values, for example "advertisements". */
  readonly unit: string;
  readonly basis: MetricBasis;
  readonly granularity: PeriodGranularity;
  readonly geography: SourceDimension;
  readonly occupation: SourceDimension;
  /**
   * Further source-stated dimensions that distinguish otherwise identical
   * series, a seasonal adjustment being the obvious one. Any column the reader
   * recognises as a dimension but cannot classify becomes a qualifier rather
   * than being discarded, because discarding it would silently merge two
   * different series into one.
   */
  readonly qualifiers: Readonly<Record<string, string>>;
}

export interface ParsedSeries {
  readonly seriesKey: string;
  readonly definition: SeriesDefinition;
  readonly observations: readonly Observation[];
}

/** Lowercase, alphanumeric, hyphen-separated. Stable across imports. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function dimensionToken(dimension: SourceDimension): string {
  if (dimension.code !== null && dimension.code.trim() !== '') {
    return `c.${slug(dimension.code)}`;
  }
  if (dimension.name !== null && dimension.name.trim() !== '') {
    return `n.${slug(dimension.name)}`;
  }
  return 'none';
}

/**
 * Stable identity for a series, so repeated imports resolve to one row.
 *
 * Derived from what the source stated, never from what we managed to resolve.
 * That distinction matters: when the occupation classification is loaded and
 * references that are unresolved today begin resolving, the key must not
 * change, or the next import would create a second series and split the
 * history in two.
 */
export function buildSeriesKey(definition: SeriesDefinition): string {
  const qualifiers = Object.entries(definition.qualifiers)
    .map(([name, value]) => [slug(name), slug(value)] as const)
    .filter(([name, value]) => name !== '' && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}.${value}`);

  return [
    slug(definition.sourceKey),
    slug(definition.dataset),
    slug(definition.measure),
    definition.granularity.toLowerCase(),
    `g:${dimensionToken(definition.geography)}`,
    `o:${dimensionToken(definition.occupation)}`,
    ...qualifiers,
  ].join('|');
}

/** One line naming every dimension, for the series description column. */
export function describeSeries(definition: SeriesDefinition): string {
  const parts: string[] = [`${definition.measure} (${definition.unit})`];

  const geography = definition.geography.name ?? definition.geography.code;
  if (geography !== null) parts.push(`geography: ${geography}`);

  const occupation = definition.occupation.name ?? definition.occupation.code;
  if (occupation !== null) parts.push(`occupation: ${occupation}`);

  for (const [name, value] of Object.entries(definition.qualifiers).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    parts.push(`${name}: ${value}`);
  }

  parts.push(definition.granularity.toLowerCase(), definition.dataset);
  return parts.join('; ');
}

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

/** First day of the period containing the instant, in UTC. */
export function startOfPeriod(date: Date, granularity: PeriodGranularity): Date {
  const year = date.getUTCFullYear();
  switch (granularity) {
    case 'MONTH':
      return new Date(Date.UTC(year, date.getUTCMonth(), 1));
    case 'QUARTER':
      return new Date(Date.UTC(year, Math.floor(date.getUTCMonth() / 3) * 3, 1));
    case 'YEAR':
      return new Date(Date.UTC(year, 0, 1));
  }
}

/** Reference period as a reader sees it: "2026-07", "2026-Q3", "2026". */
export function formatPeriod(date: Date, granularity: PeriodGranularity): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  switch (granularity) {
    case 'MONTH':
      return `${year}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    case 'QUARTER':
      return `${year}-Q${String(Math.floor(date.getUTCMonth() / 3) + 1)}`;
    case 'YEAR':
      return year;
  }
}

// ---------------------------------------------------------------------------
// Language rules (ADR-0002)
// ---------------------------------------------------------------------------

/**
 * Phrasings that must never describe an advertisement-based indicator.
 *
 * The Internet Vacancy Index counts online job advertisements on a defined set
 * of job boards. Many real vacancies are never advertised online at all, so
 * calling it a count of vacancies is not loose wording, it is wrong, and the
 * constitution forbids it. These strings are checked against the measure, unit
 * and description of every series before it can be stored.
 */
const forbiddenMetricPhrases = [
  'total vacancies',
  'total job vacancies',
  'total number of vacancies',
  'all vacancies',
  'all job vacancies',
  'all jobs in australia',
  'all australian jobs',
  'every job',
  'every vacancy',
  'jobs available',
  'total jobs',
] as const;

/**
 * Offending phrases in a piece of metric copy. Empty when the text is
 * acceptable. Returned rather than thrown so a caller can report every problem
 * at once.
 */
export function metricLanguageViolations(text: string): string[] {
  const normalised = text.toLowerCase().replace(/\s+/g, ' ');
  return forbiddenMetricPhrases.filter((phrase) => normalised.includes(phrase));
}
