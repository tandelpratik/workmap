import type { ParsedSeries } from '@/domain/labour-market';

/**
 * Period retention, applied while importing.
 *
 * Filtering here rather than after the write is deliberate. A release carries
 * every month it has ever published, so importing in full and pruning
 * afterwards would write a quarter of a million rows in order to keep 5,700,
 * on a database whose free tier is measured in rows. What is not wanted is
 * never written.
 *
 * The window is taken from the file, not from the clock. A release published
 * in August reports July, and a machine's idea of "the last two months" would
 * silently drop the whole file if a release ran late or was imported from an
 * archive.
 */

/**
 * The most recent reference periods present, newest first.
 *
 * Periods are compared by their epoch time rather than by identity, because
 * each series carries its own Date objects for the same month.
 */
export function mostRecentPeriods(
  series: readonly ParsedSeries[],
  count: number,
): readonly Date[] {
  const byTime = new Map<number, Date>();
  for (const entry of series) {
    for (const observation of entry.observations) {
      byTime.set(observation.periodStart.getTime(), observation.periodStart);
    }
  }

  return [...byTime.entries()]
    .sort(([a], [b]) => b - a)
    .slice(0, Math.max(0, count))
    .map(([, period]) => period);
}

export interface RetentionResult {
  /** The same series, carrying only observations inside the window. */
  readonly series: readonly ParsedSeries[];
  /** The periods kept, newest first. */
  readonly periods: readonly Date[];
  /** Observations outside the window, which were never written. */
  readonly dropped: number;
}

/**
 * Narrows parsed series to the most recent periods.
 *
 * A series left with no observations is kept rather than removed. Its
 * definition, and the source's own geography and occupation labels, are worth
 * storing even for a region that reported nothing this month: dropping it here
 * would make a region vanish from the registry rather than appear as a gap.
 */
export function keepRecentPeriods(
  series: readonly ParsedSeries[],
  count: number,
): RetentionResult {
  const periods = mostRecentPeriods(series, count);
  const kept = new Set(periods.map((period) => period.getTime()));

  let dropped = 0;
  const narrowed = series.map((entry) => {
    const observations = entry.observations.filter((observation) => {
      const inWindow = kept.has(observation.periodStart.getTime());
      if (!inWindow) dropped += 1;
      return inWindow;
    });
    return { ...entry, observations };
  });

  return { series: narrowed, periods, dropped };
}
