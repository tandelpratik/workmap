# Milestone 09a: map selection, and a two-period retention window

- **Date:** 2026-09-04
- **Prompts:** the remainder of `09_heatmap_ui`
- **Outcome:** Complete. The map selects, and the database holds two months
  instead of ninety-one.

## Why this ran

Two things, one asked and one owed.

The map was not interactive. The spec is explicit: click or tap must select,
selection must persist, a detail panel must show the exact metric and context.
Milestone 09 shipped a static picture and recorded the gap. The page's own
comment conflated two separate arguments, which is worth naming because it is
how the gap survived review: "no map library reaches the browser" is a sound
decision about tile engines and payload, and it says nothing at all about
whether a region can be selected.

The product owner then asked for two months of data rather than the full
release. That is [ADR-0010](../adr/0010-labour-market-retention-window.md).

## Selection is a URL, not a state machine

Each region is an anchor to `/map?region=<code>`. That is the whole mechanism,
and every requirement in the spec falls out of it:

- **Selection persists** because it is in the address bar, so it survives a
  reload and the back button, and it can be sent to someone.
- **Keyboard operable**, because links already are. No key handler exists to
  get wrong.
- **Works without JavaScript**, like the job search, which was already built
  this way.
- **No client bundle**, so the free-tier argument that produced the static map
  is not weakened by making it interactive.

Selecting a selected region clears it, on the map and in the table both, so the
control has one shape.

The cost is honest: each selection is a server round trip rather than an instant
repaint. On a `force-dynamic` page already doing a database query, that is a
few hundred milliseconds, and a `loading.tsx` boundary can soften it later.

## What that forced

**`role="img"` had to go.** The SVG previously announced itself as an image and
pointed a screen reader at the table. Putting links inside a `role="img"` would
have pruned them from the accessibility tree while leaving them focusable,
which is the worst of both: a keyboard reaches something a screen reader cannot
see. It is a group of links now, and each link's accessible name is the
region's name and figure.

**The selection is drawn twice.** Once as the region's own outline, and once
again on top of everything. Painting it only in place lets a neighbour drawn
later cover the shared border, which is exactly the edge the reader is looking
at.

**Every absence is named.** The panel distinguishes "no earlier month is held"
from "not published for June 2026". Both produce no change figure and they are
not the same fact, so printing a dash for both would flatten them (ADR-0002).

**The query string is validated.** A region code is bounded to short
alphanumerics before it is used. Anything failing that is treated as no
selection, because a malformed link should still show the map; a well-formed
code naming no region gets an explicit answer rather than silence.

## Retention

91 periods, 2,850 series, 259,350 rows, of which 5,700 were reachable. The
window is applied while importing rather than afterwards, so a full release
costs 5,700 writes rather than a quarter of a million writes and then a quarter
of a million deletes. It is taken from the file rather than the clock, so a late
or archived release keeps its own newest months. The reasoning and what it costs
are in ADR-0010.

The prune ran through the same code path a future import will use, rather than
by hand: `npm run jsa:prune -- --confirm` deleted 253,650 rows across 89
periods, leaving June and July 2026.

Two periods is what makes the panel's month-on-month figure possible, so the
retention request and the selection work met in a useful place rather than
fighting.

## Files changed

- `config/retention.ts`, `ingestion/retention.ts`, `ingestion/jsa-ivi.ts`
- `db/repositories/labour-market.ts`, `domain/labour-market.ts`
- `scripts/prune-jsa-history.ts`, `package.json`
- `components/{region-detail,region-figure,vacancy-map,vacancy-table}.tsx`
- `app/map/page.tsx`, `app/globals.css`
- `docs/adr/0010-labour-market-retention-window.md`
- `tests/{retention,labour-market}.test.ts`

## Decisions

- **Rank is computed from the same ordering the table uses**, so the panel and
  the table cannot disagree about which region is third.
- **A prune failure does not fail the import.** The data is written and correct;
  the database is merely larger than intended. It is logged and the run still
  completes.
- **The idempotence test holds its retention window open.** The fixture's
  periods are January and February 2006, so on a machine holding a real 2026
  release the prune would delete them the instant they were written and the test
  would measure retention instead of idempotence, differently for each
  developer. Retention has its own tests.

## Open issues

1. **Drilldown is still milestone 10.** The detail-tier geometry has been built
   and unused since milestone 09: nine per-state files in
   `public/geography/sa4-detail-ASGS2026/`.
2. **No filters.** The spec asks for occupation, metric and period controls. The
   map is hardwired to all occupations and the latest period. Occupation is the
   valuable one, and 2,850 series are loaded and waiting for it.
3. **Trend needs the window widened.** Milestones 06 and 07 now begin with a
   configuration change and a re-import.
4. **Fifty tab stops.** The map's links are keyboard reachable, which is
   correct, but a reader tabbing to the table passes through every region. A
   skip link over the map would fix it.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 272 of 272
- [x] Typecheck, lint, format pass
- [x] Verified in the running app: selection, clearing, an unknown code and a
      malformed code were each requested and the rendered HTML read
- [x] Accessible: links not scripts, `aria-current` on both representations,
      selection marked by shape and text rather than colour
- [x] Provenance preserved: period, level, ASGS code and attribution on the page
- [x] Documentation updated
