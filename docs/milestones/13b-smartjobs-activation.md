# Milestone 13b: Queensland activated, and the crawler that saw a twentieth of the portal

- **Date:** 2026-09-06
- **Prompts:** `13_job_ingestion`, operating a second provider rather than
  building one
- **Outcome:** Complete. `smartjobs-qld` is `ACTIVE` and `VERIFIED`, the crawler
  reaches the whole portal, and a run that dies no longer wedges the source.
  2,213 Queensland listings are stored, which is the portal in full.

## What changed, in one line

The source was switched on, and the first real crawls then showed that our own
adapter could see only about 56 of the portal's 2,127 rows. Both causes were
ours, both were silent, and both are fixed.

## Activation

[Milestone 13a](13a-smartjobs-ingestion.md) built the adapter and the ingestion
path and deliberately left the source `PENDING`: the licence was verified on
2026-08-31, the code was tested against fixtures, and starting to crawl a live
public service was left as a separate decision. The product owner took it on
2026-09-01, and `config/sources.ts` moved to `ACTIVE`.

That order is the point of the two axes in
[ADR-0009](../adr/0009-source-activation-and-synthetic-containment.md).
Permission, capability and the decision to begin are three different things.
The registry test now asserts the new membership of both gated lists rather
than leaving a reviewer to notice it.

Queensland is the fourth production-eligible source and the second that may be
aggregated, which is what makes the crawl worth its cost: Adzuna's terms bar
counts and averages, so it can never support a published figure. What a licence
permits and what a number means remain separate questions. These are Queensland
Government vacancies, never the Queensland labour market, and anything
published from them has to say so.

## The failure worth recording: a source that looked small

The first crawls stored 25 listings, then about 56. The portal reports 2,127.
It would have been easy to write that down as "deep pagination decays" and move
on, because that is exactly what it looked like from outside: pages returning
20 rows, then 14, then 12, then 9, then 1, then nothing.

It was not the portal. Two faults of ours produced it, and they share a
signature that matters more than either bug on its own: **each made the source
look far smaller than it is, without erroring.**

1. **The parser followed one link form out of two.** The portal writes some
   results as `jncustomsearch.viewFullSingle?...&in_jnCounter=N` and others as a
   vanity path such as `/jobs/QLD-QLD-PTCAP2026`, mixed inside one page.
   `parseRow` matched the first form only and returned `null` for the rest,
   which is the same value it returns for a list item that is not a result at
   all. Roughly 40 per cent of the rows on a deep page were dropped without a
   word. The detail pages behind both forms are identical.
2. **A single dropped connection ended the crawl.** The client had no retry, so
   one transient network failure stopped the paging walk and the run carried on
   with whatever it happened to have.

The identifier taken from a link is now `rowRef` rather than `jnCounter`,
because it is a counter on one form and a slug on the other. It addresses a
row, not a vacancy, and it is still never the idempotency key: the stable
`QLD/...` reference on the detail page is.

Transient failures are retried twice with increasing backoff. A 4xx is never
retried, because repeating a request the server has already refused is both
useless and rude, and retries count against the request budget, so a struggling
host cannot be hammered under cover of the ceiling.

## Reaching a budget is not a fault

The client used to throw `SmartJobsRequestError` when a run reached its own
request ceiling, and the ingestion recorded that as a quarantined record. A
healthy bounded run therefore reported data problems it had not had.

`SmartJobsBudgetReached` is now its own type and is never quarantined. A
quarantine count has to mean "this data was wrong", or nobody can read it. The
outcome carries `stoppedOnBudget` instead, so a run that covered a tenth of the
portal is legible as partial rather than looking like a complete crawl of a
small source.

## Durability, which the long crawls made unavoidable

At two requests per listing and 1.5 seconds between them, a full pass is around
90 minutes. At that length, things that never happen in a three second run
happen routinely.

- **Listings are written in batches of 25 as they are fetched**, not
  accumulated and written at the end. A run that held everything in memory lost
  all of it when the connection dropped: an hour of polite crawling produced
  nothing, and the next run refetched the same pages. Committing as it goes
  means an interrupted run leaves its work behind and the next run skips it.
