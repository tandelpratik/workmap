import { describe, expect, it } from 'vitest';
import { regionTotalsFromWire, regionTotalsToWire } from '@/app/cached-queries';
import { makeObservation } from '@/domain/labour-market';
import type { RegionTotalsResult } from '@/db/repositories/labour-market';

/**
 * The cache's serialisation boundary.
 *
 * A cache is a serialisation boundary and `Date` does not survive one. Caching
 * these results directly returned dates as ISO strings on every read after the
 * first, while the type still said `Date`, and the pages threw
 * `RangeError: Invalid time value` out of `Intl.DateTimeFormat` as soon as a
 * second request arrived. Typecheck, lint and the whole suite passed: the lie
 * happens inside the cache, at runtime.
 *
 * These tests are the guard, because the type system cannot be. They assert
 * that what crosses the boundary comes back as dates rather than as strings
 * that merely claim to be.
 */

const july = new Date('2026-07-01T00:00:00.000Z');
const june = new Date('2026-06-01T00:00:00.000Z');

const sample: RegionTotalsResult = {
  period: july,
  previousPeriod: june,
  regions: [
    {
      geographyId: 'g1',
      code: '1GSYD',
      name: 'Greater Sydney',
      level: 'GCCSA',
      stateCode: '1',
      observation: makeObservation(july, 'PRESENT', 42880),
      previous: makeObservation(june, 'PRESENT', 41397),
    },
    {
      geographyId: 'g2',
      code: '110',
      name: 'New England and North West',
      level: 'SA4',
      stateCode: '1',
      observation: makeObservation(july, 'UNAVAILABLE'),
      previous: null,
    },
  ],
  withoutData: [
    {
      geographyId: 'g3',
      code: '199',
      name: 'Somewhere unreported',
      level: 'SA4',
      stateCode: '1',
    },
  ],
};

describe('cache serialisation boundary', () => {
  it('returns real dates, not strings that claim to be dates', () => {
    // A JSON round trip is what the cache does to a value. Doing it here is
    // the point: reviving the value the cache actually hands back, rather
    // than the object we happened to put in.
    const stored = JSON.parse(JSON.stringify(regionTotalsToWire(sample)));
    const revived = regionTotalsFromWire(stored);

    expect(revived.period).toBeInstanceOf(Date);
    expect(revived.previousPeriod).toBeInstanceOf(Date);
    expect(revived.regions[0]!.observation.periodStart).toBeInstanceOf(Date);
    expect(revived.regions[0]!.previous?.periodStart).toBeInstanceOf(Date);

    // The failure this replaces: Intl throws RangeError on a string.
    expect(() =>
      new Intl.DateTimeFormat('en-AU', { month: 'long', timeZone: 'UTC' }).format(
        revived.period ?? undefined,
      ),
    ).not.toThrow();
  });

  it('carries every figure across unchanged', () => {
    const revived = regionTotalsFromWire(
      JSON.parse(JSON.stringify(regionTotalsToWire(sample))),
    );

    expect(revived.period?.getTime()).toBe(july.getTime());
    expect(revived.previousPeriod?.getTime()).toBe(june.getTime());
    expect(revived.regions[0]!.observation.value).toBe(42880);
    expect(revived.regions[0]!.previous?.value).toBe(41397);
    expect(revived.regions[0]!.stateCode).toBe('1');
    expect(revived.withoutData).toHaveLength(1);
    expect(revived.withoutData[0]!.code).toBe('199');
  });

  it('keeps an absence an absence rather than a zero', () => {
    // The distinction the whole product rests on must survive a cache too
    // (ADR-0002). Reviving through makeObservation is what enforces it.
    const revived = regionTotalsFromWire(
      JSON.parse(JSON.stringify(regionTotalsToWire(sample))),
    );

    const unavailable = revived.regions[1]!;
    expect(unavailable.observation.valueState).toBe('UNAVAILABLE');
    expect(unavailable.observation.value).toBeNull();
    expect(unavailable.previous).toBeNull();
  });
});
