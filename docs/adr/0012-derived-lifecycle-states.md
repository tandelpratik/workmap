# ADR-0012: Listing lifecycle derived from timestamps, not stored

- **Status:** Accepted
- **Date:** 2026-09-08
- **Milestone:** 21 (Lifecycle and data quality)
- **Amends:** ADR-0005

## Context

A listing needs five states to be described honestly: newly advertised,
current, not recently confirmed, retired, withdrawn. The database has three,
and they are decisions ingestion made rather than descriptions of elapsed time.

The obvious implementation is a column with five values and a scheduled job that
moves rows between them. It is obvious enough that it will be proposed again,
which is why this record exists.

Two of the five are not facts about a listing. They are facts about **how long
ago** something happened, and a column holding one of those is a cache of a
clock: correct until the next tick, and requiring a sweep to rewrite rows for no
reason other than that time passed. On a free tier that is a scheduled write
amplification over the whole corpus, producing a value that could have been
computed from columns already present.

This project has been bitten by exactly this once. Milestone 13b found expiry
reading a `lastSeenAt` that only some runs refreshed, so a listing the crawl
budget never reached could be retired while the portal advertised it throughout.
The fix was to make the meaning of each timestamp exact, not to add another.

## Decision

**`status` stores the decisions ingestion made. `NEW` and `STALE` are derived on
read from `postedAt`, `firstSeenAt` and `lastVerifiedAt`, every time.**

```text
  0 ──── new ──── 3 ─────── current ─────── 7 ─── stale ─── 14 ─── expired
       posted at                        last verified              retired
```

The thresholds live in one place, `config/lifecycle.ts`, and ingestion reads the
same values the interface does. They were previously private constants in two
ingestion modules and absent from the interface entirely, which meant the crawler
and the page could disagree about whether a listing was current and neither would
know.

Their ordering is a constraint, not a preference, and a check asserts it.
Staleness shorter than the refresh interval would mark the whole corpus stale on
a schedule of our own making, and the symptom would look like a source problem.

**Newness is read from the employer's posting date, never from ours.** This was
found by looking rather than reasoning: the first implementation read
`firstSeenAt`, and a backfill gave 2,713 listings the same discovery date, so
every row of every page announced itself as new. The deeper fault was not the
threshold. It was publishing our crawl schedule as a fact about the job. A
listing whose source published no posting date is therefore never called new at
all.

## Consequences

**Accepted: the state is computed on every render.** It is arithmetic on two
dates and costs nothing measurable next to the query that fetched the row.

**Accepted: a listing's state can change with no write.** A row untouched for
eight days becomes stale by the passage of time. That is the property being
bought: there is nothing to keep in sync, and no sweep that can fail and leave
the corpus describing itself wrongly.

**Accepted: the domain function needs facts the row must carry.** `postedAt`,
`firstSeenAt`, `lastVerifiedAt` and `status` all travel on the listing. That is
four columns to serve two derived values, and all four were already stored for
other reasons.

**Rejected: a scheduled job that promotes rows between states.** It would write
the whole corpus on a schedule to produce values already implied by columns
present, and it would introduce a failure mode where the sweep does not run and
every listing quietly claims to be current.

**Rejected: `NEW` from `firstSeenAt` with a shorter window.** No window makes a
backfill look like a burst of new advertisements, because the problem is the
column and not its threshold.
