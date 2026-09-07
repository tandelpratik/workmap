# Design system

The constitution in `.claude/CLAUDE.md` states the direction: editorial data
journalism, modern cartography, an atlas rather than a dashboard. This document
records how that is built, so the next page written looks like the ones already
here.

Where this document and the constitution disagree, the constitution wins.

## References

The house style is assembled from published work, not invented:

- **Financial Times and Economist data journalism**: the figure frame. Title,
  subtitle carrying period and unit, graphic, key, source. Every graphic
  survives being screenshotted and pasted somewhere else.
- **ONS and ABS statistical releases**: the release strip. A page states its
  dataset, reference period and coverage as fields before it states a number.
- **Our World in Data**: controls adjacent to the graphic they control, and
  caveats below it rather than in front of it.
- **Atlas plates**: a dominant graphic with fixed marginalia beside it, on a
  grid that holds across every sheet.

## Tokens

All in `app/globals.css`. Nothing else in the codebase names a colour.

| Group   | Tokens                                              |
| ------- | --------------------------------------------------- |
| Surface | `paper`, `paper-raised`, `paper-sunken`             |
| Ink     | `ink`, `ink-muted`, `ink-faint`                     |
| Rules   | `rule`, `rule-strong`, `rule-heavy`                 |
| Accent  | `accent`, `accent-muted`                            |
| Scale   | `scale-1` … `scale-5`, `scale-none`                 |
| State   | `state-available`, `state-pending`, `state-blocked` |

Two schemes, light and dark, both warm. The dark scheme redefines the same
custom properties under `prefers-color-scheme: dark`; it does not introduce
names of its own, and a component never learns which scheme is active.

`rule-heavy` is the two-pixel rule that opens a figure. It is ink on paper but
deliberately not ink's inverse at night, because a near-white bar repeated down
a dark page reads as a row of lights rather than as typography.

### Type

`sans` (IBM Plex Sans) for interface, data and chart titles. `serif`
(Source Serif 4) for display and headlines. `mono` (IBM Plex Mono) for field
labels, codes and source lines.

Display sizes are fluid: `text-display`, `text-title`, `text-figure` clamp
between a phone-sized floor and a ceiling the measure below them can balance.
`text-label` is the mono uppercase micro-label used for every field name.

### Widths

`max-w-plate` (82rem) for a page built around a graphic. `max-w-column` (44rem)
for a page that is read. `max-w-measure` (34rem) for any run of prose.

Tailwind's breakpoints measure the viewport, not the container. A component
inside `max-w-column` must not use a `lg:` grid: at that breakpoint it will
divide seven hundred pixels between the columns it appeared to ask for.

## Primitives

| Component       | Purpose                                                       |
| --------------- | ------------------------------------------------------------- |
| `Masthead`      | Wordmark, tagline, current release, section rail              |
| `PageBody`      | The `<main>` landmark, width and page gutters                 |
| `Dateline`      | What the page is, above the headline                          |
| `PageTitle`     | The headline                                                  |
| `Lede`          | The standfirst. One sentence                                  |
| `ReleaseStrip`  | Dataset, period, coverage, basis, as fields                   |
| `Plate`         | Graphic, sticky margin, and full-width content beneath        |
| `FigureFrame`   | Title, subtitle, graphic, key, source                         |
| `Notes`, `Note` | Numbered qualifications, under the graphic they qualify       |
| `Advisory`      | What happened when the reader asked for something unavailable |
| `Colophon`      | Required attribution for every source the page displays       |
| `Stat`          | One headline figure                                           |
| `Bar`           | The comparison a column of numerals loses                     |

## Rules

**Data before caveats, caveats before the fold ends.** A page states its figure
first and qualifies it immediately below, in `Notes`. It never opens with three
paragraphs of hedging. The qualification is not optional and is never hidden
behind a disclosure; it is placed where a reader looks for it.

**Every graphic carries its own source.** `FigureFrame` takes a `source` and
the string comes from the source registry verbatim. A licence notice is never
paraphrased in a component.

**`Colophon` is given source keys, not sentences.** Attribution written by hand
into a footer had already fallen a source behind the ingestion pipeline. Name
what the page displays and let the registry supply the wording.

**No cards.** No shadows, no corner radii, no filled panels. Separation is
hairlines and whitespace. A filled box with a shadow is the visual grammar this
product is defined against.

**One accent.** Rust, for links, interaction and the rule at the head of the
page. Never as decoration, never as a second colour.

**Nothing means anything by colour alone.** A choropleth is always paired with
a table. A bar always has its figure printed beside it. A status dot always has
its label. The dot is an index, not the message.

**Absence is named.** "No figure", "Withheld by the publisher" and "Outside
this dataset" are different facts. No component may render a dash for all
three, and none may render an absent value as zero.

**Tables scroll inside their own frame.** Wrap in `.scroll-x` and set a
`min-w-*` that fits the columns actually shown at that breakpoint. The body
must never scroll sideways.

**Controls are forms, not scripts.** State lives in the URL. Every page is
server rendered and works with JavaScript off; that is what makes a selection
shareable and the back button correct.

**Touch targets are at least 44px.** Buttons carry `min-h-11`.

## Print

A research tool gets printed. Navigation and controls carry `print-hide`; the
ground goes white; figures and rows avoid breaking across pages.
