# Backlog

Work that is understood, scoped and not yet done, with what each item is waiting
on. An entry here is a decision to defer, not a note to self: it says what is
blocked, what unblocks it, and what it blocks in turn.

Items leave this file by being done, or by being recorded as decided against.
Nothing is deleted quietly.

## Blocked on brand identity

`config/brand.ts` keeps `legalName`, `domain` and `contactEmail` as `null`
rather than inventing them (ADR-0007). A placeholder domain or contact address
would be fabricated data in a product whose constitution forbids exactly that,
so these stay null until the values exist and the work that needs them waits.

| Needed             | Blocks                                                                              |
| ------------------ | ----------------------------------------------------------------------------------- |
| Contact email      | `/report`, `/contact`, `/methodology#corrections`, the contact clause of `/privacy` |
| Legal display name | Copyright line, `/terms`, the operator identity in `/privacy`                       |
| Registered domain  | `metadataBase`, canonical URLs, sitemap, Open Graph, indexation                     |

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
