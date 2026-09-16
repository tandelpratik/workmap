# Backlog

Work that is understood, scoped and not yet done, with what each item is waiting
on. An entry here is a decision to defer, not a note to self: it says what is
blocked, what unblocks it, and what it blocks in turn.

Items leave this file by being done, or by being recorded as decided against.
Nothing is deleted quietly.

## The 637 listings that cannot be placed

The regional classification settles **2,076 of 2,713 listings, 76.5%**. What is
left is not a gap to be closed with better data; it is mostly listings that
genuinely have no single place. See
[milestone 21](milestones/21-regional-classification.md).

| Remaining                                                                                                | Listings |
| -------------------------------------------------------------------------------------------------------- | -------: |
| Queensland advertisements whose named regions disagree, or name a region holding postcodes on both sides |     ~616 |
| Adzuna listings with no coordinates                                                                      |       21 |

**Do not close this with a threshold.** Eight Queensland statistical areas are
mixed, two of them on the strength of one mesh block out of 3,339 and five out
of 2,567. Those look like rounding error and are not: sweeping them up would
declare a region uniform that the instrument does not, and cross a statutory
line on a reader's behalf.

Two things would legitimately reduce it:

1. **A finer location from the Queensland source.** Advertisements sometimes name
   a town in their text. Reading one is a different problem from reading a region
   and needs its own gazetteer and licence question.
2. **ASGS Edition 4 Non-ABS Structures**, when released. Postal areas are
   currently taken from Edition 3 while everything else is Edition 4.

Until then 637 listings are labelled as not placeable, which is the correct
answer and satisfies the requirement to label uncertain locations separately.

## Blocked on brand identity

`config/brand.ts` keeps `legalName`, `domain` and `contactEmail` as `null`
rather than inventing them (ADR-0007). A placeholder domain or contact address
would be fabricated data in a product whose constitution forbids exactly that,
so these stay null until the values exist and the work that needs them waits.

| Needed                | Blocks                                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contact email         | `/report`, `/contact`, `/methodology#corrections`, the contact clause of `/privacy`                                                                                        |
| Legal display name    | Copyright line, `/terms`, the operator identity in `/privacy`                                                                                                              |
| ~~Registered domain~~ | Supplied 2026-09-10 (`regionalsponsor.com.au`). `metadataBase` is set and the regional classification has landed, so indexation is now gated only on the legal pages above |

### The legal pages

Privacy, terms, disclaimer and report depend on the first two rows above.
Data-and-licensing and methodology are done (milestone 23): explaining a dataset
needs no legal entity, which is why they came first. A privacy policy has to name who is
collecting and how to reach them, and terms have to name the party offering
them; writing either around an unnamed operator produces a document that says
nothing a reader can act on.

Two routes out, either of which unblocks the whole set:

1. **Supply the values.** They go into `config/brand.ts` and the pages are built
   around real ones.
2. **Name an individual operator.** Normal and honest for a solo project, and it
   needs only a name and an address rather than an entity.

A third option exists for `/report` alone: server-handled forms writing to the
database, so a reporting route works without publishing an address. It does not
help privacy or terms, which need the identity regardless.

### Indexation

`app/layout.tsx` sets `robots: { index: false, follow: false }` site-wide. It
stays set until the remaining legal pages and canonical URLs exist. Methodology
and data-and-licensing were a precondition and are now done. A site that cannot
answer for itself should not be inviting readers, and the canonical URLs need
the domain in any case.

## Blocked on an asset

**`public/adzuna-logo.png`.** Adzuna's terms require the word "Adzuna" in the
mandatory advert label to be their logo image, hyperlinked. Their site returns
403 to automated requests and their bot protection was deliberately not worked
around, so the file has to be downloaded by hand from
<https://www.adzuna.co.uk/press.html>.

Until it exists, `AdzunaAttribution` renders the required wording and links and
logs an error on every render. This is a launch blocker for any page showing an
Adzuna listing, which is `/jobs`.

## Blocked on data

**Trends.** ADR-0010 retains two reference periods, which is what the product
displays: a month and its change on the month before. Three points are the
minimum for anything honestly called a trend, so `/insights` trend sections,
the 3/6/12-month comparisons and a period control all wait on widening the
retention window and re-importing. The published workbook holds everything that
was dropped, so this is a re-import rather than a loss.

