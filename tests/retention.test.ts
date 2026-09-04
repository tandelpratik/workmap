import { describe, expect, it } from 'vitest';
import { retention } from '@/config/retention';
import { keepRecentPeriods, mostRecentPeriods } from '@/ingestion/retention';
import { makeObservation, type ParsedSeries } from '@/domain/labour-market';

/**
 * Retention.
 *
 * The July 2026 IVI release carries 91 monthly periods across 2,850 series.
 * The product displays the latest month and its change on the month before, so
 * the importer writes two periods and drops the rest (config/retention.ts).
 */

const month = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

function series(key: string, periods: readonly string[]): ParsedSeries {
  return {
    seriesKey: key,
    definition: {
      sourceKey: 'jsa-ivi',
      dataset: 'Internet Vacancy Index',
      measure: 'Online job advertisements',
      unit: 'advertisements',
      basis: 'OFFICIAL',
      granularity: 'MONTH',
      geography: { code: '101', name: 'Capital Region' },
      occupation: { code: '0', name: 'All occupations' },
      qualifiers: {},
    },
    observations: periods.map((iso) => makeObservation(month(iso), 'PRESENT', 100)),
  };
}

describe('retention window', () => {
  it('is at least two periods, so a change can be expressed', () => {
    // One period would make every month-on-month figure "no comparison
    // available", which is a silent way to remove a feature.
    expect(retention.labourMarketPeriods).toBeGreaterThanOrEqual(2);
  });

  it('takes the newest periods across every series, not the first seen', () => {
    const parsed = [
      series('a', ['2026-01-01', '2026-07-01']),
      series('b', ['2026-06-01', '2026-05-01']),
    ];

    expect(mostRecentPeriods(parsed, 2)).toEqual([
      month('2026-07-01'),
      month('2026-06-01'),
    ]);
  });

  it('reads the window from the file rather than from the clock', () => {
    // An archived release imported years later must keep its own newest two
    // months. Anchoring on today would drop the entire file.
    const parsed = [series('a', ['2019-01-01', '2019-02-01', '2019-03-01'])];
    const kept = keepRecentPeriods(parsed, 2);

    expect(kept.periods).toEqual([month('2019-03-01'), month('2019-02-01')]);
    expect(kept.series[0]!.observations).toHaveLength(2);
    expect(kept.dropped).toBe(1);
  });

  it('drops the older observations and counts them', () => {
    const parsed = [
      series('a', ['2026-05-01', '2026-06-01', '2026-07-01']),
      series('b', ['2026-05-01', '2026-06-01', '2026-07-01']),
    ];
    const kept = keepRecentPeriods(parsed, 2);

    expect(kept.dropped).toBe(2);
    for (const entry of kept.series) {
      expect(entry.observations.map((o) => o.periodStart)).toEqual([
        month('2026-06-01'),
        month('2026-07-01'),
      ]);
    }
  });

  it('keeps a series that reported nothing inside the window', () => {
    // Its definition and the source's own labels are still worth storing. A
    // region that did not report this month is a gap on the map, and removing
    // the series here would make it vanish from the registry instead.
    const parsed = [series('quiet', ['2019-01-01'])];
    const kept = keepRecentPeriods([...parsed, series('busy', ['2026-07-01'])], 1);

    expect(kept.series).toHaveLength(2);
    expect(kept.series[0]!.observations).toHaveLength(0);
    expect(kept.series[1]!.observations).toHaveLength(1);
  });
});
