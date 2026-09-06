# Milestone 13b: Queensland activated, and the crawler that saw a twentieth of the portal

- **Date:** 2026-09-06
- **Prompts:** `13_job_ingestion`, operating a second provider rather than
  building one
- **Outcome:** Complete. `smartjobs-qld` is `ACTIVE` and `VERIFIED`, the crawler
  reaches the whole portal, and a run that dies no longer wedges the source.
  744 Queensland listings are stored.

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

744 Queensland listings are stored in total. The portal is not mirrored yet:
detail fetches are bounded by the request budget, so each run advances the
corpus and the listings already held cost nothing on the next pass. That is the
design working rather than a shortfall, but it does mean the Queensland corpus
must not be read as the whole portal until several more runs have gone by.

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
3. **Nine rows are unaccounted for**, 2,118 walked against 2,127 reported. Small
   enough to be listings that expired mid-crawl, which is expected on a live
   portal, but that has not been shown.
4. **The corpus is a third of the portal.** 744 listings of about 2,127. Each
   scheduled run advances it, and the runbook records how to fill it in one
   pass instead of waiting.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 331 of 331
- [x] Typecheck, lint, format pass
- [x] Verified against the live portal, not only fixtures
- [x] Compliance register and feasibility study updated
- [x] Pacing, request ceiling and refusal handling unchanged in spirit: no
      source is asked for more than before, and a refusal is never retried
