# Regional pages

`/locations` and `/locations/[state]`. The gap these fill is the one the map
left: selecting a state on the map redrew the map, and never gave a reader a
place.

A state page is a place. Its headline figure and how it moved, its share of the
country, the occupations advertised in it, the regions inside it carrying the
publisher's own figures, and the advertisements currently held for it.

## Three kinds of number, kept apart

Most of the work on this page is not fetching the figures. It is refusing to let
them blend.

| On the page                          | Whose number                  | How it is labelled                           |
| ------------------------------------ | ----------------------------- | -------------------------------------------- |
| Regions of the state                 | Jobs and Skills Australia's   | "as published, unaltered"                    |
| State total, share, occupation ranks | Ours, summed over JSA regions | "our arithmetic, not a figure they released" |
| Advertisements                       | Nobody's: not a figure at all | shown, never counted                         |

The third row is a licence boundary, not a design choice. The listing corpus
mixes Adzuna and Queensland Smart Jobs, and Adzuna's terms reserve "aggregation
(including but not limited to vacancy counts...)" for a written licence. So the
page shows listings and states no count of them anywhere. There is no "2,713
jobs in Queensland" heading and there must not be.

## Addresses come from the registry

`/locations/queensland`, not `/locations/3`. The slug is derived from the ASGS
published name rather than held in a hand-written table, because a table would
be a second list of Australian states to keep in step with the registry, and the
ASGS is what decides these areas' names. Matching compares slugs rather than
reversing one, so the function only ever has to be consistent with itself.

Areas the index reports nothing for return 404 rather than rendering. Other
Territories and Outside Australia are real ASGS areas carried because sources
report against them, and JSA publishes no figures for either; a page for one
would be a heading, empty stats and three paragraphs of caveat. A page that
exists because an address could exist is the thing the brief forbids.

```text
/locations/queensland                      200
/locations/australian-capital-territory    200
/locations/other-territories               404
/locations/nowhere                         404
```

## The query, and the property that makes it trustworthy

`listOccupationTotals` gained an optional `stateCode`. The same arithmetic runs
over one state's regions instead of the country's, filtered through the parent
join that already resolves a region's state.

Two things are deliberate. The reference period is still read across the whole
dataset, so a state page and the national page date their figures identically:
taking each state's own latest would let one that stopped reporting present older
figures under a newer month without any number being wrong. And the filter is
tested inline in one statement rather than building the SQL two ways, because
two statements drift.

The property worth asserting is that the states add back:

```text
NSW 60,675 + VIC 44,937 + QLD 49,296 + SA 14,058
  + WA 26,759 + TAS 3,078 + NT 2,758 + ACT 4,393
  = 205,954, and the national figure is 205,954
```

Fifty regions in scope nationally, fifty across the states. If those did not
reconcile, either a region is counted twice or one belongs to no state, and the
state pages would be quietly wrong in a way no single page could reveal. A
database test asserts it, along with the weaker property that no scoped figure
exceeds its national counterpart, which is the signature of a join that has
multiplied rows.

## The bug the pages found

The Northern Territory page listed jobs in Central West Qld.

`searchJobs` matched a location term as a substring of the raw location text.
"NT" is a substring of Central, Mount, Sunshine, Townsville and a good fraction
of Australian place names, so a search for the Northern Territory returned
Queensland. `/jobs?where=NT` had been doing this since job search shipped; it
took a page that asks the question programmatically for anyone to notice.

A location term is really two questions, and they are separated now:

- **a state abbreviation** is matched against the resolved state and nothing
  else. Two letters are not a place name;
- **anything else** is a place name, which is exactly what a substring match is
  for, and it still matches the state code too, so "Queensland" keeps working.

`/jobs?where=NT` returns 9 listings now, all of them in the Northern Territory.

The abbreviation table moved to `domain/geography.ts` on the way. Which letters
stand for Queensland is a fact about Australian geography rather than about the
importer that happened to need it first, and the pages ask the same question; a
second copy of that table would be how the two answers start to differ.

## Navigation

**Locations** joins the section rail, between Map and Occupations. It sits
beside the map rather than inside it because the two answer the same question in
different registers: the map is a picture read at a glance, a location page is a
place with its regions, occupations and advertisements. The front page's state
table now leads to the state's page rather than back into the map, since a
reader clicking a state is asking what is happening there, and the map's answer
to that was another map. The map figure's own aside still opens the map.

## Files

| Path                               | Change                                          |
| ---------------------------------- | ----------------------------------------------- |
| `app/locations/page.tsx`           | New. Every reporting state, ranked              |
| `app/locations/[state]/page.tsx`   | New. One state in full                          |
| `domain/geography.ts`              | Slugs, abbreviations, abbreviation recognition  |
| `db/repositories/labour-market.ts` | `stateCode` scoping on occupation totals        |
| `db/repositories/job.ts`           | An abbreviation is matched as a state, not text |
| `ingestion/dimensions.ts`          | Uses the domain's abbreviation table            |
| `components/layout/masthead.tsx`   | Locations in the section rail                   |
| `app/page.tsx`                     | State rows lead to state pages                  |

## Checks

`npm run check` clean: Prettier, ESLint, TypeScript, 488 tests (from 469).
`npm run build` succeeds. `npm run data:check` passes 15 of 15. Routes verified
against the live database, including the two 404 cases and listings on four
states.

## Not done here

- `/locations/[state]/[occupation]`. The data supports it and the page would be
  a narrowing of this one, but it multiplies addresses by 57 and nothing is
  indexed yet. Worth doing when indexation is unblocked, and worth not doing
  before.
- Regions do not have their own pages. A region links to the map filtered to it,
  which is where its detail already lives.
- No trend on these pages. Two reference periods are held, so the change on the
  month before is the whole of what can be honestly shown.
