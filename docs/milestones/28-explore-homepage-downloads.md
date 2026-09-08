# The question the product is named for, and the figures as files

Three pieces: the page that answers "where should I look", a front page brought
back in step with the product behind it, and the derived figures offered as
files that carry their own licence.

## Where should I look?

The tagline as a page. Everything else here presents figures and lets a reader
draw the conclusion; this one draws it, which is why it needed more care about
what the conclusion actually is than about how it looks.

Pick a kind of work and it ranks the states by how much of it each advertises.
For ICT Professionals:

```text
                              Ads    Of national   Of its own    Against
                                                   advertising   the country
1  New South Wales           2,100      34.7%         3.5%          1.18
2  Victoria                  1,604      26.5%         3.6%          1.21
3  Queensland                  973      16.1%         2.0%          0.67
4  Australian Capital Terr.    494       8.2%        11.2%          3.83
```

The last column is why the page is worth having. Ranked on volume alone this
sends everybody to New South Wales for everything, because New South Wales
advertises the most of nearly everything, and first place is then a fact about
the state rather than about the work. The Australian Capital Territory is fourth
by volume and puts **one advertisement in nine** into ICT, nearly four times the
national proportion. For someone deciding where to move rather than where the
most openings are, that is the answer.

The page says both things in words underneath, generated from the figures rather
than written:

> New South Wales advertises the most of this work, 34.7% of the national total.
> The largest states advertise the most of nearly everything, so first place here
> is often a fact about the state rather than about the work.
>
> Australian Capital Territory is the most oriented towards it, giving it 3.83
> times the share the country does.

### What it refuses to do

It ranks advertising activity and says so in every heading. It is not a
recommendation about where to live, it predicts nothing, and it knows nothing
about whether anyone will be hired. The failure mode of a page like this is a
reader taking "first in the list" to mean "best for me", and the only defence is
saying what is being measured, repeatedly, where they are reading.

The employment type and sponsorship controls **do not change the ranking**, and
are labelled as applying to the advertisements only. The index publishes
advertising by occupation and region and knows nothing about either, so a control
that appeared to filter the ranking by them would be describing a dataset that
does not exist. They are carried into the link to the advertisements, where the
data supports them.

## A front page that knows what the site contains

The homepage still pointed at the three surfaces the site launched with. Five
more had been built around it, and a reader landing there had no way to learn
they existed.

It now leads to the explorer, which is the question most readers arrive with, and
names the rest rather than leaving them to the navigation rail. Job search moved
from the primary button to a link beside it: a reader who knows what work they do
is better served by being asked than by being handed a search box.

## The figures as files

The labour market data is CC BY 4.0 and permits redistribution and adaptation, so
the arithmetic done here can be handed to a reader rather than only shown. That
is worth doing for something claiming to be a research tool: a table on a page is
something to read, and a file is something to check.

Two datasets, CSV and JSON: advertisements by state, and by occupation group.

Two rules make it safe, and both live in code rather than in a habit:

**The gate comes first.** `canPublishDerivedAggregates` decides, the same
predicate the map and every ranking consult. A source whose licence reserves
aggregate use can never be exported, and the route refuses before doing any work
rather than emitting a file whose header would have to claim a permission that
does not exist. Nothing derived from Adzuna is downloadable, because nothing
derived from Adzuna is publishable.

**The licence travels inside the file.**

```text
# Online job advertisements by Australian state and territory
#
# Publisher: Jobs and Skills Australia
# Dataset: Internet Vacancy Index
# Reference period: July 2026
# Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)
# Attribution: Based on Jobs and Skills Australia data. Internet Vacancy Index, …
# Derivation: Summed by WorkMap from the regions the publisher reports on …
# Source: https://…/data-and-licensing
# Retrieved: 2026-09-09T…
#
# Figures count online job advertisements, not vacancies.
ASGS state code,State or territory,Advertisements,"Advertisements, previous period",…
```

A sidecar file gets lost on the first drag between folders. A file that leaves
without its notice is one that will be quoted somewhere with no route back to the
publisher, and CC BY requires the notice to survive the copy.

The occupation file carries a column the page does not need: **whether a row is
the finest grain**. Groups nest, so rows must not be added together, and a copy
separated from this site has no other way to know that.

An absent figure is written as an empty cell and a JSON null, never as zero. It
is the distinction the whole product rests on and a file is the easiest place to
lose it.

## Two small things worth recording

**The linter was wrong and is overridden with a reason.** It objects to an anchor
pointing at `/api/datasets/…`, wanting `next/link`. These are files: the handler
answers with `Content-Disposition: attachment`, and `next/link` would try to
navigate to one and prefetch it. The disable carries the explanation rather than
the rule name alone.

**JSX put a space before a comma.** A newline between an element and the
expression after it renders as a space, so the generated sentence read
"advertises the most of this work , 34.7%". The clause is assembled as a string
now, because punctuation has to sit where it was written.

## Files

| Path                               | Change                                  |
| ---------------------------------- | --------------------------------------- |
| `app/explore/page.tsx`             | New                                     |
| `components/explore-form.tsx`      | New                                     |
| `domain/dataset.ts`                | New. CSV and JSON with provenance       |
| `app/api/datasets/[slug]/route.ts` | New. Gated on the aggregate licence     |
| `app/page.tsx`                     | Leads with the question; names the rest |
| `app/locations/page.tsx`           | Download links                          |
| `app/occupations/page.tsx`         | Download links                          |
| `components/layout/masthead.tsx`   | Where to look, in the rail              |
| `scripts/check-accessibility.ts`   | The two new routes                      |

## Checks

`npm run check` clean: Prettier, ESLint, TypeScript, 534 tests (from 518).
`npm run build` succeeds. `npm run data:check` 16 of 16. `npm run a11y:check`
clean across 17 routes. Both file formats, both datasets, the unknown-slug 404
and the bad-format 400 verified against the live database, and the exported state
figures checked against the ones the pages render.

## Not done here

- Only two datasets. A regional file and a per-occupation-per-state file are the
  obvious next ones, and neither is more than a query away, but two is enough to
  prove the shape carries its licence correctly.
- The explorer ranks states. Regions would be more precise and much longer, and
  the state is the grain most readers are choosing between.
