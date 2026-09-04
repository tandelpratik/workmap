# Milestone 10: the state drilldown

- **Date:** 2026-09-04
- **Prompts:** `10_heatmap_drilldown`, and the skip link owed from 09a
- **Outcome:** Complete. Australia to state, with the detail tier ADR-0003
  planned for and has been building unused since milestone 09.

## The problem the drilldown actually posed

"Australia → state → supported regional level" sounds like cropping the
national map. It is not, because of how JSA IVI publishes: a capital city is
one figure, and the rest of a state is a figure per SA4. A state view therefore
has to draw Greater Sydney as a single region and the fifteen SA4s inside it
as nothing at all, while drawing the thirteen regions around it individually.

The detail tier as built could not do that. It held SA4s only, so drilling into
New South Wales would have drawn fifteen unshaded shapes over Sydney: a hole
where two thirds of the state's advertisements are, presented as missing data.
The alternative, taking Greater Sydney from the national tier, puts a coarse
outline against fine borders and leaves a visible seam along every shared edge:
the two tiers simplify at 0.7 per cent and 12 per cent of vertices.

**What made it solvable was already in the source.** The ABS SA4 boundary file
carries `GCC_CODE26` on every SA4, which is the ABS saying which capital each
one belongs to. The build now keeps that field and, in a second pass at the
same simplification, dissolves the SA4s into their capitals. A capital's edge
is therefore made of the very arcs its neighbours use, so the two meet exactly,
and a selected capital outlines as one shape rather than tracing fifteen
internal borders that its single figure does not have.

That is nine more files, 2MB, per-state and loaded only on drilldown, which is
what the tier was for.

## The rest of it

**Navigation is still only links.** `/map?state=1&region=101`. Drilling in,
selecting, clearing and stepping back out are four links, no client JavaScript,
and every one of them is shareable. `regionHref` is the one place that builds
them, so clearing a selection cannot accidentally also drop the state.

**Bands stay national.** Shading in a state view uses the national quantiles,
so a region does not darken because the reader zoomed in. Rebanding per state
would show variation within the state more clearly and would make the colour
mean something different in each view, which is a picture of the view rather
than of the labour market.

**Selection is resolved nationally, then checked against what is on screen.**
Drilling into Victoria with Greater Sydney selected is not an error and not
nothing: the region exists, it is elsewhere, and the page says so and links to
it. Silently dropping the selection was the easy option and the wrong one.

**The skip link owed from 09a.** Fifty region links sit between the top of the
page and the table. There is now a skip link over the map, hidden until
focused.

## The production bug this nearly shipped with

`outputFileTracingIncludes` listed `./public/geography/*.topo.json`, which does
not match a subdirectory. The detail tier would have been absent from the
serverless bundle: a drilldown that worked perfectly in development and threw
in production, which is the exact failure that setting exists to prevent and
the exact way it fails, silently, at the point where nobody is watching. Caught
by reading the file trace of a real `next build` rather than by trusting the
pattern. The trace now carries 42 geometry files, 36 of them detail tier.

## Files changed

- `scripts/build-geometry.ts`, and every file under
  `public/geography/sa4-detail-ASGS2026/`
- `geography/choropleth.ts`, `next.config.ts`
- `app/map/page.tsx`, `components/{region-detail,region-figure,vacancy-map,vacancy-table}.tsx`
- `db/repositories/labour-market.ts`
- `tests/choropleth.test.ts`

## Decisions

- **The geometry module is told which codes carry data**, rather than reading
  them. That is what keeps `geography/` free of any knowledge of the database
  while still letting it decide whether an SA4 stands for itself or forms part
  of a capital.
- **The state test reads the built artefacts**, not a fixture. A fixture would
  assert that the reader parses a file we wrote for it. The failure worth
  catching is a geometry rebuild that stops emitting what the state view needs.
- **An unrecognised state falls back to the national map with a note.** A
  malformed or stale link should still show something true.

## Open issues

1. **No filters.** Occupation, metric and period controls are still unbuilt,
   and occupation is the valuable one: 2,850 series are loaded and only the
   all-occupations row is read.
2. **Drilldown stops at the state.** ASGS goes further, and IVI does not, so
   the next level down would be a finer geography than the data supports. That
   is a limit of the source, not of the map, and it should stay that way.
3. **The detail tier is not lazily loaded.** The state's file is read on the
   server per request. Fine at this size, worth caching if the page gets busy.
4. **Two territories have no rest-of-state regions**, so their state view is
   the capital alone. Correct, and it looks sparse.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 278 of 278
- [x] Typecheck, lint, format pass
- [x] Production build succeeds, and its file trace was read to confirm the
      detail tier is bundled
- [x] Verified in the running app: a state view, a selection inside it, a
      selection belonging to another state, and an unrecognised state
- [x] Accessible: breadcrumb as a nav landmark with an ordered list, skip link
      over the map, links throughout rather than scripts
- [x] Provenance preserved: same rows as the national view, filtered, with
      national bands so a colour does not change meaning
- [x] Documentation updated
