import { unstable_cache } from 'next/cache';
import { listByLevel } from '@/db/repositories/geography';
import {
  listOccupations,
  listOccupationTotals,
  listRegionTotals,
  type OccupationTotalsResult,
  type RegionTotal,
  type RegionTotalsResult,
} from '@/db/repositories/labour-market';
import { makeObservation, type ValueState } from '@/domain/labour-market';
import type { Failure } from '@/lib/errors';
import { ok, type Result } from '@/lib/result';

/**
 * The reads behind the public pages, cached.
 *
 * These figures come from a published monthly release. Between imports they do
 * not change at all, so answering every request with a database round trip
 * spends Neon compute and Vercel function time recomputing a number that was
 * settled weeks ago. Free-tier rules.
 *
 * **Why here and not in the repository.** Repositories are data access and are
 * called directly by tests, which run under vitest with no Next.js request
 * context. Caching is a delivery concern, so it wraps the repository at the app
 * layer and the repository stays a plain async function that any caller can use
 * and any test can exercise.
 *
 * **Why `unstable_cache`.** Next.js 16 replaces it with the `use cache`
 * directive, which requires enabling Cache Components. That is a project-wide
 * migration: it replaces the `dynamic` and `revalidate` route configs
 * everywhere and revalidates every route against instant-navigation rules.
 * Doing that as a side effect of adding a cache would be the silent redesign
 * the milestone rules forbid, so it is recorded as a decision for the product
 * owner and this file is the whole of what it would touch.
 *
 * **Staleness is bounded and self-healing.** Nothing invalidates on demand
 * today, because JSA releases are imported by an operator running a command
 * rather than by a route handler, and `revalidateTag` needs a request context.
 * An hour is therefore the longest a newly imported release can go unseen. The
 * tag is set regardless, so an endpoint that clears it is a few lines later.
 */

/** Long enough to be worth caching, short enough that a new import appears. */
const REVALIDATE_SECONDS = 3600;

/** One tag for everything derived from the labour market tables. */
export const LABOUR_MARKET_TAG = 'labour-market';

const options = { revalidate: REVALIDATE_SECONDS, tags: [LABOUR_MARKET_TAG] };

// ---------------------------------------------------------------------------
// The serialisation boundary
// ---------------------------------------------------------------------------

/**
 * A cache is a serialisation boundary, and `Date` does not survive it.
 *
 * This was not theoretical. Caching these results directly returned dates as
 * ISO strings on every read after the first, the type said `Date`, and the
 * pages threw `RangeError: Invalid time value` from `Intl.DateTimeFormat` the
 * moment a second request arrived. TypeScript cannot catch it, because the lie
 * happens at runtime inside the cache.
 *
 * So the boundary is explicit. What is stored is a wire shape whose date
 * fields are typed as strings, and reviving it is a total function from that
 * shape back to the domain one. A new date field cannot be forgotten, because
 * the wire type will not match the domain type until it is handled.
 *
 * Observations are rebuilt through `makeObservation` rather than reassembled,
 * so a value and its state cannot become inconsistent while passing through a
 * cache any more than they can on the way out of the database (ADR-0002).
 */

type DateAsString<T> = T extends Date
  ? string
  : T extends Date | null
    ? string | null
    : T;

interface ObservationWire {
  readonly periodStart: string;
  readonly value: number | null;
  readonly valueState: ValueState;
}

type RegionTotalWire = {
  readonly [K in keyof Omit<RegionTotal, 'observation' | 'previous'>]: DateAsString<
    RegionTotal[K]
  >;
} & {
  readonly observation: ObservationWire;
  readonly previous: ObservationWire | null;
};

interface RegionTotalsWire {
  readonly period: string | null;
  readonly previousPeriod: string | null;
  readonly regions: readonly RegionTotalWire[];
  readonly withoutData: readonly Omit<RegionTotalWire, 'observation' | 'previous'>[];
}

