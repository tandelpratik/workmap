# Milestone 11a: the aggregation moves into Postgres

- **Date:** 2026-09-04
- **Prompts:** part of `32_performance`, brought forward
- **Outcome:** Complete. The map and occupation pages went from 4 to 7.6
  seconds to about one second, with identical figures.

## Why it was brought forward

The next step after milestone 11 was to deploy: seven commits of work existed
only on one machine. Measuring the production build first turned that around,
because deploying four-second pages is shipping a bad product on purpose.

## What was measured

A production build, warm requests, from a development machine:

| Page              | Before | After |
| ----------------- | ------ | ----- |
| `/map`            | 4.03s  | 1.00s |
| `/map?state=1`    | 5.10s  | 1.20s |
| `/occupations`    | 4.85s  | 1.00s |
| `/occupations/26` | 7.62s  | 1.03s |
| `/` (job search)  | 1.58s  | 1.55s |

The first instinct was wrong and worth recording. The map projects boundaries
on every request, so the geometry looked like the obvious suspect. It is not:
projecting the national map takes 95 to 176ms. Timing each piece separately
found the database.

| Call                      | Before  | After  |
| ------------------------- | ------- | ------ |
| `listRegionTotals`        | 8,235ms | ~1.0s  |
| `listOccupationTotals`    | 5,526ms | ~0.9s  |
| `listOccupations`         | 2,172ms | ~0.43s |
| `buildChoroplethGeometry` | 176ms   | ~0.1s  |

One empty round trip to this database from this machine costs 407ms, so every
one of these is now at its floor: what remains is latency, not work.

## The honest caveat about those numbers

Most of the seconds above are a development machine talking to Neon in Sydney.
In production, Vercel and Neon are in the same region and a round trip is tens
of milliseconds, so these pages were always going to be faster there than the
"before" column suggests.

What does not change with geography is the shape of the problem.
`listOccupationTotals` made four sequential round trips and pulled 8,550 rows
across the wire to compute 57 numbers in JavaScript. That is free-tier compute
and Neon data transfer spent on arithmetic Postgres does for nothing, and it is
what [ADR-0004](../adr/0004-postgresql-first.md), "PostgreSQL-first search and
analytics", already decided against. The code was out of step with its own
architecture decision, which is the real argument here; the stopwatch is
supporting evidence.

## What changed

**Aggregation moved into SQL.** `listOccupationTotals` is now one grouped query
with `filter` clauses reading both periods in a single pass, returning 57 rows.
`listOccupations` is a `SELECT DISTINCT` returning 107 rows instead of 2,850.
`listRegionTotals` is one query joining areas, series and two months of metrics
with two left joins, instead of four calls assembled in the application.

**Queries are parameterised**, not interpolated. Every value travels as a bound
parameter through Prisma's tagged template, including the level list, which
arrives as a text array and is compared against the enum with an explicit cast.

**Pages overlap their reads.** The map page needs regional figures, the state
list and the occupation vocabulary, and none depends on another, so they run
together. The occupation the reader asked for is fetched before it has been
checked against the vocabulary, because that check is itself one of the three
reads; a code the release does not carry costs one extra query, which is the
rare path and the right one to leave slow.

## What made this safe to do

The tests written in the previous two milestones were the point. The sum must
equal what the regional query returns, no occupation group may exceed all
occupations, and a region with no figure must never appear as one with a
figure. A rewrite that changed an answer would have failed them.

Beyond that, every figure was compared before and after against the running
app: 50 regions nationally and 14 in New South Wales, Greater Sydney at 42,880
with a change of +1,483, the occupations headline at 205,954, and ICT
Professionals at 6,053 with a change of +15 across 50 of 50 regions. All
identical.

## The left joins carry a distinction worth keeping

A region with no metric row for a period is a gap. A region with a row whose
value is null was measured and reported as absent, and its state says why.
Written as SQL these look the same until they are separated deliberately: the
query returns the value state, and a null state means no row exists. Collapsing
them would turn "not published" into "no data" (ADR-0002), which is the exact
distinction the map draws differently.

## Files changed

- `db/repositories/labour-market.ts`
- `app/map/page.tsx`, `app/occupations/[code]/page.tsx`

## Open issues

1. **`listByLevel` is still ~1.1s for ten rows**, which is more than one round
   trip should cost. It is Prisma with a relation include, and it now runs in
   parallel with everything else, so it no longer sets the page's pace. Worth
   looking at when milestone 32 proper arrives.
2. **Nothing is cached.** Both pages are `force-dynamic` and the data changes
   once a month. That is the largest remaining win and it belongs with a
   deliberate caching decision, not with this.
3. **No index review.** These queries were not explained, only timed. Their
   shape suggests the existing indexes suffice at this size, which is a guess
   until measured.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 286 of 286
- [x] Typecheck, lint, format pass
- [x] Production build succeeds
- [x] Measured before and after on a production build, not estimated
- [x] Every displayed figure compared before and after, and unchanged
- [x] Queries parameterised, no interpolated input
- [x] Documentation updated
