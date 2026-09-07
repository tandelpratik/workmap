# 18. Presentation rebuild

The product owner's assessment was that the site read as generic AI output and
was not usable on a phone. It did. The tokens were never the problem: warm
paper and ink, IBM Plex and Source Serif, a rust accent, all as the constitution
asks. The structure was.

Every page was `mx-auto max-w-5xl px-6 py-16`: one centred column, a serif
headline, a muted paragraph, a stack of rules. That is the most recognisable
shape a generated page takes, and it said nothing about what any particular page
was for. The map, which the constitution calls the product's front door, was a
small SVG inside a text column below roughly two hundred and fifty words of
qualification.

## What changed

**A layout system.** `components/layout/` and `components/data/` hold the house
style: masthead, plate grid, figure frame, release strip, notes, colophon,
headline figure, bar. Recorded in
[the design system](../architecture/DESIGN_SYSTEM.md). Subject components keep
their own directory, and layout components know nothing about labour market
data.

**The map page became a plate.** Slim control bar, the map at the top of the
page in a figure frame with the key inside it, the selected region's figures in
a sticky margin beside both the map and the table, and the qualifications as
numbered notes below the graphic. On one column the margin falls directly under
the map, so a reader who selects a region on a phone does not have to scroll
past fifty table rows to see what they selected.

**A front page.** `/` was job search; it is now a section front carrying the
current release, a state-level map, the largest occupation groups, and the way
in to each section. Job search moved to `/jobs`. The state map made the state
drilldown reachable, which previously required selecting a region first and
then following a link out of the detail panel.

**Rankings became readable.** Fifty regions and fifty-six occupation groups now
carry a rank and a bar scaled to the largest figure shown. The figure is printed
in every case.

**A dark scheme.** A warm night edition, defined as overrides of the same tokens,
including a re-derived choropleth ramp that preserves direction so the key does
not need rewording.

**Mobile.** Section rail scrolls rather than folding into a scripted menu.
Tables scroll inside their own frame with column sets that suit the width.
Controls are 44px targets. Nothing scrolls the body sideways.

Also: a real not-found page, a favicon the brand config actually points at, and
print styles.

## Defects fixed on the way

**`ink-faint` failed WCAG AA.** `#8a857b` on paper is about 3.5:1, and it
carried nearly every piece of small text on the site, including field labels and
source lines. Now `#6f6a5f`, about 4.9:1.

**State coverage mixed two populations.** The map's coverage sentence compared
`withoutData.length`, which is national, against `regions.length`, which is
filtered to the state being viewed. Inside New South Wales it read "8 of 19
regions", where eight was the number of blank regions in the country. Both
sides are now filtered by the same state.

**The jobs page named the wrong source.** Its footer said listings were
collected from Adzuna. Smart Jobs and Careers went live at milestone 13b, so
Queensland Government listings were attributed to Adzuna, and the CC BY notice
that licence requires appeared nowhere on the site. `Colophon` now takes the
source keys of the listings actually shown and renders each registry entry's
stored wording; each listing also names its own source.

**Page weight.** The national map shipped 1.5 MB of HTML and the new front page
would have shipped 1.2 MB. Two causes: `geoPath` emitted three fractional
digits, which is finer than a device pixel on a 960-unit frame, and the base
outline was emitted twice because it is drawn once under the data and once over
it. Path data is now generated at one digit, and every layer references one
shared shape definition per area through `<use>`.

| Route          | Before  | After   | Gzipped |
| -------------- | ------- | ------- | ------- |
| `/`            | 1.21 MB | 353 KB  | 108 KB  |
| `/map`         | 1.54 MB | 914 KB  | 266 KB  |
| `/map?state=`  | 2.04 MB | 1.49 MB | 388 KB  |
| `/occupations` | 85 KB   | 154 KB  | 21 KB   |

The state drilldown is still heavy; its geometry comes from the detail tier and
reducing it means a coarser build artefact, which is a change to the geometry
pipeline rather than to the presentation layer.

## Not done

**The listing count may exceed what Adzuna's terms allow.** `/jobs` prints
"2,713 listings in the index" and "Page 1 of 136". Both are counts over a set
that includes Adzuna rows, and their terms forbid publishing data "in
aggregation (including but not limited to vacancy counts...)" without written
consent. Milestone 12–17 established that Adzuna cannot power aggregates. A
result count is arguably search mechanics rather than a published statistic, but
the line is the product owner's to draw, so behaviour is unchanged and the
front page deliberately carries no listing count.

**Trend.** Two reference periods are held (ADR-0010), so `WHEN` has no surface.
Pages state a change on the month and say explicitly that it is not a trend.

**The README status line is stale.** It still says milestone 04 of 35.

## Checks

`npm run check` covers format, lint, typecheck and 333 tests across 17 files, all
passing. `npm run build` succeeds. Every route smoke-tested against live data,
including unknown state, unknown region, unknown occupation and the 404.
