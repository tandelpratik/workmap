# Milestone 13a: Queensland ingestion, built but not activated

- **Date:** 2026-09-04
- **Prompts:** `13_job_ingestion`, for a second provider
- **Outcome:** The ingestion path is complete and tested. **No live crawl has
  run**, and the source is still `PENDING`. Both need the product owner.

## Why this source

The [feasibility study](../compliance/DIRECT_SOURCE_FEASIBILITY.md) found one
live listing source whose licence permits both republication and aggregation.
Adzuna powers search and is barred from counts and averages; JSA IVI powers
every published figure and carries no individual listings. Queensland Smart
Jobs is the only source found that could do both, which makes it the one that
would let the product's statistics rest on listings it holds rather than only
on someone else's index.

The adapter has existed since 2026-08-31 and was dead code until now.

## The shape of the problem: two requests per listing

The portal publishes no API. A search page is cheap and carries the region
vocabulary, but the stable reference `QLD/164089` and the dates live on each
listing's own detail page. With roughly two thousand vacancies advertised, a
naive crawler that fetched every detail on every run would make four thousand
requests against a public service that publishes no rate limit and asks nothing
of anyone. That is not a budget question. It is a manners question.

So a run does the least it can:

- It pages the search results and reads the rows.
- It fetches a detail page **only** for a listing it has not stored, or one
  whose stored copy has gone stale, by default after a week.
- Everything else is a freshness touch and costs no request at all.
- The request budget is a hard ceiling. A run stops when it reaches it, records
  what it did, and leaves the rest for the next one.

A second run minutes after the first costs one search page. A test asserts
exactly that: after the first run stores the listings, the second fetches zero
details, and the stub portal confirms it was never asked.

## Placing a listing without inventing a place

This is why the source was worth building. The portal names regions from a
closed list, `regions.ts` maps each to an ABS SA4 name that was checked against
the imported registry, so placing a listing is a lookup rather than free-text
geocoding.

A listing naming several regions is placed at the first one that maps, which is
a real limitation, recorded rather than hidden: the raw text keeps every region
the portal named, so a later milestone can place one advertisement in several
areas without refetching anything. An unmapped region falls back to the state,
never to an approximation, because "close to Cairns" would be a fabricated
geography mapping.

## What is deliberately not done

**No live crawl.** Nothing in this milestone has touched the portal. Everything
is exercised against markup captured on 2026-08-31. Running a crawler against a
live government service is an action with effects outside this repository, and
it is the product owner's to authorise.

**The source is still `PENDING`.** It is `VERIFIED`, meaning the licence
permits use, and `PENDING`, meaning it is not turned on. Activation is a
deliberate decision under ADR-0009 and the gate refuses rather than warns: a
test calls the real function against the real registry and asserts `FORBIDDEN`.
Flipping it is one field, and it should be flipped by someone who intends to
start crawling.

**No deduplication.** Milestone 15 was skipped when Adzuna was the only source,
because one provider cannot produce cross-source duplicates. A second listings
source makes it real: a Queensland Health vacancy may be advertised on both
Adzuna and Smart Jobs, and the product would show it twice. That is now the
next piece of work, and it should land before or alongside the first live run.

## Files changed

- `ingestion/smartjobs-qld.ts`, `scripts/ingest-smartjobs-qld.ts`
- `package.json`, `tests/smartjobs-qld.test.ts`

## Decisions

- **The client is an interface, not a class, at the ingestion boundary.**
  Ingestion depends on three methods, so a test supplies a stub without a
  network and without mocking a class it does not own.
- **Freshness is judged by `sourceUrl`, not by the reference.** The reference
  only exists on the detail page, which is the request being avoided. The URL is
  on the search row and is already stored, so the decision costs nothing.
- **A transport or parse failure part way through does not discard the run.**
  It is quarantined, and the run works with what it has (ADR-0005).
- **Expiry, never deletion.** A listing no longer advertised is marked expired
  and kept, because deleting it destroys the first-seen history.

## Open issues

1. **Deduplication against Adzuna**, as above. The most important follow-on.
2. **No salary.** The portal renders pay as free text across several fields.
   Parsing it is separate work, and a wrong salary is worse than none.
3. **Multi-region listings collapse to one area.** Recorded above.
4. **Nothing schedules this.** Adzuna has a cron endpoint; this has a command.
   Scheduling it is a decision that follows activation.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 292 of 292
- [x] Typecheck, lint, format pass
- [x] Exercised against captured markup, including idempotency, the request
      budget and the activation gate
- [x] Provenance preserved: the portal's own reference, regions and wording
- [x] Compliance respected: no live request made, no gate bypassed
- [ ] Live crawl: **awaiting the product owner**
- [ ] Source activation: **awaiting the product owner**
