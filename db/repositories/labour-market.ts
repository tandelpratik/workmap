import type { Prisma } from '@/db/generated/client/client';
import { getDatabase } from '../client';
import { failure, type Failure } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
import { findSourceDescriptor } from '@/config/sources';
import type { GeographyLevel } from '@/domain/geography';
import { canPublishDerivedAggregates, ineligibilityReason } from '@/domain/source';
import {
  makeObservation,
  type MetricBasis,
  type Observation,
  type PeriodGranularity,
  type SeriesDefinition,
  type ValueState,
} from '@/domain/labour-market';

/**
 * Labour market repository.
 *
 * Returns domain types, never Prisma rows (ADR-0001). Decimal columns are
 * converted here, and observations are rebuilt through makeObservation so a
 * value and its state cannot become inconsistent on the way out of the
 * database any more than on the way in.
 */

export interface StoredSeries {
  readonly id: string;
  readonly seriesKey: string;
  readonly definition: SeriesDefinition;
  /** Null until the reference resolves; the source's own labels persist. */
  readonly geographyId: string | null;
  readonly occupationId: string | null;
}

interface SeriesRow {
  id: string;
  seriesKey: string;
  sourceKey: string;
  dataset: string;
  measure: string;
  unit: string;
  basis: string;
  granularity: string;
  geographyId: string | null;
  occupationId: string | null;
  sourceGeographyCode: string | null;
  sourceGeographyName: string | null;
  sourceOccupationCode: string | null;
  sourceOccupationName: string | null;
}

function toDomain(row: SeriesRow): StoredSeries {
  return {
    id: row.id,
    seriesKey: row.seriesKey,
    geographyId: row.geographyId,
    occupationId: row.occupationId,
    definition: {
      sourceKey: row.sourceKey,
      dataset: row.dataset,
      measure: row.measure,
      unit: row.unit,
      basis: row.basis as MetricBasis,
      granularity: row.granularity as PeriodGranularity,
      geography: { code: row.sourceGeographyCode, name: row.sourceGeographyName },
      occupation: { code: row.sourceOccupationCode, name: row.sourceOccupationName },
      // Qualifiers live in the series key rather than a column of their own.
      // Reconstructing them is milestone 07's problem, when something needs to
      // filter on one; nothing reads them today, and inventing a parse of the
      // key here would be a second source of truth.
      qualifiers: {},
    },
  };
}

const seriesSelect = {
  id: true,
  seriesKey: true,
  sourceKey: true,
  dataset: true,
  measure: true,
  unit: true,
  basis: true,
  granularity: true,
  geographyId: true,
  occupationId: true,
  sourceGeographyCode: true,
  sourceGeographyName: true,
  sourceOccupationCode: true,
  sourceOccupationName: true,
} as const;

export async function findSeriesByKey(
  seriesKey: string,
): Promise<Result<StoredSeries, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const row = await database.value.labourMarketSeries.findUnique({
    where: { seriesKey },
    select: seriesSelect,
  });

  if (!row) {
    return err(failure('NOT_FOUND', `No series with key "${seriesKey}".`));
  }
  return ok(toDomain(row));
}

export async function countSeries(
  sourceKey: string,
  dataset?: string,
): Promise<Result<number, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  return ok(
    await database.value.labourMarketSeries.count({
      where: { sourceKey, ...(dataset === undefined ? {} : { dataset }) },
    }),
  );
}

export async function listObservations(
  seriesKey: string,
): Promise<Result<Observation[], Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const series = await database.value.labourMarketSeries.findUnique({
    where: { seriesKey },
    select: { id: true },
  });
  if (!series) {
    return err(failure('NOT_FOUND', `No series with key "${seriesKey}".`));
  }

  const rows = await database.value.labourMarketMetric.findMany({
    where: { seriesId: series.id },
    select: { periodStart: true, value: true, valueState: true },
    orderBy: { periodStart: 'asc' },
  });

  return ok(
    rows.map((row) =>
      makeObservation(
        row.periodStart,
        row.valueState as ValueState,
        row.value === null ? null : Number(row.value.toString()),
      ),
    ),
  );
}

/**
 * Most recent reference period held for a dataset.
 *
 * Null when nothing is loaded, which is a different answer from zero and is
 * what the UI needs to distinguish "no data yet" from "no advertisements".
 */
export async function latestPeriod(
  sourceKey: string,
  dataset: string,
): Promise<Result<Date | null, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const row = await database.value.labourMarketMetric.findFirst({
    where: { series: { sourceKey, dataset } },
    select: { periodStart: true },
    orderBy: { periodStart: 'desc' },
  });

  return ok(row?.periodStart ?? null);
}

export interface UnresolvedDimension {
  readonly code: string | null;
  readonly name: string | null;
  readonly seriesCount: number;
}

/**
 * Geographies a source reported that the registry could not match.
 *
 * Operational rather than decorative: these are the areas whose figures exist
 * but cannot yet be placed on a map, and the list is what a later milestone
 * works through.
 */
