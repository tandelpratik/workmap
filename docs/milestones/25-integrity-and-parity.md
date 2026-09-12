# Checking the thing that was built

Three milestones added a classification the product's headline filter depends
on, a six-way sponsorship label and a public page for each. None of them added a
data integrity check, the API never learned the new filters existed, and a deploy
does not run the passes the schema changes need. This closes those three.

## Five checks that were missing

`analytics/quality.ts` held 16 checks and not one covered the regional
classification, in a codebase where every other invariant has one. It now holds 21.

| Check                               | Asserts                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| `regional.placement-coherent`       | A status and a basis that cannot disagree                        |
| `regional.placement-attributed`     | Every placed location names the instrument and the date          |
| `regional.derived-postcode-sourced` | Every inferred postcode names the boundary set that inferred it  |
| `regional.postcode-well-formed`     | Every stored postcode is four digits                             |
| `regional.matches-instrument`       | The stored placement still reads that way against the instrument |

The coherence check encodes the combinations the classifier cannot produce, and
one of them is worth naming: **`NOT_REGIONAL` decided by `STATE` is impossible.**
The state rule applies precisely where the instrument leaves no postcode in that
state unlisted, so it can only ever conclude regional. A row like that would
exclude a listing from a regional search on a rule with no power to exclude
anything.

`regional.matches-instrument` is the one that earns its keep. The unit tests
assert the transcription's shape exhaustively; this asserts the corpus was
actually classified under the transcription the code currently holds, which is a
different claim and the one that goes stale after an amendment or a
half-finished backfill. Rows placed by region are excluded on purpose: their
answer comes from two boundary sets agreeing, which no single row's columns can
reproduce.

## Proving the checks work

A check that passes the moment it is written is a check nobody has tested. This
project has already shipped one that matched nothing and reported no problems
across seventeen routes while doing no work at all.

So each of the five was broken deliberately against the real database, one row at
a time, with the mutation reverted in a `finally` block:

```text
FIRES   regional.placement-coherent          (clean again: PASS)
FIRES   regional.placement-attributed        (clean again: PASS)
FIRES   regional.derived-postcode-sourced    (clean again: PASS)
FIRES   regional.postcode-well-formed        (clean again: PASS)
FIRES   regional.matches-instrument          (clean again: PASS)
```

## The API and the page disagreed about the product

`/api/jobs` accepted `q`, `where`, `category` and `type`. It did not accept
`area` or `sponsorship`, so the page returned regional work and its own API
returned everything, with no way to ask for either. The product's defining
filter was missing from its public interface.

That happened because the vocabulary existed three times: a map in the search
page, a list of options in the form, and nothing in the API. It now exists once,
in `domain/regional.ts`, read by all three. A test asserts every placement stays
reachable through some filter, because adding a status without a way to ask for
it would make a slice of the corpus invisible while every page still worked.

The API defaults to `regional` like the page, and echoes `filters` in the
response including the defaults the caller did not ask for. A response filtered
by a default the client cannot see is a response a client will eventually misread
as the whole corpus.

| Request                    | Total                 |
| -------------------------- | --------------------- |
| `/api/jobs`                | 1,466                 |
| `/api/jobs?area=all`       | 2,713                 |
| `/api/jobs?area=elsewhere` | 610                   |
| `/api/jobs?area=banana`    | 400, naming the field |

## Passes a deploy does not run

Migrations apply themselves on a production deploy. The one-off data passes do
not, and the schema changes that need them are already merged.

`docs/DEPLOYMENT.md` now names them, in order, with the instruction to dry-run
each first. It also states what a deploy without them looks like, which is the
part worth writing down: **nothing breaks.** Every missed pass degrades to the
safe direction by design, so a regional search silently returns nothing rather
than returning something wrong. The failure is quiet, which makes it the kind
that survives.

`npm run data:check` is the confirmation, and the five new checks are what make
it one.

## Verified

616 tests, 21 data quality checks, 18 routes structurally accessible, a clean
production build, and the API exercised across every area setting against the
real corpus.
