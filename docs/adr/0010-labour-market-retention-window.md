# ADR-0010: A two-period retention window for labour market history

- **Status:** Accepted
- **Date:** 2026-09-04
- **Milestone:** 09 (Vacancy map), revision
- **Amends:** ADR-0005

## Context

The July 2026 IVI release carries 91 monthly reference periods across 2,850
series. Imported in full it is 259,350 rows, and it is one release of one
dataset: every future release brings the same history again, and the occupation
and skill datasets that milestones 11 and 20 will add have the same shape.

The product displays one month and its change on the month before. Nothing
reads the other 89 periods, and nothing is planned to read them until
milestones 06 and 07 build history and trend.

The product owner's instruction was direct: keep two months, the rest is of no
use. This record exists because that instruction has a consequence worth
writing down rather than discovering later.

The constitution's free-tier rules ask for small payloads and limited
background work. A row budget is the binding constraint on the free tier, and
spending 98 per cent of it on data no reader can reach is the kind of cost that
never announces itself until a limit is hit.

## Decision

**Labour market history is retained at the two most recent reference periods
per dataset. The window is a configuration value, and the published workbook
remains the record of everything outside it.**

Three parts, and the first is the one that matters:

1. **The window is applied on the way in, not afterwards.** `ingestion/retention.ts`
   narrows parsed series before any write, so a full release costs 5,700 writes
   rather than 259,350 followed by 253,650 deletes. Importing to prune would put
   the entire cost back.
2. **The window is taken from the file, not from the clock.** A release
   published in August reports July, and a release imported from an archive
   reports whatever it reports. Anchoring on "the last two calendar months"
   would silently discard a whole file that arrived late.
3. **Stored history outside the window is pruned**, dataset-wide, after each
   import and on demand through `npm run jsa:prune`. Periods are deleted oldest
   first, one statement each, because the first prune removes a quarter of a
   million rows and an unbounded `DELETE` against a free-tier database is how
   housekeeping becomes an incident.

Two is the floor rather than a preference: one period cannot express a change,
so every month-on-month figure would become "no comparison available". A test
asserts the floor.

This is the one place in the system where deleting is correct. Everywhere else
records are expired rather than deleted, because deleting destroys the evidence
that something existed. Here the evidence is the publisher's own workbook, and
these rows are a copy of a fraction of it.

## Consequences

**Accepted**

- **Trend is not available from the database.** Milestones 06 and 07 cannot be
  built against stored data as it now stands. They need the window widened and
  a re-import first, which is a configuration change and a command, not a
  redesign.
- **Recovery depends on the workbook being kept.** `data/raw/` is gitignored
  because it is reproducible rather than source, so a release file that is
  deleted and no longer published by JSA is genuinely gone. The raw file is
  worth keeping.
- **Importing an older release after a newer one writes rows the prune then
  removes.** The outcome reports both numbers rather than hiding it.

**Gained**

- 5,700 rows instead of 259,350, on a free tier whose limit is rows.
- The month-on-month change the detail panel shows, which two periods is
  exactly enough for and one is not.
- A single configuration value to raise when history is wanted, with the
  importer and the prune already reading it.

## Alternatives rejected

- **Import everything and display two months.** The straightforward option, and
  the one this replaces. It spends the row budget on data with no reader, and
  every future dataset multiplies it.
- **Import everything, aggregate, then drop the detail.** Milestone 07's job,
  and an aggregate of a series is not a substitute for it. Premature here, and
  it would still pay the write cost.
- **A time-based window, "the last 60 days".** Ties retention to the clock
  rather than to the data, so a late release or an archived one is discarded by
  a rule that was meant to bound storage.
- **Keep one period.** Removes month-on-month change from the product without
  saving anything meaningful against two.
