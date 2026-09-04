# Milestone 09: the vacancy map

- **Date:** 2026-09-01
- **Prompts:** `09_heatmap_ui`, with the parts of `05_jsa_importer` and
  `08_heatmap_api` it depended on
- **Outcome:** Complete and drawing real figures. The first published statistic
  in the product.

## What made this possible

The July 2026 IVI release. Milestone 05 built the importer and closed with the
sign-off line "Verified against a real release: **blocked on file access**".
The product owner supplied
`internet_vacancies_anzsco2_occupations_gccsa_and_sa4_regions_-_july_2026.xlsx`,
and the parser met a real workbook for the first time.

It found two things worth recording.

**The header aliases were ranked wrongly.** `geographyName` listed `state`
first, and a regional release carries both a `State` column and a
`region_name` column. The importer read the state, so SA4 101 was labelled
"NSW" instead of "Capital Region". Column order could not fix this, because
`State` appears to the left. Aliases are now ordered most specific first and a
match carries its rank, so the most specific column wins wherever a sheet
offers two for one role. This is the kind of defect a fixture cannot find: the
fixture had one column because we wrote it.

**The release publishes at two geography levels at once.** Eight capitals at
GCCSA and the rest of the country at SA4. `GCCSA` did not exist as a level, so
the capitals had nowhere to land.

## What was built

**Geography.** `GCCSA` added to the level enum, with migration
`20260831184851_add_gccsa_geography_level`, plus the boundary registry entries
and `public/geography/gccsa-overview-ASGS2026.topo.json` built from the ABS
release. 155 areas are now loaded.

**Query** (`listRegionTotals` in `db/repositories/labour-market.ts`). Reads the
source's own all-occupations row rather than summing the occupation rows,
because summing would publish a figure the publisher did not, and for an
advertisement index the parts need not sum to the whole. Returns regions with
figures and regions without, separately, so a gap can be drawn as a gap.

**Projection** (`geography/choropleth.ts`). Topology is decoded, projected and
turned into path strings on the server. The projection is equal-area, because a
choropleth invites the reader to compare the size of coloured regions and a
Mercator would inflate the south while they did it.

**The map** (`components/vacancy-map.tsx`, `components/vacancy-table.tsx`,
`app/map/page.tsx`). Static SVG with a legend and a table of the same figures.
No map library reaches the browser.

**Navigation** (`components/site-header.tsx`). The map was unreachable: nothing
linked to it. A two-item masthead now carries both sections, marks the current
one with `aria-current`, weight and an underline, and prefetches neither,
because both routes are `force-dynamic` and a prefetch is a real server render.

## Two decisions

**Quantile shading, not linear.** Greater Sydney runs 42,880 advertisements
against a regional SA4's 572. On a linear scale the whole country outside three
capitals falls in the palest band and the map says nothing. Quantile shading
encodes rank, so the legend prints the real range of every band: without the
numbers a reader could reasonably infer the darkest band is five times the
lightest, which it is not.

**No heatmap API.** Milestone 08 specified one. The page renders on the server
and reads the repository directly, so an HTTP endpoint would be a contract with
no consumer, and every route is another thing to version, authorise and cache.
When a second consumer exists, the query is already isolated in one function.
Recorded as deferred, not done.

## The bug the tests did not catch

Every region's `<title>` rendered empty. Written as `{region.name}: {figure}`,
its children are an array of four, and React renders an SVG `<title>` with more
than one child as empty. Fifty regions carried a title element that announced
nothing, which is worse than having none: it looks correct in the source and in
review. Typecheck, lint and 260 tests all passed. It was found by loading the
page and reading the HTML.

`regionTitle()` is now a function returning one string, with tests, because a
string is testable in a Node environment and a rendering is not.

## Files changed

- `app/map/page.tsx`, `app/page.tsx`, `app/globals.css`
- `components/{site-header,vacancy-map,vacancy-table,region-figure}.{tsx,ts}`
- `geography/choropleth.ts`, `scripts/build-geometry.ts`
- `db/repositories/{labour-market,geography}.ts`, `db/schema.prisma` and the
  migration above
- `domain/geography.ts`, `ingestion/geography.ts`, `integrations/jsa/ivi.ts`
- `data/geography/{manifest,registry}-ASGS2026.json`,
  `public/geography/gccsa-overview-ASGS2026.topo.json`
- `next.config.ts`, `package.json`
- `tests/{choropleth,geography,labour-market,database}.test.ts`

## Open issues

1. **No selection, no drilldown.** Prompt 09 asks for selection and a drilldown
   affordance and prompt 10 is the drilldown itself. The map is currently a
   static picture with a table. Both need a plan for state without turning the
   page into a client application.
2. **One month, no trend.** 06 and 07 remain. The importer holds history; only
   the latest period is drawn.
3. **Occupation figures are loaded and unused.** 2,850 series carry ANZSCO2
   occupations. That is the WHAT matrix, at milestone 11.
4. **The map is not responsive-tested on a real device.** It scales with the
   viewport, which is not the same statement.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 262 of 262
- [x] Typecheck, lint, format pass
- [x] Verified against a real release: 50 regions, July 2026
- [x] Rendered and read: both pages served 200 and the figures were checked in
      the HTML, which is how the empty titles were found
- [x] Accessible alternative present: table, legend ranges, no meaning by
      colour alone
- [x] Provenance preserved: dataset, period and attribution on the page
- [x] Documentation updated