- **Recording a failure may not mask the failure.** The handler that marks a run
  `FAILED` needs the database, and the likeliest reason a long run dies is that
  the database went away. That update now fails quietly into a log line, and the
  original error is always the one that propagates.
- **Abandoned runs are released automatically.** Only one `RUNNING` run is
  allowed per source and dataset (ADR-0005), which is right, but on its own it
  has no way back: a killed process leaves a row saying `RUNNING` forever, and
  every later run is refused by a lock held by nothing. A run older than two
  hours is now treated as abandoned and marked `FAILED`, keeping its row and
  carrying the reason. The threshold is generous on purpose: the longest real
  run measured here was 53 minutes, and killing a healthy long run would be
  worse than waiting. This is not hypothetical. It happened here on 2026-09-05
  and the source had to be freed by hand; two abandoned runs in the history have
  since been released by the reaper instead.

## Measured, on the live portal

The run of 2026-09-05, 19:15 to 20:03 UTC:

| Figure             | Value                          |
| ------------------ | ------------------------------ |
| Rows walked        | 2,118 of the 2,127 reported    |
| Duration           | 48 minutes                     |
| Listings written   | 492                            |
| Skipped as fresh   | 252, costing no detail request |
| Quarantined        | 0                              |
| Unresolved regions | 0                              |

### The fill, 2026-09-07

Two further runs closed the gap. The first was killed at about 1,100 listings
when the process that owned it went away, and kept every one of them, which is
the batched write earning its place. The second finished the job:

| Figure            | Value                                  |
| ----------------- | -------------------------------------- |
| Requests          | 475 of a budget of 800                 |
| Duration          | 27 minutes                             |
| Rows walked       | 2,080 of the 2,095 the portal reported |
| Details fetched   | 369, all of them new                   |
| Skipped as fresh  | 1,710, costing no request              |
| Quarantined       | 1                                      |
| Expired           | 0                                      |
| Stopped on budget | No. The walk finished                  |

**2,213 listings are stored and all are active.** That is more than the 2,095
the portal reported on the day, because the corpus keeps listings last
advertised on an earlier crawl: 2,079 of them were seen today, and the
remaining 134 will retire through the expiry window if the portal keeps not
advertising them.

The steady state is now the cheap one. A run costs the search walk plus a
detail page only for what is new or past the refresh window, which is why 2,080
rows cost 475 requests rather than 4,000.

The one quarantined listing, `QLD-699105-26`, has failed twice on the same
fault: its JSON-LD carries a bad escape sequence and is not valid JSON. It is
one row in 2,080, it is recorded rather than guessed at, and no listing is
invented to stand in for it.

## The defect the fill exposed: seen is not verified

Found while checking whether a budget-bounded run could retire a listing it had
simply not reached. It could, and this is the same failure the whole source has
been prone to: something that quietly makes the corpus smaller than the truth.

`expireStale` retires any listing whose `lastSeenAt` is older than fourteen
days. But `lastSeenAt` was only being touched for listings the run classified
as **fresh**. A listing goes stale after seven days, joins the fetch queue, and
if the request ceiling never reaches it, its `lastSeenAt` stands still while
the portal advertises it on every single run. On day fourteen it was retired: a
live vacancy removed from search by our own request budget rather than by the
employer withdrawing it. The same held for any listing whose detail page fails
to parse, which needs no budget pressure at all and would have taken
`QLD-699105-26` out in a fortnight.

The two columns mean different things and the code was conflating them.
`lastSeenAt` means the portal is still advertising this, which the search walk
proves for every row it reads. `lastVerifiedAt` means we read the detail page,
which only a detail fetch may claim. So every stored listing the walk sees is
now touched, whatever happens to its detail page afterwards, and
`lastVerifiedAt` is left alone.