interface OccupationTotalsWire {
  readonly period: string | null;
  readonly previousPeriod: string | null;
  readonly regionsInScope: number;
  readonly occupations: OccupationTotalsResult['occupations'];
}

const toWire = (date: Date | null): string | null =>
  date === null ? null : date.toISOString();

const fromWire = (value: string | null): Date | null =>
  value === null ? null : new Date(value);

function observationToWire(observation: {
  periodStart: Date;
  value: number | null;
  valueState: ValueState;
}): ObservationWire {
  return {
    periodStart: observation.periodStart.toISOString(),
    value: observation.value,
    valueState: observation.valueState,
  };
}

function observationFromWire(wire: ObservationWire) {
  return makeObservation(new Date(wire.periodStart), wire.valueState, wire.value);
}

export function regionTotalsToWire(value: RegionTotalsResult): RegionTotalsWire {
  return {
    period: toWire(value.period),
    previousPeriod: toWire(value.previousPeriod),
    regions: value.regions.map((region) => ({
      ...region,
      observation: observationToWire(region.observation),
      previous: region.previous === null ? null : observationToWire(region.previous),
    })),
    withoutData: value.withoutData,
  };
}

export function regionTotalsFromWire(wire: RegionTotalsWire): RegionTotalsResult {
  return {
    period: fromWire(wire.period),
    previousPeriod: fromWire(wire.previousPeriod),
    regions: wire.regions.map((region) => ({
      ...region,
      observation: observationFromWire(region.observation),
      previous: region.previous === null ? null : observationFromWire(region.previous),
    })),
    withoutData: wire.withoutData,
  };
}

// ---------------------------------------------------------------------------
// The cached reads
// ---------------------------------------------------------------------------

/**
 * Arguments form part of the cache key, so each occupation, edition and level
 * combination is held separately. The key parts only keep these entries apart
 * from one another.
 */

const regionTotalsCached = unstable_cache(
  async (
    args: Parameters<typeof listRegionTotals>[0],
  ): Promise<Result<RegionTotalsWire, Failure>> => {
    const result = await listRegionTotals(args);
    return result.ok ? ok(regionTotalsToWire(result.value)) : result;
  },
  ['labour-market', 'region-totals'],
  options,
);

export async function cachedRegionTotals(
  args: Parameters<typeof listRegionTotals>[0],
): Promise<Result<RegionTotalsResult, Failure>> {
  const result = await regionTotalsCached(args);
  return result.ok ? ok(regionTotalsFromWire(result.value)) : result;
}

const occupationTotalsCached = unstable_cache(
  async (
    args: Parameters<typeof listOccupationTotals>[0],
  ): Promise<Result<OccupationTotalsWire, Failure>> => {
    const result = await listOccupationTotals(args);
    return result.ok
      ? ok({
          period: toWire(result.value.period),
          previousPeriod: toWire(result.value.previousPeriod),
          regionsInScope: result.value.regionsInScope,
          occupations: result.value.occupations,
        })
      : result;
  },
  ['labour-market', 'occupation-totals'],
  options,
);

export async function cachedOccupationTotals(
  args: Parameters<typeof listOccupationTotals>[0],
): Promise<Result<OccupationTotalsResult, Failure>> {
  const result = await occupationTotalsCached(args);
  return result.ok
    ? ok({
        period: fromWire(result.value.period),
        previousPeriod: fromWire(result.value.previousPeriod),
        regionsInScope: result.value.regionsInScope,
        occupations: result.value.occupations,
      })
    : result;
}

/** No dates in this one, so it crosses the boundary unchanged. */
export const cachedOccupations = unstable_cache(
  listOccupations,
  ['labour-market', 'occupations'],
  options,
);

/**
 * Geography changes with an ASGS edition, which is to say every five years, and
 * carries no dates either. It shares the tag so one invalidation clears
 * everything a release touches.
 */
export const cachedStates = unstable_cache(
  listByLevel,
  ['geography', 'by-level'],
  options,
);
