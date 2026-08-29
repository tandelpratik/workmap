import { getDatabase } from '../client';
import { failure, type Failure } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
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
