# Milestone 10a: the occupation filter

- **Date:** 2026-09-04
- **Prompts:** the UI controls listed in `09_heatmap_ui`
- **Outcome:** Complete for occupation. Metric and period are deliberately not
  built, for reasons recorded below.

## What the data turned out to be

The release carries 57 occupation codes per region: one all-occupations row,
eight major groups and 48 finer groups, 2,850 series in all. They have been
imported since milestone 09 and, until now, only the all-occupations row was
ever read.

Two findings shaped the work, and both came from looking at the stored values
rather than assuming them.

**JSA names its all-occupations row after the region.** Code `0` arrives as
"Greater Sydney TOTAL", "Capital Region TOTAL", fifty different names for one
code. This is the publisher's own labelling and the workbook confirms it, so
nothing is wrong with the import: what is wrong is treating any one of those
names as the code's name. Doing so would have offered a reader in Perth a
filter labelled "Greater Sydney TOTAL".

`listOccupations` therefore returns `name: null` for a code the source names
inconsistently, and the view supplies "All occupations" as our own wording. The
null is the honest answer, not a missing value: the source did not give the
code one name. Every other code is named exactly once, and that name is
displayed verbatim, upper case and ampersands included, because it is the
publisher's (ADR-0002).

**The vocabulary is not all of ANZSCO.** `25` is not in it. Asking for an
occupation the release does not carry falls back to all occupations and says
so, which is the same posture the region and state parameters already take.

## The control

A plain GET form with a select and a submit button. No client JavaScript, so
there is no change handler to submit it, and the button is not a compromise but
the mechanism. The choice lands in the URL, which makes it shareable and
bookmarkable and leaves the back button working.

State and selected region ride along as hidden fields. Choosing an occupation
changes the figures and nothing else: a reader looking at Greater Sydney inside
New South Wales is not thrown back to the national map for asking about ICT
professionals. `/map?state=1&region=1GSYD&occupation=26` is the shape of a
fully specified question, and all three parameters compose.

## What was not built, and why

**Metric.** There is one measure in this dataset. A control with a single
option is furniture.

**Period.** Two reference periods are held, and the second exists to make the
month-on-month change possible rather than to be browsed. A period control
would offer June, whose own comparison is to a month no longer stored, so it
would mostly render "no earlier month held". This is a consequence of
[ADR-0010](../adr/0010-labour-market-retention-window.md) and it should be
built when the window widens, not before.

Recording these as decisions rather than leaving them unmentioned, because a
missing control looks the same as a forgotten one.

## The lint rule that was right

`components/occupation-filter.tsx` first imported its option type from
`db/repositories/labour-market`, and lint refused it: components render what
they are given and must not depend on persistence (ADR-0001). The type is now
declared in the component layer, as `RegionFigure` already was. The rule caught
a real architectural slip in the first minute rather than at review.

## Files changed

- `components/occupation-filter.tsx`, `app/map/page.tsx`
- `db/repositories/labour-market.ts`
- `tests/{choropleth,database}.test.ts`

## Decisions

- **The list is what the source published**, read from the series rather than
  from an occupation table, because nothing has resolved these codes to a
  classification yet. ANZSCO against OSCA is milestone 11, and this does not
  pre-empt it.
- **A single occupation can never exceed all occupations in a region**, and a
  test asserts it across every region. That is the assertion that catches a
  filter silently ignoring its argument, which is the failure that would
  otherwise look completely normal.
- **Bands are still national.** Switching occupation rebands, because the
  bands describe the figures being drawn; switching state does not, because it
  does not change which figures they are.

## Open issues

1. **57 options in one flat select.** Ordered by the source's code, which
   groups them by major group as a side effect. Grouping with `optgroup` would
   read better and needs the hierarchy level, which the source publishes in a
   column the schema does not store.
2. **Occupation is not in the page title or metadata**, so a shared link
   previews the same way whatever it asks about.
3. **Milestone 11 proper** is still ahead: resolving these codes to a
   classification, and the occupation matrix.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 283 of 283
- [x] Typecheck, lint, format pass
- [x] Verified in the running app: all occupations, a major group, a finer
      group, one combined with a state and a selected region, and a code the
      release does not carry
- [x] Provenance preserved: the publisher's names verbatim, its codes shown
      beside them, our own wording only where the source has none
- [x] Accessibility: labelled control, no colour-only meaning, works without
      scripting
- [x] Documentation updated
