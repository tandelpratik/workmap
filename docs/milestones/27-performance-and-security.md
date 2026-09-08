# Performance and security, measured before touched

The phase where it would have been easiest to do harm. Both halves started with
a measurement, and in one case the measurement said the obvious fix would have
been the wrong one.

## The 4.5 second page that was not slow

`/jobs` took 4.5 seconds to first byte, and 6.7 on a second pass with every
cache warm. `/locations/queensland` took 5.7. Both call `searchJobs`.

The obvious reading is a missing index: the search filters on status, canonical
and synthetic, and orders by a nullable posting date, and none of that has a
composite index behind it. The obvious fix is to add one.

The plan says otherwise.

```text
Limit  (actual time=1.265..1.268 rows=20)
  ->  Sort  (actual time=1.264..1.265 rows=20)
        Sort Method: top-N heapsort  Memory: 27kB
        ->  Seq Scan on job  (actual time=0.012..0.877 rows=2713)
              Filter: is_canonical AND NOT is_synthetic AND status = 'ACTIVE'
Execution Time: 1.294 ms
```

**1.3 milliseconds.** The count is 1.1. A sequential scan over 2,713 rows is the
right plan and Postgres chose it correctly; an index here would be slower to
maintain than the scan it replaced.

The 4.5 seconds is a round trip. A bare `SELECT 1` against the same database
from this machine takes 503 to 714 milliseconds, because the database is in
`ap-southeast-2` and the development machine is not. Production runs in `syd1`,
the same region, where a round trip is single-digit milliseconds. The
architecture notes already said this about the test suite; it is just as true of
a page.

So no index was added, and the reason is recorded here so nobody adds one on the
strength of a number taken from the wrong place. ADR-0004 says each step happens
only when a measurement justifies it. This measurement justified nothing.

## What was actually worth fixing

One thing, and it was not about time.

`listIndexedSources` and `listJobCategories` both used `findMany` with
`distinct`. Prisma applies `distinct` in the application, so the database was
asked for every matching row's source key and handed back 2,713 strings, which
were then reduced to two. Same for categories.

`groupBy` compiles to a real `GROUP BY` and returns the two rows. The call went
from 943ms to 565ms locally, which is now one round trip and the floor. The
point is not the 378 milliseconds: it is not paying to transfer a thousandfold
more rows than the answer needs, on a free tier that meters exactly that.

## What the payload actually costs

Measured compressed, because that is what a browser receives.

| Route          | Raw     | Gzip   |
| -------------- | ------- | ------ |
| `/`            | 343 KB  | 103 KB |
| `/map`         | 874 KB  | 253 KB |
| `/map?state=3` | 1543 KB | 328 KB |
| `/jobs`        | 217 KB  | 47 KB  |
| `/occupations` | 162 KB  | 17 KB  |
| `/insights`    | 111 KB  | 12 KB  |

The map is the heavy one and it is heavy for a reason worth keeping: 328 KB of
server-rendered SVG paths, and **zero JavaScript**. A client map library plus its
tiles would cost more than that before drawing anything, and would not work
without scripting, print, or read as a table.

The 4.4 MB of detail geometry under `public/geography` never reaches a browser.
It is read with `fs` at request time and projected on the server.

## Security

Nothing was found that needed fixing in the application logic, which is the
result of the work already done rather than of luck. Recorded because a review
that finds nothing should still say what it looked at.

| Checked                           | Result                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `dangerouslySetInnerHTML`, `eval` | None anywhere                                                                              |
| Secrets in client bundles         | No `NEXT_PUBLIC_` anywhere but a comment forbidding it                                     |
| SQL injection                     | No `$queryRawUnsafe` outside generated code; raw SQL is parameterised                      |
| SSRF                              | Outbound hosts are three constants, no user input in a URL                                 |
| Open redirect                     | The one redirect writes a fixed relative path and encodes an allow-list of four parameters |
| Tabnabbing                        | Every `target="_blank"` carries `rel="noopener"`                                           |
| Error leakage                     | API errors are a code and a sentence; no stack, no internals                               |
| Unauthenticated ingestion         | 403, with an identical message for missing and wrong credentials                           |
| Health endpoint                   | States configuration, never a value                                                        |

Two headers were missing and are now set.

**Content-Security-Policy.** Worth having because this site is unusually easy to
lock down: no third-party script, stylesheet, analytics, frame or remote font.
Everything is same-origin and the policy says so. `form-action` and `base-uri`
matter more than they look, since every form is a GET to this origin and a base
tag is how an injection quietly repoints every relative URL on a page.

`'unsafe-inline'` on scripts is a real concession. Next bootstraps hydration and
streams its payload through inline scripts, and removing it means a per-request
nonce from middleware, which is a request-time cost on a site that otherwise
renders almost everything without one. What stays blocked is loading from or
connecting to any other origin, which is the half of an injection that
exfiltrates something.

**Strict-Transport-Security**, two years with subdomains, deliberately without
`preload`, which is a submission that is hard to undo.

### One thing not done

`/api/jobs` has no rate limit. It is a public read endpoint over the database
and there is nothing in front of it but its own `s-maxage=300`, which does mean
a CDN absorbs repeats of the same query.

An in-memory limiter on a serverless platform limits one instance and not a
caller, so it would be theatre, and the constitution forbids introducing Redis
without evidence that it is required. The honest position is that this is
handled by the platform and by the cache header, and that it stays a known limit
rather than a solved problem. Recorded in the backlog.

## Files

| Path                     | Change                                         |
| ------------------------ | ---------------------------------------------- |
| `next.config.ts`         | Content security policy, HSTS                  |
| `db/repositories/job.ts` | Grouping in SQL rather than distinct in memory |
| `docs/BACKLOG.md`        | The rate limit position                        |

## Checks

`npm run check` clean: Prettier, ESLint, TypeScript, 518 tests. `npm run build`
succeeds. `npm run data:check` 16 of 16. `npm run a11y:check` clean across 15
routes with the policy applied, and every page verified to still render under it.