**Occupation classification.** Resolving occupation codes to a classification is
blocked on an open licence question, ANZSCO against OSCA, recorded in the source
register. Until it resolves, an unmapped listing stays unmapped rather than
being guessed into a plausible code.

## The skill attachment does not store its sentence

`skills/extract.ts` computes the whole sentence each match sits in and
`ingestion/extract-skills.ts` writes only `matchedText`, the matched words. The
listing lines built in [milestone 27](milestones/27-skill-surface.md) therefore
quote a phrase where the sponsorship badge quotes a sentence.

The phrase is honest evidence and is often enough on its own: "blue card" under
a Working with Children Check label shows a reader exactly what was read. It is
weaker in the case that matters most, which is a requirement stated
conditionally. "A current Blue Card, or the ability to obtain one" and "Blue
Card held prior to commencement" reduce to the same two words.

| Needed                                      | Cost                                   |
| ------------------------------------------- | -------------------------------------- |
| A `sentence` column on `job_skill`          | One migration                          |
| Every stored attachment rewritten           | One `skills:extract --apply`, 498 rows |
| `skills.attachment-evidenced` widened to it | One check, broken on purpose first     |

Deliberately not done inside an interface milestone. Changing the stored shape
of 498 rows as a side effect of building a page is how a data change reaches
production without anybody having reviewed it as one, and the display works
without it. Worth doing as its own small milestone, with the re-run reported the
way the extraction pass reports every other one.

Note that [milestone 26](milestones/26-skill-extraction.md) says "the attachment
carries the sentence". That describes the extractor's return value, not the
column, and is the one sentence in that document that overstates what was built.

**Aggregate skill analytics are constrained rather than merely unbuilt.**
Adzuna's terms bar publishing aggregates derived from their listings, so a
"skills in demand" figure could only be drawn from Queensland Smart Jobs, which
is Queensland Government vacancies and not a picture of any labour market.
Per-listing display and filtering are unaffected, and both now exist: showing
what one advertisement says, and selecting listings by it, is not an aggregate.

## Known limits

**`/api/jobs` has no rate limit.** It is a public read endpoint over the
database, fronted only by its own `s-maxage=300`, which does mean a CDN absorbs
repeats of the same query.

An in-memory limiter on a serverless platform limits one instance rather than a
caller, so it would be theatre, and the constitution forbids introducing Redis
without evidence it is required. This is currently handled by the platform and
the cache header. It becomes worth revisiting if the health or quality checks
ever show the endpoint being hammered, or if the deployment moves somewhere with
no edge in front of it.

## Decided against

**Salary analytics.** Nine of 2,713 listings state a salary, and those nine are
all yearly figures. There is no distribution to compute and a filter on it would
hide 99.7 per cent of the index. The `salary/` boundary was removed rather than
left standing as a promise. Revisit only if a source starts supplying salaries at
a rate that makes a statistic mean something.

**A `search/` module.** It described full-text search with trigram fallback and
keyset pagination, none of which was built. Search is `ILIKE` matching with
offset paging in `db/repositories/job.ts`, which is adequate for a corpus of this
size (ADR-0004 says each step waits for a measurement). The empty directory was
removed because it misled about where search actually lives, not because better
search is off the table.

## Deferred by choice

**`/locations/[state]/[occupation]`.** The data supports it and the page would
be a narrowing of the state page, but it multiplies addresses by 57 occupation
groups and nothing is indexed yet. Worth doing when indexation is unblocked, and
worth not doing before: the value of those pages is almost entirely that a
search engine can reach them.

**`contentHash` on swept rows.** The 362 listings the contact-detail sweep
rewrote still carry a hash computed over their pre-redaction text. Each takes
the "changed" path once on its next crawl and is rewritten with a correct hash.
Self-healing, one extra write per listing, and not worth a migration.

**Names and postal addresses in advertisement text.** The minimisation filter
covers email addresses and telephone numbers deterministically and deliberately
does not attempt these. A contact officer's name is indistinguishable by pattern
from an employer's name or a suburb, and a workplace address is the location of
the job. Revisit only if a reporting route shows it is a real problem, and never
by pattern-matching names.
