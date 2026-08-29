# Milestones 12 to 17: Adzuna job search

- **Date:** 2026-08-29
- **Prompts:** `12_adzuna_adapter`, `13_job_ingestion`, `14_job_normalization`,
  `16_job_search_api`, `17_job_search_ui`
- **Outcome:** Complete and running. The first working product surface.

## Why these ran out of sequence

The milestone order assumed Adzuna was unreachable, which it was until the
product owner obtained API credentials. With access granted, the fastest route
to something demonstrable is the job search, so milestones 06 to 11 were
deferred and the job pipeline was built end to end instead. This was the product
owner's call, made explicitly.

Milestone 15, deduplication, is **not** included. One provider cannot produce
cross-source duplicates, so it has nothing to do until a second job source
exists.

## The finding that shaped the work

Adzuna's terms of service were read before any code was written. Permissible use
is a closed list of three things, of which the first is "publishing Adzuna ad
listings". The clause after it is the one that matters:

> It may not be used in its original format or in aggregation (including but not
> limited to vacancy counts, average salaries etc) to deliver any ongoing work or
> research... without written consent.

**Adzuna can power search. It cannot power the map.** Vacancy counts, average
salaries and regional breakdowns are exactly what that clause reserves, so the
market intelligence layer stays on JSA IVI, which is CC BY 4.0 and permits
aggregation.

Rather than write that down and hope, it became a field and a gate:

- `permitsDerivedAggregates` on `SourceDescriptor`, separate from compliance
  status because it is a different question;
- `canPublishDerivedAggregates()` as the single place that answers it;
- an exact-list test, so a future edit that flips the flag fails the suite;
- no aggregate query in `db/repositories/job.ts`, with the reason in the file.

Compliance and activation were already separate axes. This is a third: a source
can be verified, active, and still barred from part of the product.

## What was built

**Adapter** (`integrations/adzuna/`). A validated client and mapper. Credentials
travel in Adzuna's query string, so no URL is ever logged: `redactUrl` strips
them and a test asserts it. The rate limiter enforces the documented 25 requests
a minute, honours `Retry-After` rather than backing off over the top of it, and
does not retry a rejected credential, because hammering an auth endpoint is what
rate limits exist to prevent.

**Ingestion** (`ingestion/adzuna.ts`). Idempotent on `(sourceKey, sourceId)` with
a content hash, so an unchanged advert costs one comparison and no write. Bounded
by an explicit request budget rather than paginating until the data runs out:
the free allowance is 250 hits a day, so a run takes a few pages and stops.
Listings no longer seen are expired, never deleted, because deleting destroys
the first-seen history.

**Search** (`db/repositories/job.ts`, `app/api/jobs/route.ts`, `app/page.tsx`).
Server-rendered from the URL, so a search is shareable and works without client
JavaScript. Expired listings and synthetic fixtures are excluded in the
repository rather than trusted to callers.

## Things not guessed

- **Remote type.** Adzuna does not publish one. Inferring it from words in a
  title would be a guess presented to a reader as a filter, so it stays null.
- **Salary currency.** Derived from the country endpoint via an explicit table.
  A country not in the table yields no salary rather than a number in an assumed
  currency: a figure without a unit is not a salary.
- **Occupation.** Their category is stored verbatim in `source_category_*` and
  is never treated as an ANZSCO code. Mapping arrives at milestone 11.
- **Description completeness.** Adzuna returns a snippet, never the full advert.
  `description_is_excerpt` records that, and the UI labels it, because showing a
  truncated advert as complete misrepresents an employer's listing.
- **Estimated salaries.** `salary_is_predicted` becomes `SOURCE_ESTIMATED` and
  is labelled as an Adzuna Jobsworth estimate wherever it appears, which both
  ADR-0002 and their terms require independently.

## Two obligations, one of them outstanding

**Attribution is implemented.** Their wording is prescriptive down to the pixel
size, and `components/adzuna-attribution.tsx` follows it. This is a licence
condition, so it outranks the design system where they disagree.

**The logo asset is missing, and this blocks public launch.** The terms require
the word "Adzuna" to be their logo image. Their site returns HTTP 403 to
automated requests, and the bot protection was not circumvented, so
`public/adzuna-logo.png` must be downloaded by hand from
https://www.adzuna.co.uk/press.html. Until it is, the component renders the
required wording and links and logs an error on every render. The 20x20
Jobsworth icon has the same status.

**Termination is a one-liner.** Their terms require immediate removal of all
Adzuna data on termination by either party. `npm run adzuna:purge -- --confirm`
does it, and deletes rather than expires, which is correct exactly here.

## Files changed

- `domain/job.ts`, `domain/source.ts`
- `integrations/adzuna/{client,mapper,types}.ts`
- `ingestion/adzuna.ts`, `ingestion/dimensions.ts`
- `db/repositories/job.ts`, `db/schema.prisma` and migration
  `20260829170253_job_source_category_and_excerpt_flag`
- `app/page.tsx`, `app/api/jobs/route.ts`
- `components/{adzuna-attribution,job-list,job-search-form}.tsx`
- `config/{env,sources}.ts`, `.env.example`
- `scripts/{ingest-adzuna,purge-adzuna}.ts`, `package.json`
- `tests/{adzuna,source}.test.ts`
- `docs/compliance/SOURCE_REGISTER.md`

## Verification

| Check                                        | Result                                          |
| -------------------------------------------- | ----------------------------------------------- |
| `vitest run`                                 | 185 tests, all pass (31 new)                    |
| `eslint`, `tsc --noEmit`, `prettier --check` | Pass                                            |
| `next build`                                 | Pass                                            |
| Page rendered from a running server          | Correct unconfigured state, attribution present |
| `GET /api/jobs`                              | 200 with an empty result set                    |
| `GET /api/jobs?page=notanumber`              | 400, naming the offending field                 |
| Ingestion against a live Adzuna key          | **Not run.** No credentials in `.env` yet       |

The ingestion test runs the real pipeline against a stubbed client inside a
transaction that is rolled back, so it exercises the schema, the constraints and
the content-hash idempotency without spending a request from the daily budget or
leaving invented listings in the database. It asserts the second run writes
nothing.

## Open issues

1. **No live API call has been made.** Credentials are not yet in `.env`. The
   two things to confirm on the first real response are that salary figures are
   annual, which is assumed from their documentation, and that the mapped fields
   match a real payload rather than the documented example.
2. **The Adzuna logo and Jobsworth icon are missing.** Launch blocker, and the
   assets can only be obtained by hand.
3. **Search is `ILIKE`, not full text.** Adequate for thousands of rows and not
   for hundreds of thousands. Revisit with PostgreSQL full-text search when
   volume justifies it, not before.
4. **Milestones 06 to 11 are deferred**, and the JSA importer from milestone 05
   still has no file to import.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 185 of 185
- [x] Typecheck, lint, format, build pass
- [x] Accessibility: semantic list, labelled search form, visible focus, salary
      basis conveyed in text rather than by colour
- [x] Design constitution: editorial list with thin rules, no card grid, no
      gradients, typography-led
- [x] Provenance: source, retrieval time, excerpt flag and salary basis on every
      listing
- [x] Source rules: terms read before code, aggregation gate enforced, rate
      limits honoured, credentials server-side only, bot protection not bypassed
- [x] Documentation updated
- [ ] Public launch: **blocked on the Adzuna logo asset**