export async function listUnresolvedGeographies(
  sourceKey: string,
): Promise<Result<UnresolvedDimension[], Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const rows = await database.value.labourMarketSeries.groupBy({
    by: ['sourceGeographyCode', 'sourceGeographyName'],
    where: { sourceKey, geographyId: null },
    _count: { _all: true },
  });

  return ok(
    rows
      .map((row) => ({
        code: row.sourceGeographyCode,
        name: row.sourceGeographyName,
        seriesCount: row._count._all,
      }))
      .sort((a, b) => b.seriesCount - a.seriesCount),
  );
}

// ---------------------------------------------------------------------------
// Regional totals, for the map
// ---------------------------------------------------------------------------

/** One region's headline figure for a single reference period. */
export interface RegionTotal {
  readonly geographyId: string;
  readonly code: string;
  readonly name: string;
  readonly level: GeographyLevel;
  /** The figure, or the reason there is no figure. Never coerced to zero. */
  readonly observation: Observation;
  /** The period before it, where one is held. Null is "no comparison". */
  readonly previous: Observation | null;
}

export interface RegionTotalsResult {
  /** The period every figure belongs to. Null when nothing is loaded. */
  readonly period: Date | null;
  /** The period the change is measured against. Null when only one is held. */
  readonly previousPeriod: Date | null;
  readonly regions: readonly RegionTotal[];
  /**
   * Regions this dataset reports on that carry no figure for this period.
   *
   * A real gap, and drawn as one. Deliberately **not** every area in the
   * boundary registry: IVI covers Australia as eight capital cities plus the
   * non-capital regions, so the SA4s inside Greater Sydney are not missing
   * data, they are represented by Greater Sydney. Counting them as gaps would
   * report a two-thirds hole in a dataset that actually covers the country.
   */
  readonly withoutData: readonly Omit<RegionTotal, 'observation' | 'previous'>[];
}

/**
 * The headline figure per region for the most recent period held.
 *
 * The source's own all-occupations total is read, never summed from the
 * occupation rows. Adding them would produce a number the publisher did not
 * publish, and for an advertisement index the parts do not necessarily sum to
 * the whole.
 *
 * Levels may be mixed, and IVI needs them mixed: it publishes the eight
 * capitals at GCCSA and the rest of the country at SA4, which is 50 areas
 * covering Australia exactly once. What makes that safe is that only areas the
 * dataset reports on are returned, so a level a dataset says nothing about
 * contributes nothing. The caller still owes the check: asking for two levels
 * of a dataset that reports on both, such as an SA4 series that also has the
 * GCCSA containing it, would draw the capitals twice.
 */
