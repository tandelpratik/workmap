# Provenance and rights

The licensing position moved out of prose and into fields a test can read, the
rights position gained a field-level layer, and 400 contact details stopped
being republished.

Nothing here changes a figure. Every number on the site is what it was; what
changed is what the product can prove about where it came from and what it is
allowed to do with it.

## Licence, rights and retrieval became data

The register recorded commercial use, redistribution, adaptation, exclusions and
verification dates inside a `notes` paragraph. That is a fine place to record
_why_ an answer is what it is and a hopeless place to record _what_ the answer
is: no test could assert it, and a permission only a human can read is a
permission that drifts.

Each descriptor now carries three structured blocks:

- `licence` — name, deed URL, copyright holder
- `rights` — status, commercial use, redistribution, adaptation, exclusions,
  the date the terms were last read
- `retrieval` — method and frequency

`UNVERIFIED` is not a middle setting between yes and no. It means the question
has not been answered, and every gate treats it as a refusal.

`tests/rights.test.ts` asserts the invariants that matter: no source claims
established rights without a verification date, no unestablished source records
a permission, nothing publishes derived aggregates without an adaptation right,
and no blocked source declares content rights.

### The termsUrl conflation, and a licence obligation it was hiding

One `termsUrl` had been carrying two different kinds of document: a Creative
Commons deed for the government sources and a terms-of-service contract for
Adzuna. Splitting them turned up a real gap rather than a tidiness one. CC BY
requires a **link** to the licence, not only its name, and the stored
attribution sentence names `CC BY 4.0` in text with nowhere for a URL to come
from. There was no licence link anywhere in the interface.

There is now, rendered by `DataAttribution`, which prints the required wording
verbatim and adds a structured line beneath it: dataset, reference period,
licence as a link, and when the terms were last read.

For the two Creative Commons sources `termsUrl` is now absent rather than
pointing at the deed a second time. No separate terms document was located and
read for either, and an unverified URL there would be worse than none: it would
look like evidence.

## Job content rights, per field

A licence covering a page does not cover every component printed on it. A
listing source now carries a `jobContentRights` matrix, one position per field,
defaulting to `NEEDS_VERIFICATION` for anything unstated. A source added without
a matrix therefore publishes nothing rather than everything.

`mayRepublishField()` is the single gate and the job repository is the single
place it is applied, for the same reason the synthetic and expiry rules live
there: a rule enforced at one boundary is a rule, and a rule enforced at each
call site is a habit.

Three fields are withheld from both live sources: contact details, employer
logos, and application instructions. These are decisions, not open questions,
and the vocabulary keeps the two apart — `WITHHELD` means someone decided,
`NEEDS_VERIFICATION` means nobody has.

A withheld description is reported to the reader as withheld rather than left
blank, because "the employer wrote no description" and "we are not satisfied we
may reproduce what the employer wrote" are different facts about the same empty
space, and only one of them is about the employer.

## Contact details are no longer collected

The Queensland licence permits reproducing an advertisement. It does not make
republishing a named officer's direct line proportionate for a product whose
whole offer is to link to the original.

`domain/personal-information.ts` removes email addresses and Australian
telephone numbers before anything is stored, which is stronger than removing
them at render: a later export or a database dump cannot reintroduce what a
render-time filter would only have been hiding. It runs before the content hash
is taken, so an unchanged advertisement still reads as unchanged on the next
crawl.

It deliberately does not attempt names or postal addresses. A contact officer's
name is indistinguishable by pattern from an employer's name, a suburb, or half
the words in a job title, and a workplace address is the location of the job,
which is the product's subject. Those limits are documented rather than assumed
solved.

### What the sweep found

`npm run jobs:redact` is the back catalogue pass, dry by default because the
replacement is not reversible. Against 2,713 stored listings:

| Pass                   | Listings | Removals |
| ---------------------- | -------- | -------- |
| First dry run          | 330      | 356      |
| After the boundary fix | 362      | 400      |
| Applied                | 362      | 400      |
| Verification re-run    | 0        | 0        |

Inspecting the matches in context, with the values already replaced, showed
every one to be a genuine contact detail: `Contact Email:`, `Contact Phone:`,
`Email: … | Phone: …`. It also showed one escaping:

```text
Email: [email removed]: 07 4885 7716Join a passionate team
```

Descriptions arrive as stripped HTML, so a number frequently runs straight into
whatever followed the closing tag. A trailing `\b` is satisfied by neither side
of `6J`, and the number survived. The telephone anchors are digit boundaries
now — `(?!\d)` still refuses a fragment of a longer digit run, which is the only
thing the word boundary was protecting against, and it stops caring whether a
letter follows. That one change found 44 more numbers across 32 more listings.

The false-positive cases are tested as heavily as the true ones. A filter that
eats a salary band, an ABN or a job reference has done more damage to an
advertisement than the detail it removed, and the damage is silent: nobody
reports a missing figure they never saw.

## Freshness says which date it means

Three dates were being collapsed into one, and the one shown was the wrong one.

The jobs page took Adzuna's most recent retrieval and printed it above whatever
happened to be displayed, which told a reader something untrue whenever a
Queensland listing was among them. The two sources are crawled on different
schedules by different schedulers, so there is no single honest figure, and
`lastVerifiedBySource` returns one per source instead of pretending there is.

Each listing now carries both dates it should: **posted**, which is the
employer's, and **verified**, which is the last time the source confirmed the
advertisement was still there. The second is the one that tells a reader whether
a role is likely to still exist, and the product held it without showing it.
`retrievedAt`, when this record was last written, stays internal.

## Independence, on every page

The site draws on Commonwealth and Queensland Government material and says so in
every footer. Saying whose material it is without saying they had no part in
this leaves a reader to assume the obvious wrong thing, and the assumption gets
more plausible the more official the figures look. The statement is now in the
colophon, which every page renders.

## Files

| Path                                   | Change                                          |
| -------------------------------------- | ----------------------------------------------- |
| `domain/source.ts`                     | Licence, rights, retrieval, field matrix, gates |
| `domain/personal-information.ts`       | New. Deterministic contact-detail filter        |
| `domain/job.ts`                        | `descriptionWithheld`, `lastVerifiedAt`         |
| `config/sources.ts`                    | All eleven descriptors filled in                |
| `db/repositories/job.ts`               | Field gate applied; per-source freshness        |
| `ingestion/adzuna.ts`                  | Sanitise before hashing                         |
| `ingestion/smartjobs-qld.ts`           | Sanitise before hashing                         |
| `ingestion/redact-stored.ts`           | New. Back catalogue sweep, dry by default       |
| `scripts/redact-stored-listings.ts`    | New. `npm run jobs:redact`                      |
| `components/data/data-attribution.tsx` | New. Licence-aware attribution                  |
| `components/layout/colophon.tsx`       | Delegates; adds independence statement          |
| `components/job-list.tsx`              | Verified date, withheld notice                  |
| `app/jobs/page.tsx`                    | Per-source freshness                            |
| `app/page.tsx`, `/map`, `/occupations` | Cite dataset and reference period               |

## Checks

`npm run check` clean: Prettier, ESLint including the import boundaries,
TypeScript, and 443 tests (from 339). `npm run build` succeeds. All four pages
verified rendering against the live database.

## Not done here

- The legal pages. They need a contact address and a legal display name, which
  ADR-0007 keeps `null` until they exist rather than inventing.
- Indexation stays off. A site that cannot yet answer for itself should not be
  inviting readers.
- `contentHash` on the 362 swept rows still covers the pre-redaction text. Each
  will take the "changed" path once on its next crawl and be rewritten with a
  correct hash. That is the intended outcome; recomputing it here would have
  needed a normalised record that no longer exists.
