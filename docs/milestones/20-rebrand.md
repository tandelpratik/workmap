# Rebrand and legal footing

The first step of a product pivot: from a national labour market atlas to a
regional job discovery platform whose sponsorship information is drawn from the
wording of advertisements.

This milestone moves the identity, the legal position and the navigation. It
deliberately moves no data. Nothing in the product is labelled regional at the
end of it, because nothing in the product is classified as regional yet.

## What the pivot is

|                  | Before                                     | After                                                        |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------ |
| Primary offering | National labour market statistics and maps | One search across regional job advertisements                |
| Sponsorship      | A secondary filter                         | A reported, quoted attribute of each advertisement           |
| Statistics       | The product                                | Supporting context                                           |
| Geography        | All of Australia                           | Regional Australia, classified against an official reference |

## Decisions taken

Four were referred to the product owner before any code was written.

1. **Regional is established by the Department of Home Affairs designated
   regional area postcode list**, bridged to what our sources actually supply
   via ABS Postal Areas. Both need licence verification and a source register
   entry before use. See the gap below.
2. **Non-regional and unclassifiable listings are kept and labelled**, not
   excluded at ingestion. Search will default to regional. Keeping them means a
   reclassification is a re-run rather than a re-ingestion, and a mistaken
   exclusion cannot become invisible.
3. **No corpus-wide listing count is published anywhere.** Counts appear only as
   search-result pagination, which is the position `db/repositories/job.ts`
   already documents. Adzuna's terms reserve "aggregation (including but not
   limited to vacancy counts, average salaries etc)" to a written licence, and a
   headline figure on a front page is the least defensible place to test it.
4. **The domain is assigned; the legal name and contact address are not.** They
   stay null rather than being invented, and they appear in legal text where a
   wrong value is worse than an absent one.

## The legal boundary

The product name is the reason this is a milestone rather than a footnote. A
service named after sponsorship, carrying a sponsorship filter, reads as an
assurance that an employer sponsors or that a reader will be sponsored unless it
says otherwise on every page.

Reporting what a third party published, and linking to it, is a different act
from advising someone about their own migration position. The second is
"immigration assistance" within the meaning of the Migration Act 1958 and is
reserved to registered agents and legal practitioners. Characterising an
employer as a sponsor is a separate exposure: a statement of fact about a real
business that a reader may act on by relocating.

`config/legal.ts` holds the position verbatim, in one place, composed from the
brand name so a rename carries into it. Components render those strings and
never reword them, which is the same rule the source register applies to
licence attribution text and for the same reason.

`tests/legal.test.ts` enforces it. A phrase that claims an employer is a
verified, approved or registered sponsor, or that addresses the reader with an
assessment, fails the build. The list is short on purpose: every phrase on it is
wrong even inside a sentence denying it, which is why the legal strings are
written in the third person throughout. The test caught its own configuration
file on the first run, where a comment had quoted a second-person example.

## What changed

| File                                | Change                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `config/brand.ts`                   | New identity. Domain assigned; legal name and contact still null             |
| `config/legal.ts`                   | New. The published legal position, verbatim and composed from the brand name |
| `components/layout/site-footer.tsx` | Renders the legal position on every page. Job search leads the link column   |
| `components/layout/masthead.tsx`    | Job search leads the section rail                                            |
| `app/layout.tsx`                    | `metadataBase` from the assigned domain; Open Graph site name                |
| `app/page.tsx`                      | Header re-framed around search, with the missing filter stated               |
| `tests/brand.test.ts`               | The null-domain guard became a shape-and-placeholder guard                   |
| `tests/legal.test.ts`               | New                                                                          |
| `package.json`, `README.md`         | Renamed and re-described                                                     |

The favicon is deliberately unchanged. It is a map sheet with one cell picked
out, drawn as the subject rather than the name precisely so that a rename is not
a redraw, and the subject still holds.

## The gap this leaves

`Location.postcode` exists in the schema and **nothing has ever written to it**:
zero of 375 stored locations carry a postcode. Adzuna supplies a suburb string
and coordinates; Smart Jobs Queensland supplies a closed region vocabulary.
Locations currently resolve to COUNTRY or STATE level and no further.

So the regional classification cannot run over a single stored row today, and it
will need two bridges rather than one:

- 234 of 375 locations carry coordinates, essentially the Adzuna subset. A
  spatial join against ABS Postal Areas yields a postcode derived from the
  source's own coordinates, which is a join rather than a guess, subject to the
  ABS caveat that postal areas approximate Australia Post postcodes.
- The Queensland majority carries region names and no coordinates. Those can
  reach an SA4 through the existing verified mapping, but an SA4 is not a
  postcode, and a listing placed that way must be labelled as classified by
  region rather than by postcode.

`integrations/smartjobs-qld/regions.ts` carries an `isRegional` flag defined as
"outside Greater Brisbane". That is an ABS-shaped definition, it disagrees with
the Home Affairs one at exactly the contested edges, and it is currently
declared and never read. It must not be promoted into the domain.

## Gates

- `robots: { index: false, follow: false }` stays set. The tagline names a filter
  the search does not yet apply; indexing before it does would publish a claim
  the data cannot support. This is acceptable only because the site is not
  public.
- The note on the front page stating that nothing is labelled regional is
  deleted when the classification lands, and not before.