export async function listRegionTotals(options: {
  readonly sourceKey: string;
  readonly dataset: string;
  readonly edition: string;
  readonly levels: readonly GeographyLevel[];
  /** The source's code for "all occupations". JSA IVI uses "0". */
  readonly totalOccupationCode: string;
}): Promise<Result<RegionTotalsResult, Failure>> {
  const descriptor = findSourceDescriptor(options.sourceKey);
  if (descriptor === undefined) {
    return err(
      failure('NOT_FOUND', `No source registered with key "${options.sourceKey}".`),
    );
  }

  // The single gate (ADR-0009). A map is an aggregate presentation, so a
  // source whose licence reserves aggregate figures must never reach it, no
  // matter which caller asks. Adzuna is the case this exists for: it is fully
  // verified for publishing advertisements and barred from exactly this.
  if (!canPublishDerivedAggregates(descriptor)) {
    return err(
      failure(
        'FORBIDDEN',
        `Source "${options.sourceKey}" may not be used for published aggregate figures. ` +
          (ineligibilityReason(descriptor) ??
            'Its licence reserves aggregate use, so no map or count may be drawn from it.'),
      ),
    );
  }

  const database = getDatabase();
  if (!database.ok) return database;

  const areas = await database.value.geography.findMany({
    where: { asgsEdition: options.edition, level: { in: [...options.levels] } },
    select: { id: true, code: true, name: true, level: true },
    orderBy: { name: 'asc' },
  });

  const series = await database.value.labourMarketSeries.findMany({
    where: {
      sourceKey: options.sourceKey,
      dataset: options.dataset,
      sourceOccupationCode: options.totalOccupationCode,
      geographyId: { in: areas.map((area) => area.id) },
    },
    select: { id: true, geographyId: true },
  });

  if (series.length === 0) {
    return ok({
      period: null,
      previousPeriod: null,
      regions: [],
      // Nothing is "missing a figure" when the dataset is not loaded at all.
      // That is a different state, and the caller distinguishes it by the
      // empty region list and null period rather than by a list of gaps.
      withoutData: [],
    });
  }

  const seriesIds = series.map((row) => row.id);

  // One period for the whole map. Reading each region's own latest would let a
  // region that stopped reporting sit beside current ones as though it were
  // current, which misdates the map without any figure being wrong.
  //
  // The period before it comes back too, because a figure on its own says
  // nothing about direction. Two is all there is: history is retained at two
  // periods (config/retention.ts), so this is the whole table, not a window
  // onto a longer one.
  const periods = await database.value.labourMarketMetric.groupBy({
    by: ['periodStart'],
    where: { seriesId: { in: seriesIds } },
    orderBy: { periodStart: 'desc' },
    take: 2,
  });

  const period = periods[0]?.periodStart ?? null;
  const previousPeriod = periods[1]?.periodStart ?? null;
  if (period === null) {
    return ok({
      period: null,
      previousPeriod: null,
      regions: [],
      // Nothing is "missing a figure" when the dataset is not loaded at all.
      // That is a different state, and the caller distinguishes it by the
      // empty region list and null period rather than by a list of gaps.
      withoutData: [],
    });
  }

  const wanted = previousPeriod === null ? [period] : [period, previousPeriod];
  const metrics = await database.value.labourMarketMetric.findMany({
    where: { seriesId: { in: seriesIds }, periodStart: { in: wanted } },
    select: { seriesId: true, periodStart: true, value: true, valueState: true },
  });

  const geographyBySeries = new Map(series.map((row) => [row.id, row.geographyId]));
  const observationByGeography = new Map<string, Observation>();
  const previousByGeography = new Map<string, Observation>();
  for (const metric of metrics) {
    const geographyId = geographyBySeries.get(metric.seriesId);
    if (geographyId === null || geographyId === undefined) continue;
    const observation = makeObservation(
      metric.periodStart,
      metric.valueState as ValueState,
      metric.value === null ? null : Number(metric.value.toString()),
    );
    const target =
      metric.periodStart.getTime() === period.getTime()
        ? observationByGeography
        : previousByGeography;
    target.set(geographyId, observation);
  }

  // An area is only in scope if the dataset reports on it at all. Everything
  // else is outside this dataset's design, not absent from it.
  const inScope = new Set(
    series
      .map((row) => row.geographyId)
      .filter((id): id is string => id !== null && id !== undefined),
  );

  const regions: RegionTotal[] = [];
  const withoutData: Omit<RegionTotal, 'observation' | 'previous'>[] = [];
  for (const area of areas) {
    if (!inScope.has(area.id)) continue;
    const identity = {
      geographyId: area.id,
      code: area.code,
      name: area.name,
      level: area.level as GeographyLevel,
    };
    const observation = observationByGeography.get(area.id);
    if (observation === undefined) withoutData.push(identity);
    else
      regions.push({
        ...identity,
        observation,
        // Absent rather than zero when the month before was not published or
        // not held. The panel says so instead of drawing a change of nothing.
        previous: previousByGeography.get(area.id) ?? null,
      });
  }

  return ok({ period, previousPeriod, regions, withoutData });
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

export interface PruneResult {
  /** Observations removed. */
  readonly deleted: number;
  /** The periods that remain, newest first. */
  readonly retained: readonly Date[];
  /** Periods that were removed, oldest first. */
  readonly removed: readonly Date[];
}

/**
 * Drops every reference period outside the retention window.
 *
 * Deletion, not expiry. The rest of the system expires rather than deletes,
 * because deleting a listing destroys the record that it existed. This is the
 * opposite case: the published workbook is the record, and these rows are a
 * copy of a fraction of it. Re-importing with a wider window restores them
 * exactly (config/retention.ts).
 *
 * Periods are removed one at a time rather than in a single statement. A
 * release carries years of monthly figures across thousands of series, so the
 * first prune deletes a quarter of a million rows, and a single unbounded
 * DELETE against a free-tier database is how a migration becomes an incident.
 */
export async function pruneLabourMarketHistory(options: {
  readonly sourceKey: string;
  readonly dataset: string;
  readonly retainPeriods: number;
  /** Injected by the importer, which runs inside its own transaction. */
  readonly client?: Prisma.TransactionClient;
}): Promise<Result<PruneResult, Failure>> {
  if (!Number.isInteger(options.retainPeriods) || options.retainPeriods < 1) {
    return err(
      failure(
        'INVALID_INPUT',
        `Retention must be a whole number of periods, at least 1. Received ${String(options.retainPeriods)}.`,
      ),
    );
  }

  let database: Prisma.TransactionClient;
  if (options.client === undefined) {
    const resolved = getDatabase();
    if (!resolved.ok) return resolved;
    database = resolved.value;
  } else {
    database = options.client;
  }

  const scope = { series: { sourceKey: options.sourceKey, dataset: options.dataset } };

  const periods = await database.labourMarketMetric.groupBy({
    by: ['periodStart'],
    where: scope,
    orderBy: { periodStart: 'desc' },
  });

  const retained = periods.slice(0, options.retainPeriods).map((row) => row.periodStart);
  const removable = periods.slice(options.retainPeriods).map((row) => row.periodStart);

  let deleted = 0;
  // Oldest first, so an interrupted prune leaves the newest periods intact.
  for (const period of [...removable].reverse()) {
    const outcome = await database.labourMarketMetric.deleteMany({
      where: { ...scope, periodStart: period },
    });
    deleted += outcome.count;
  }

  return ok({ deleted, retained, removed: [...removable].reverse() });
}
