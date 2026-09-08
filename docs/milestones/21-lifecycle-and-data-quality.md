# Lifecycle and data quality

A listing now says where it is in its life, the three freshness thresholds live
in one place instead of four, and fifteen invariants the schema cannot express
are checked by a command that exits non-zero when one breaks.

Two bugs surfaced from running the new tooling against real data rather than
from reading the code. Both are recorded below, because how they were found is
the more useful half.

## Where a listing is in its life

Five states, and only two of them are stored.

`status` in the database records the decisions ingestion made: a listing is
ACTIVE, or it was retired because the source stopped confirming it, or it was
withdrawn. NEW and STALE are not columns. They are statements about how long ago
something happened, and a column holding one of those is a cache of a clock:
correct until the next tick, and needing a scheduled sweep to rewrite rows for
no reason other than that time passed. This project has already been bitten once
by two freshness columns drifting apart (milestone 13b), and the fix there was to
make each meaning exact rather than to add a third.

So they are derived, every time, from dates the listing already carries. There
is nothing to keep in sync.

### The window that was missing

```text
  0 ──── new ──── 3 ─────── current ─────── 7 ─── stale ─── 14 ─── expired
       posted at                        last verified              retired
```

A listing did not previously go from confirmed to gone in one step so much as
give a reader no way to tell the difference. It was shown identically whether
the source had confirmed it that morning or nine days earlier, and then it
vanished. For the week before retirement it now carries **Not recently
confirmed**, so a reader can weigh it. Sending someone to a filled vacancy is
the worst thing a job board can do; hiding a live one is the second worst.

The wording is deliberate. "Expired" would be a claim about the vacancy;
"not recently confirmed" is a statement about what we have checked, which is the
only one of the two we can support.

### One place for the thresholds

`expireAfterDays` and `refreshAfterDays` were private constants in two ingestion
modules and nothing at all in the interface, which meant the crawler and the
page could disagree about whether a listing was current and neither would know.
`config/lifecycle.ts` holds all four now, and the ordering between them is
asserted: staleness must not be shorter than the refresh interval, or the whole
corpus would go stale on a schedule of our own making and the symptom would look
like a source problem.

## The bug the interface found

Everything on every page said **New**.

`NEW` was read from `firstSeenAt`, when we first discovered a listing. The
Queensland corpus was backfilled on 7 September, so 2,713 listings acquired the
same discovery date within a day, and the label appeared on every row of every
one of 136 pages. A label on 100% of rows conveys nothing, which is exactly the
failure mode the code comment beside it warned about while causing it.

The deeper fault was not the threshold. It was that newness was being read off
our crawl schedule and presented as a fact about the job. Newness is the
employer's fact, so it now comes from `postedAt`, and a listing whose source
published no posting date is never called new at all: we do not know when it was
advertised, and saying otherwise would publish our own schedule wearing the
employer's clothes.

| Page | Marked new, before | After |
| ---- | ------------------ | ----- |
| 1    | 20 of 20           | 20    |
| 20   | 20 of 20           | 2     |
| 80   | 20 of 20           | 6     |
| 130  | 18 of 18           | 0     |

Page one is sorted newest first, so twenty out of twenty there is correct.

## The bug the checks found

The first quality run reported `{"passed":"[redacted]","failed":1}`.

The logger redacts by key pattern, and the pattern began `pass(word)?` matched
as a substring. Any key containing "pass" was redacted: `passed`, `passes`,
`bypassed`. Over-redaction is the safe direction and it is not free, because an
operator who cannot read the log cannot use it, and this is a report whose whole
purpose is to be read.

The branch now ends at a lookahead: every form that is actually a credential is
still caught, and ordinary words are not. Tests pin both directions, because a
later edit could loosen it too far or tighten it back.

That run also reported six failures for sources with `attributionRequired` and
no stored wording: `anzsco`, `jobs-wa`, `workday`, `pageup`, `iworkfor-nsw`,
`careers-vic`. All are blocked or pending and none displays anything, so the
flag was recording what would be owed if they were ever switched on. That is a
real fact and not an unmet obligation, and reporting it as one would have left
six permanent failures on the board, which teaches everyone to ignore the board.
The check is scoped to production-eligible sources.

## What is checked

`npm run data:check`. Read only, safe against production at any time, exits
non-zero on failure so it works as a deployment gate as well as a thing to run
by hand.

| Check                               | Asserts                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------- |
| `counts.non-negative`               | No stored figure is below zero                                             |
| `metrics.missingness-modelled`      | A figure is present exactly when its state says it was measured            |
| `geography.series-resolved`         | Every series naming a region resolves to a real ASGS area                  |
| `geography.hierarchy-complete`      | Every area below the country has a parent                                  |
| `occupations.classified`            | Every occupation carries a classification version and a name               |
| `jobs.no-duplicate-live-listings`   | No two canonical live listings share an application URL                    |
| `jobs.dates-possible`               | No future posting or verification date; nothing expired before it was seen |
| `sponsorship.evidenced`             | Every finding about what an advertisement said quotes the wording          |
| `licensing.source-registered`       | Every live listing comes from a source in the registry                     |
| `licensing.source-eligible`         | Every live listing comes from a source still permitted in production       |
| `rights.description-withheld`       | No description is stored for a source whose matrix refuses it              |
| `privacy.no-contact-details-stored` | No stored description carries an email address or phone number             |
| `attribution.text-available`        | Every publishing source stores its required wording verbatim               |
| `attribution.licence-linkable`      | Every source with established rights names a linkable licence              |
| `lifecycle.thresholds-ordered`      | New precedes stale, stale is no shorter than refresh, expiry follows       |

Current state against the live database: **15 passed, 0 failed, 0 skipped.**

Two properties are deliberate. A check reports counts and identifiers and never
the offending content, because a quality report is pasted into an issue and must
not become a second copy of the data it is checking. And a machine with no
database reports the stored-data checks as **skipped**, never as passed: a gate
that reports success it has not earned is worse than no gate, because it is
trusted.

`privacy.no-contact-details-stored` closes the loop on the previous milestone. It
proves the minimisation filter is on the write path rather than merely existing.

## Files

| Path                            | Change                                         |
| ------------------------------- | ---------------------------------------------- |
| `config/lifecycle.ts`           | New. The four thresholds and their ordering    |
| `domain/lifecycle.ts`           | New. Derived states, pure                      |
| `analytics/quality.ts`          | New. Fifteen checks and the report             |
| `scripts/check-data-quality.ts` | New. `npm run data:check`                      |
| `lib/logger.ts`                 | The `pass` branch stops eating ordinary words  |
| `domain/job.ts`                 | `firstSeenAt` and `status` on the listing      |
| `db/repositories/job.ts`        | Carries them through                           |
| `components/job-list.tsx`       | Lifecycle state, in words rather than colour   |
| `ingestion/adzuna.ts`           | Reads the shared thresholds                    |
| `ingestion/smartjobs-qld.ts`    | Reads the shared thresholds                    |
| `docs/BACKLOG.md`               | New. Deferred work and what each item waits on |

## Checks

`npm run check` clean: Prettier, ESLint, TypeScript, and 469 tests (from 443).
`npm run build` succeeds. `npm run data:check` passes 15 of 15 against the live
database. Lifecycle distribution verified across four pages of live results.

## Not done here

- The legal pages and indexation, both blocked on brand identity. See
  [BACKLOG.md](../BACKLOG.md).
- A deployment gate wiring `data:check` into CI. The command is the hard part
  and it exists; making a pipeline call it is a separate change.
- Source health monitoring. Ingestion runs and errors are recorded and nothing
  reads them back yet.
