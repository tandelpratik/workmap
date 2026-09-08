import type { JobStatus } from './job';

/**
 * Where a listing is in its life.
 *
 * Five states, and only two of them are stored. `status` in the database
 * records the decisions ingestion made: a listing is ACTIVE, or it was retired
 * because the source stopped confirming it, or it was withdrawn. The other
 * three are read off timestamps we already hold.
 *
 * That split is deliberate and worth stating, because the obvious alternative
 * is to give all five a column. NEW and STALE are statements about how long ago
 * something happened, and a column holding one of those is a cache of a clock:
 * correct only until the next tick, and requiring a scheduled sweep to rewrite
 * rows for no reason other than that time passed. This project has already been
 * bitten once by two freshness columns drifting apart (milestone 13b), and the
 * fix there was to make the meaning of each exact rather than to add a third.
 *
 * So the derived states are derived, every time, from `firstSeenAt` and
 * `lastVerifiedAt`. There is nothing to keep in sync.
 */

export const lifecycleStates = ['NEW', 'ACTIVE', 'STALE', 'EXPIRED', 'REMOVED'] as const;
export type LifecycleState = (typeof lifecycleStates)[number];

export interface LifecycleThresholds {
  readonly newWithinDays: number;
  readonly staleAfterDays: number;
}

/** What the state is read from. Deliberately not the whole listing. */
export interface LifecycleFacts {
  readonly status: JobStatus;
  readonly firstSeenAt: Date;
  /** Null when the source has never confirmed the listing since discovery. */
  readonly lastVerifiedAt: Date | null;
  /**
   * The employer's own posting date. Null when the source published none.
   *
   * Newness is read from this and never from `firstSeenAt`, and the difference
   * is not pedantic. When the Queensland corpus was backfilled, 2,713 listings
   * acquired the same discovery date within a day, and every row on every page
   * of results announced itself as new. That label was a statement about our
   * crawler wearing the clothes of a statement about the job.
   *
   * So a listing with no posting date is never called new. We do not know when
   * it was advertised, and saying otherwise would publish our own schedule as
   * if it were the employer's.
   */
  readonly postedAt: Date | null;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / MS_PER_DAY;
}

/**
 * The listing's current state.
 *
 * Order matters. A withdrawn or expired listing is that regardless of its
 * dates, so the stored decisions are checked first: ingestion knows something
 * the timestamps do not, which is that the source stopped carrying it.
 *
 * Staleness is checked before newness, because they can both be true and only
 * one of them is worth telling a reader. A listing posted two days ago and
 * never confirmed since is not a fresh find; it is a listing nothing has
 * verified. That combination means a crawl reached it once and has not been
 * back, which is exactly what a reader needs warning about.
 */
export function lifecycleOf(
  facts: LifecycleFacts,
  thresholds: LifecycleThresholds,
  now: Date = new Date(),
): LifecycleState {
  if (facts.status === 'WITHDRAWN') return 'REMOVED';
  if (facts.status === 'EXPIRED') return 'EXPIRED';

  // Never confirmed since discovery, and discovery is no longer recent. The
  // null is not treated as "verified at first sight": the source confirming a
  // listing is an event, and one that has not happened has not happened.
  const verifiedDaysAgo =
    facts.lastVerifiedAt === null
      ? daysBetween(facts.firstSeenAt, now)
      : daysBetween(facts.lastVerifiedAt, now);

  if (verifiedDaysAgo > thresholds.staleAfterDays) return 'STALE';

  // Newness is the employer's fact or it is not stated. See `postedAt` above.
  if (
    facts.postedAt !== null &&
    daysBetween(facts.postedAt, now) <= thresholds.newWithinDays
  ) {
    return 'NEW';
  }

  return 'ACTIVE';
}

/**
 * Whether a state should be shown to a reader at all.
 *
 * Search already excludes expired and withdrawn rows at the query, and this
 * exists so a second reader of the same rule cannot reach a different answer.
 */
export function isPubliclyVisible(state: LifecycleState): boolean {
  return state !== 'EXPIRED' && state !== 'REMOVED';
}

/**
 * How each state is described to a reader, or null where it needs no label.
 *
 * ACTIVE is deliberately unlabelled. It is the ordinary case and marking it
 * would put a badge on every row, which teaches a reader to stop reading
 * badges, and the verification date is already printed beside it.
 */
export function lifecycleLabel(state: LifecycleState): string | null {
  switch (state) {
    case 'NEW':
      return 'New';
    case 'STALE':
      return 'Not recently confirmed';
    case 'EXPIRED':
      return 'No longer advertised';
    case 'REMOVED':
      return 'Withdrawn';
    case 'ACTIVE':
      return null;
  }
}
