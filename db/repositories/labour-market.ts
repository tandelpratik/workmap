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
  /** The state or territory this area sits in, for the drilldown. */
  readonly stateCode: string | null;
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
  /** The occupation to read. JSA IVI uses "0" for all occupations. */
  readonly occupationCode: string;
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

  const levels = options.levels.map((level) => String(level));

  // One period for the whole map. Reading each region's own latest would let a
  // region that stopped reporting sit beside current ones as though it were
  // current, which misdates the map without any figure being wrong.
  //
  // The period before it comes back too, because a figure on its own says
  // nothing about direction. Two is all there is: history is retained at two
  // periods (config/retention.ts), so this is the whole table, not a window
  // onto a longer one.
  const periods = await database.value.$queryRaw<{ period_start: Date }[]>`
    select distinct m.period_start
    from labour_market_metric m
    join labour_market_series s on s.id = m.series_id
    join geography g on g.id = s.geography_id
    where s.source_key = ${options.sourceKey}
      and s.dataset = ${options.dataset}
      and s.source_occupation_code = ${options.occupationCode}
      and g.asgs_edition = ${options.edition}
      and g.level::text = any(${levels}::text[])
    order by m.period_start desc
    limit 2
  `;

  const period = periods[0]?.period_start ?? null;
  const previousPeriod = periods[1]?.period_start ?? null;
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

  /**
   * Both periods for every region, in one statement.
   *
   * Written as SQL rather than assembled from four Prisma calls because the
   * join is the query: areas, their series and two months of metrics. Fetching
   * each in turn cost four sequential round trips and carried rows across the
   * wire that the database had already narrowed (ADR-0004).
   *
   * The left joins are what distinguishes the two absences. A region with no
   * metric row for the period comes back with a null state, and that is a gap.
   * A region with a row whose value is null was measured and reported as
   * absent, and its state says why. Collapsing them would turn "not published"
   * into "no data" (ADR-0002).
   */
  const rows = await database.value.$queryRaw<
    {
      geography_id: string;
      code: string;
      name: string;
      level: string;
      state_code: string | null;
      latest_value: number | null;
      latest_state: string | null;
      previous_value: number | null;
      previous_state: string | null;
    }[]
  >`
    select g.id as geography_id,
           g.code,
           g.name,
           g.level::text as level,
           parent.code as state_code,
           latest.value::float8 as latest_value,
           latest.value_state::text as latest_state,
           previous.value::float8 as previous_value,
           previous.value_state::text as previous_state
    from labour_market_series s
    join geography g on g.id = s.geography_id
    left join geography parent on parent.id = g.parent_id
    left join labour_market_metric latest
      on latest.series_id = s.id and latest.period_start = ${period}
    left join labour_market_metric previous
      on previous.series_id = s.id and previous.period_start = ${previousPeriod}
    where s.source_key = ${options.sourceKey}
      and s.dataset = ${options.dataset}
      and s.source_occupation_code = ${options.occupationCode}
      and g.asgs_edition = ${options.edition}
      and g.level::text = any(${levels}::text[])
    order by g.name asc
  `;

  const regions: RegionTotal[] = [];
  const withoutData: Omit<RegionTotal, 'observation' | 'previous'>[] = [];

  for (const row of rows) {
    const identity = {
      geographyId: row.geography_id,
      code: row.code,
      name: row.name,
      level: row.level as GeographyLevel,
      stateCode: row.state_code,
    };

    // No row at all for this period, as opposed to a row reporting an absence.
    if (row.latest_state === null) {
      withoutData.push(identity);
      continue;
    }

    regions.push({
      ...identity,
      observation: makeObservation(
        period,
        row.latest_state as ValueState,
        row.latest_value,
      ),
      // Absent rather than zero when the month before was not published or
      // not held. The panel says so instead of drawing a change of nothing.
      previous:
        previousPeriod === null || row.previous_state === null
          ? null
          : makeObservation(
              previousPeriod,
              row.previous_state as ValueState,
              row.previous_value,
            ),
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

// ---------------------------------------------------------------------------
// Occupations
// ---------------------------------------------------------------------------

export interface OccupationOption {
  /** The source's own code. */
  readonly code: string;
  /**
   * The source's own name, or null when the source does not give the code one
   * name.
   *
   * Null is a real answer here, not a missing value. JSA labels its
   * all-occupations row per region, so code "0" arrives as fifty different
   * names: "Greater Sydney TOTAL", "Capital Region TOTAL" and so on. Picking
   * one of them would tell a reader in Perth that they were looking at Sydney,
   * and inventing a name here would put our own labelling in a field that
   * holds the publisher's. The caller labels it instead, and says so.
   */
  readonly name: string | null;
}

/**
 * The occupations a dataset reports on, in the source's own code order.
 *
 * Read from the series rather than from an occupation table, because nothing
 * has resolved these codes to a classification yet: ANZSCO against OSCA is
 * milestone 11. What is stored is what the publisher wrote, which is enough to
 * offer the reader a choice and is honest about where the vocabulary came from.
 */
export async function listOccupations(options: {
  readonly sourceKey: string;
  readonly dataset: string;
}): Promise<Result<OccupationOption[], Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  // DISTINCT in the database. Prisma's distinct narrowed 2,850 rows after
  // carrying them across the wire, to answer with 57 (ADR-0004).
  const rows = await database.value.$queryRaw<{ code: string; name: string | null }[]>`
    select distinct s.source_occupation_code as code, s.source_occupation_name as name
    from labour_market_series s
    where s.source_key = ${options.sourceKey}
      and s.dataset = ${options.dataset}
      and s.source_occupation_code is not null
      and s.source_occupation_code <> ''
    order by code asc
  `;

  const namesByCode = new Map<string, Set<string>>();
  for (const row of rows) {
    const names = namesByCode.get(row.code) ?? new Set<string>();
    if (row.name !== null && row.name !== '') names.add(row.name);
    namesByCode.set(row.code, names);
  }

  return ok(
    [...namesByCode.entries()]
      .map(([code, names]) => ({
        code,
        // One name means the source named it. Several means the source named
        // it differently in different places, which is not a name.
        name: names.size === 1 ? [...names][0]! : null,
      }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  );
}

export interface OccupationTotal {
  readonly code: string;
  /** The source's name, or null where it does not give the code one. */
  readonly name: string | null;
  /**
   * Advertisements across every region the source published, summed here.
   *
   * Our arithmetic, not the publisher's figure. IVI publishes this release by
   * region only, and the regions it uses cover Australia exactly once, so the
   * sum is well defined. It is still ours, so every surface that shows it says
   * so rather than presenting it as a national figure JSA released.
   *
   * Null when no region carried a figure, which is not the same as zero.
   */
  readonly total: number | null;
  /** The same sum for the period before, where one is held. */
  readonly previousTotal: number | null;
  /** How many regions contributed, so a partial month cannot pass as a full one. */
  readonly regionsReporting: number;
}

export interface OccupationTotalsResult {
  readonly period: Date | null;
  readonly previousPeriod: Date | null;
  /** How many regions the dataset reports on at these levels. */
  readonly regionsInScope: number;
  readonly occupations: readonly OccupationTotal[];
}

/**
 * Every occupation's regional sum, for the most recent period held.
 *
 * One pass rather than a query per occupation: 57 occupations across 50
 * regions is 2,850 series, which is small enough to sum in memory and far
 * cheaper than 57 round trips to a database in another region.
 *
 * Summing across regions is not the same act as summing across occupations,
 * which this module refuses elsewhere. Occupation groups nest and overlap, so
 * adding them invents a total the publisher never claimed. Regions partition
 * the country exactly once, so adding those is arithmetic on a partition. It
 * is still ours to label, and it is labelled.
 */
export async function listOccupationTotals(options: {
  readonly sourceKey: string;
  readonly dataset: string;
  readonly edition: string;
  readonly levels: readonly GeographyLevel[];
  /**
   * Narrow to the regions inside one state or territory.
   *
   * Undefined reads the whole country, which is what the national occupation
   * ranking wants. Given a state code, the same arithmetic runs over that
   * state's regions only: still a sum over a partition, since the regions
   * inside a state cover it exactly once, and still ours to label rather than
   * a figure the publisher released.
   */
  readonly stateCode?: string;
}): Promise<Result<OccupationTotalsResult, Failure>> {
  const descriptor = findSourceDescriptor(options.sourceKey);
  if (descriptor === undefined) {
    return err(
      failure('NOT_FOUND', `No source registered with key "${options.sourceKey}".`),
    );
  }

  // The same gate as the map, for the same reason: this is an aggregate.
  if (!canPublishDerivedAggregates(descriptor)) {
    return err(
      failure(
        'FORBIDDEN',
        `Source "${options.sourceKey}" may not be used for published aggregate figures. ` +
          (ineligibilityReason(descriptor) ??
            'Its licence reserves aggregate use, so no total may be drawn from it.'),
      ),
    );
  }

  const database = getDatabase();
  if (!database.ok) return database;

  const levels = options.levels.map((level) => String(level));

  /*
   * Null means the whole country, and the SQL below tests for it inline rather
   * than being built two ways. One statement that reads its own filter is
   * easier to keep correct than two that drift.
   */
  const stateCode = options.stateCode ?? null;

  /*
   * The reference period is deliberately read across the whole dataset rather
   * than within the state. A state page and the national page must date their
   * figures identically: taking each state's own latest would let one that
   * stopped reporting present older figures under a newer month without any
   * number being wrong.
   */
  const periods = await database.value.$queryRaw<{ period_start: Date }[]>`
    select distinct m.period_start
    from labour_market_metric m
    join labour_market_series s on s.id = m.series_id
    join geography g on g.id = s.geography_id
    where s.source_key = ${options.sourceKey}
      and s.dataset = ${options.dataset}
      and g.asgs_edition = ${options.edition}
      and g.level::text = any(${levels}::text[])
    order by m.period_start desc
    limit 2
  `;

  const period = periods[0]?.period_start ?? null;
  const previousPeriod = periods[1]?.period_start ?? null;
  if (period === null) {
    return ok({ period: null, previousPeriod: null, regionsInScope: 0, occupations: [] });
  }

  /**
   * The sums, computed in the database.
   *
   * This used to load 2,850 series and 5,700 metrics into the application to
   * produce 57 numbers. Postgres does the arithmetic and returns the 57
   * (ADR-0004): the same answer, one round trip, and a payload two orders of
   * magnitude smaller on a free tier that pays for the transfer.
   *
   * `filter` rather than two queries, so both periods are read in one pass.
   * When only one period is held the previous parameter is null, no row can
   * match it, and SUM over nothing is null, which is the right answer: no
   * comparison exists.
   */
  const rows = await database.value.$queryRaw<
    {
      code: string;
      name: string | null;
      total: number | null;
      previous_total: number | null;
      regions_reporting: number;
      regions_in_scope: number;
    }[]
  >`
    select s.source_occupation_code as code,
           -- A code the source names inconsistently has no name, and saying so
           -- beats picking one of them. JSA names its all-occupations row per
           -- region, so code "0" carries fifty names and none.
           case
             when count(distinct s.source_occupation_name) = 1
             then min(s.source_occupation_name)
           end as name,
           sum(m.value) filter (where m.period_start = ${period})::float8 as total,
           sum(m.value) filter (where m.period_start = ${previousPeriod})::float8
             as previous_total,
           count(distinct s.geography_id) filter (
             where m.period_start = ${period} and m.value is not null
           )::int as regions_reporting,
           (
             select count(distinct s2.geography_id)::int
             from labour_market_series s2
             join geography g2 on g2.id = s2.geography_id
             left join geography parent2 on parent2.id = g2.parent_id
             where s2.source_key = ${options.sourceKey}
               and s2.dataset = ${options.dataset}
               and g2.asgs_edition = ${options.edition}
               and g2.level::text = any(${levels}::text[])
               and (${stateCode}::text is null or parent2.code = ${stateCode})
           ) as regions_in_scope
    from labour_market_series s
    join geography g on g.id = s.geography_id
    -- The state a region sits in. IVI reports at GCCSA and SA4, and both hang
    -- directly off a state, so the parent is the state without a recursion.
    left join geography parent on parent.id = g.parent_id
    left join labour_market_metric m
      on m.series_id = s.id
      and m.period_start in (${period}, ${previousPeriod})
    where s.source_key = ${options.sourceKey}
      and s.dataset = ${options.dataset}
      and s.source_occupation_code is not null
      and s.source_occupation_code <> ''
      and g.asgs_edition = ${options.edition}
      and g.level::text = any(${levels}::text[])
      and (${stateCode}::text is null or parent.code = ${stateCode})
    group by s.source_occupation_code
    order by total desc nulls last
  `;

  return ok({
    period,
    previousPeriod,
    regionsInScope: rows[0]?.regions_in_scope ?? 0,
    occupations: rows.map((row) => ({
      code: row.code,
      name: row.name,
      total: row.total,
      previousTotal: row.previous_total,
      regionsReporting: row.regions_reporting,
    })),
  });
}
