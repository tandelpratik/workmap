/**
 * How a listing ages.
 *
 * These three numbers were previously two private constants in each ingestion
 * module and nothing at all in the interface, which meant the crawler and the
 * page could disagree about whether a listing was current and neither would
 * know. They are one setting now, and the ordering between them is the whole
 * design:
 *
 * ```text
 *   0 ──── new ──── 3 ─────── current ─────── 7 ─── stale ─── 14 ─── expired
 *        first seen                       last verified              retired
 * ```
 *
 * The window between `staleAfterDays` and `expireAfterDays` is deliberate. A
 * listing does not go from confirmed to gone in one step: for a week before it
 * is retired it is shown with its age stated, so a reader can weigh it rather
 * than being handed a stale advertisement or having it disappear without
 * explanation. Sending someone to a filled vacancy is the worst thing a job
 * board can do; hiding a live one is the second worst.
 *
 * `staleAfterDays` matches the interval at which the Queensland crawler
 * refreshes a listing it already holds. That is not a coincidence and must stay
 * true: a listing counted stale before the crawler was ever going to revisit it
 * would mark the whole corpus stale on a schedule of our own making. A test
 * asserts the ordering.
 */

export const lifecycle = {
  /**
   * Days after the employer posted it that a listing is still marked as new.
   *
   * Measured from the posting date and never from when we found it. A backfill
   * gives thousands of listings the same discovery date, and reading newness
   * off that put a "New" label on every row of every page at once.
   */
  newWithinDays: 3,

  /**
   * Days since the source last confirmed a listing before it is shown as
   * unconfirmed. Must not be shorter than the refresh interval.
   */
  staleAfterDays: 7,

  /**
   * Days since a listing was last seen before it is retired from search.
   *
   * Retired, not deleted. An expired advertisement leaves search and stays on
   * record, because deleting it would destroy the evidence that it existed.
   */
  expireAfterDays: 14,

  /** How often ingestion revisits a listing it already holds. */
  refreshAfterDays: 7,
} as const;
