# Milestone 11: occupation profiles

- **Date:** 2026-09-04
- **Prompts:** `11_occupation_intelligence`, in part
- **Outcome:** Profiles complete. The classification half is **not** done, and
  is blocked on a compliance question rather than on effort.

## What was blocked, and why it stayed blocked

Prompt 11 asks for occupation profiles "using ANZSCO/JSA-supported mappings".
The mapping half cannot proceed yet. The source register records the reason,
open since milestone 03a: the `anzsco` source is `PENDING` and `UNVERIFIED`,
and while verifying the ABS licence a finding was recorded that ANZSCO has a
successor, OSCA, whose branding is excluded from ABS CC BY 4.0. Whether the
classification content itself is licensed like other ABS material is implied
but unconfirmed, and the register says in as many words that it must not be
assumed.

So this milestone builds everything that does not require a classification, and
leaves the classification where it was. Resolving it needs a licence read on an
OSCA page and a decision on which classification to standardise on. That is a
compliance task, not a coding one, and guessing it would be the exact failure
mode the source register exists to prevent.

The practical consequence is small: JSA publishes its own occupation names and
codes with the figures, and those are what the product shows. What is missing
is the ability to say that JSA's group `26` is the same thing as some other
source's ICT category, which nothing yet needs.

## What was built

**`/occupations`.** The 57 groups the release carries, ranked by
advertisements, each linking to its own page. The all-occupations row heads the
page rather than competing in the ranking, because it is the whole and the rest
are parts.

**`/occupations/[code]`.** One group: the figure, the change on the month
before, its rank among the groups, the region it is most advertised in, how
many regions reported, the full regional table, and a link to the map filtered
to it. An unknown code is a 404, not an empty profile: answering 200 would tell
a reader, and a search engine, that the occupation exists and reported nothing.

**`listOccupationTotals`.** One pass over 2,850 series rather than 57 queries,
which matters when the database is in another region.

## The number that needed care

A profile wants a headline figure, and JSA does not publish one in this
release: it publishes by region. Summing the regions produces a national
figure, and the question is whether the product may.

It may, and it says so. The repository already refuses to sum occupation rows
into a total, because occupation groups nest and overlap and adding them
invents a figure the publisher never claimed. Regions are the opposite case:
IVI's regions partition Australia exactly once, verified when the map was built
(8 capitals plus 42 rest-of-state areas, no overlap), so the sum is arithmetic
on a partition rather than an invention. What would be dishonest is presenting
it as JSA's national figure, so both pages say it is ours and how it was made.

Verified against the database directly rather than assumed: 205,954 for all
occupations, 25,316 for MANAGERS, 6,053 for ICT Professionals, July 2026, each
matching a direct query. Two tests pin it: the total must equal what the
regional query returns, and no group may exceed all occupations.

## What was deliberately not built

**No link into job search.** The prompt asks for one. JSA's occupation groups
are classification labels, not job titles: a keyword search for "ICT
Professionals" against Adzuna would return almost nothing and would look
broken. Mapping a group to a set of search terms is exactly the occupation
mapping the source register forbids inventing. It belongs with the
classification work.

**No trend.** Two reference periods are held (ADR-0010). The pages state a
month and its change on the month before rather than drawing a two-point line
and calling it a trend.

**No SEO routing yet.** The routes are clean and the metadata is per
occupation, but the site is still `noindex` until milestone 27, which is where
that decision belongs.

## Files changed

- `app/occupations/page.tsx`, `app/occupations/[code]/page.tsx`
- `db/repositories/labour-market.ts`, `components/site-header.tsx`
- `tests/database.test.ts`

## Decisions

- **The all-occupations row is excluded from rankings.** It is the whole. A
  ranking that included it would always place it first and mean nothing.
- **`VacancyTable` is reused for the regional breakdown**, so the same figures
  are presented the same way whichever page a reader arrives on.
- **A missing occupation is a 404**, and a region with no figure is still a row
  saying so. The two absences are different and are rendered differently.

## Open issues

1. **The classification question is still open**, and now blocks nothing else
   except a job-search cross-link. ANZSCO against OSCA, and a licence read.
2. **No occupation page links back to a state.** A reader looking at ICT
   Professionals cannot jump straight to ICT in Victoria without going via the
   map.
3. **57 rows with no grouping.** The major groups and their finer groups are
   interleaved by code order. The source publishes a hierarchy level the schema
   does not store.

## Sign-off

- [x] Implementation complete for the unblocked half
- [x] Tests pass, 286 of 286
- [x] Typecheck, lint, format pass
- [x] Production build succeeds, both routes present
- [x] Verified in the running app: the index, two profiles, and an unknown code
- [x] Figures cross-checked against direct database queries, not assumed
- [x] Provenance preserved: the publisher's names and codes, with our own
      arithmetic labelled as ours
- [x] Documentation updated
- [ ] Classification mapping: **blocked on the OSCA licence question**
