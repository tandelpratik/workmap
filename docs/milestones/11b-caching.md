# Milestone 11b: caching the published figures

- **Date:** 2026-09-04
- **Prompts:** part of `25_free_tier_optimization` and `32_performance`
- **Outcome:** Complete. Warm pages are 0.02 to 0.24 seconds, from 1 second.

## Why cache at all

The figures come from a monthly release. Between imports they do not change,
so every request was spending a Neon round trip and Vercel function time to
recompute a number settled weeks earlier. On a free tier metered by compute and
data transfer, that is the clearest waste in the product.

| Page              | Uncached | Cached |
| ----------------- | -------- | ------ |
| `/map`            | 1.00s    | 0.16s  |
| `/map?state=1`    | 1.20s    | 0.24s  |
| `/occupations`    | 1.00s    | 0.02s  |
| `/occupations/26` | 1.03s    | 0.01s  |

Taken with [milestone 11a](11a-query-performance.md), `/occupations/26` went
from 7.62 seconds to 0.01.

## The bug this nearly shipped

Caching the repository results directly worked perfectly on the first request
of every page and broke on the second.

A cache is a serialisation boundary, and `Date` does not survive one. Every
read after the first returned dates as ISO strings while the types still said
`Date`, so `Intl.DateTimeFormat` threw `RangeError: Invalid time value` and
`/map?state=1` answered 500. Typecheck passed, lint passed, 286 tests passed:
the lie happens inside the cache, at runtime, where the type system cannot see
it.

It was found by requesting each page twice and reading the status codes, which
is worth writing down, because requesting each page **once** showed six healthy
pages and a large improvement.

The fix is to make the boundary explicit rather than to hope. What is cached is
a wire shape whose date fields are typed as strings, and reviving it is a total
function back to the domain shape. A future date field cannot be forgotten,
because the wire type will not match the domain type until it is handled.
Observations are rebuilt through `makeObservation`, so a value and its state
cannot drift apart while crossing a cache any more than they can leaving the
database (ADR-0002).

`tests/cache.test.ts` pins it by doing to the value exactly what the cache
does, a JSON round trip, and asserting real dates come back.

## Decisions

**Caching sits in the app layer, not the repository.** Repositories are data
access and are called directly by tests, which run under vitest with no Next.js
request context. Caching is a delivery concern, so `app/cached-queries.ts`
wraps the repository and the repository stays a plain async function.

**`unstable_cache`, deliberately, with the successor recorded.** Next.js 16
replaces it with the `use cache` directive, which requires enabling Cache
Components. That is a project-wide migration: it replaces the `dynamic` and
`revalidate` route configs everywhere, revalidates every route against
instant-navigation rules, and ships with its own adoption guide. Doing it as a
side effect of adding a cache would be the silent redesign the milestone rules
forbid. **This is a decision for the product owner**, and the whole of what it
would touch is one file.

**One hour, and one tag.** Nothing invalidates on demand today, because JSA
releases are imported by an operator running a command rather than by a route
handler, and `revalidateTag` needs a request context to run in. An hour bounds
how long a newly imported release can go unseen, and the tag is set anyway so
that an endpoint clearing it is a few lines rather than a redesign.

## Files changed

- `app/cached-queries.ts`, `tests/cache.test.ts`
- `app/map/page.tsx`, `app/occupations/page.tsx`,
  `app/occupations/[code]/page.tsx`

## Open issues

1. **Cache Components is unadopted**, and `unstable_cache` is the API this
   version deprecates. The debt is one file wide and deliberate.
2. **No on-demand invalidation.** A JSA import does not clear the cache, so a
   new release appears within the hour rather than immediately. An authenticated
   revalidation endpoint, or moving the import behind the existing ingest route,
   would close it.
3. **The cache is per-instance in development and per-deployment on Vercel.**
   Not a problem at this scale, and worth knowing before assuming a cache hit
   is shared.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 289 of 289
- [x] Typecheck, lint, format pass
- [x] Production build succeeds
- [x] Every page requested twice, statuses and figures checked on the cached
      read as well as the first
- [x] Figures identical to before: 50 regions, 14 in New South Wales, Greater
      Sydney 42,880, occupations 205,954, ICT Professionals 6,053
- [x] Absences still absences across the boundary, asserted by test
- [x] Documentation updated