A second guard sits behind it: **only a run that walked the whole portal may
retire anything.** A partial walk has established nothing about the listings it
never reached, so its silence about them is our shortfall rather than an
employer's withdrawal. A run that stops early expires nothing and says so.

Both regression tests were confirmed to fail against the previous code before
the fix went in. Without it the first reports listings expired on a run that
had just seen them advertised.

This was not hypothetical for live data. The 744 listings stored on 2026-09-05
would have gone stale on 09-12, and any the budget kept missing would have
started disappearing from search on 09-19.

## Files changed

- `config/sources.ts`, `tests/source.test.ts`
- `integrations/smartjobs-qld/client.ts`, `parser.ts`, `types.ts`
- `ingestion/smartjobs-qld.ts`, `ingestion/stale-runs.ts`
- `scripts/ingest-smartjobs-qld.ts`
- `tests/smartjobs-qld.test.ts`, `tests/stale-runs.test.ts`
- `docs/compliance/SOURCE_REGISTER.md`,
  `docs/compliance/DIRECT_SOURCE_FEASIBILITY.md`

## Decisions

- **Retries count against the request budget.** The ceiling is a promise about
  how much traffic we send a public service that publishes no rate limit, not a
  count of successful requests. A retry is a request.
- **Region filtering was tried and abandoned.** Partitioning the result set into
  shallow slices would have avoided deep paging entirely, but `in_multi01_id`
  alone is ignored by the portal and returns the unfiltered total; it needs its
  paired label field. It is unnecessary now that paging works, and probing
  another party's form fields to slice their data is not something to do
  speculatively.
- **The staleness threshold is a clock, not a heartbeat.** A heartbeat would be
  more precise and would need a writer inside the crawl loop, which is the part
  most likely to be broken when this matters.

## Open issues

1. ~~**Nothing schedules the Queensland crawl.**~~ **Resolved 2026-09-06.** It
   runs daily at 16:00 UTC from GitHub Actions, not Vercel Cron: a Hobby
   function is capped at 60 seconds, which at 1.5 seconds a request is about 38
   listings a day against a portal of 2,127 whose stored copies go stale after
   a week. It would never converge. The pacing was not the thing to change, so
   the scheduler moved. See
   [`.github/workflows/ingest-smartjobs-qld.yml`](../../.github/workflows/ingest-smartjobs-qld.yml)
   and the [deployment runbook](../DEPLOYMENT.md). It needs a `DATABASE_URL`
   repository secret before its first run.
2. ~~**Deduplication has not met the Queensland corpus.**~~ **Run 2026-09-06:**
   1,244 listings examined across two live sources, zero groups. The first real
   cross-source check, and the answer is that these two corpora do not overlap
   yet. See [milestone 15](15-deduplication.md).
3. **A handful of rows go unaccounted for on every walk**: 2,118 of 2,127 on
   09-05, and 2,080 of 2,095 on 09-07. Small enough to be listings withdrawn
   mid-crawl, which is expected on a live portal, but that has not been shown.
4. ~~**The corpus is a third of the portal.**~~ **Filled 2026-09-07.** 2,213
   listings, all active.
5. **One listing cannot be ingested at all.** `QLD-699105-26` publishes JSON-LD
   containing a bad escape sequence, so it is not valid JSON. It has been
   quarantined on two runs. One row in 2,080, recorded rather than guessed at,
   and a candidate for a tolerant parse only if more listings start failing the
   same way.
6. **The expiry path is now correct but unexercised in production.** Nothing has
   expired yet, because everything held has been seen recently. The first real
   test is the 134 listings currently in the corpus that today's walk did not
   see: they should retire around 09-21, and no listing the portal still
   advertises should go with them.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 333 of 333
- [x] Typecheck, lint, format pass
- [x] Verified against the live portal, not only fixtures
- [x] Compliance register and feasibility study updated
- [x] Pacing, request ceiling and refusal handling unchanged in spirit: no
      source is asked for more than before, and a refusal is never retried
- [x] Both expiry regression tests confirmed failing against the previous code
- [x] Corpus filled and audited against the portal's own reported total
