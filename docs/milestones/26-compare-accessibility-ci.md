# Compare, an accessibility audit, and checks that run themselves

Three pieces: a page that puts two things side by side, an audit that found two
real defects including one this work had just introduced, and the wiring that
makes every check run rather than wait to be remembered.

## Two things, side by side

Every other page answers a question about one thing. A ranking puts many things
in an order, which is not a comparison: it says New South Wales is larger than
Queensland and nothing about how the two differ.

The interesting difference between two places is almost never size. Size is
already obvious and already on the location pages. It is **mix**, and the page
spends its space there:

```text
Queensland and Victoria, where the two differ most

  Drivers and Storepersons (7A)     3.9%  1,928    2.2%   984    +1.7 points
  ICT Professionals (26)            2.0%    973    3.6% 1,604    -1.6 points
```

Queensland puts nearly twice the share of its advertising into freight and
storage; Victoria puts nearly twice into ICT. Both facts are invisible in a
ranking, and both fall out of the same measure the insights page uses, so a
reader meeting it twice meets one idea rather than two.

The counts sit under the shares deliberately. The gap is in percentage points
and says nothing about volume, and a reader who reads it as volume has been
misled by the table rather than by the data.

Two occupations compare the other way round: their size and movement, then where
in the country each is advertised, because a group advertised heavily in one
state and thinly elsewhere is a different proposition from one spread evenly and
the totals do not show it.

Two forms rather than one with a mode switch. A single form would need its
options to change when the mode changed, which needs a script, and every other
control here is a plain GET form that works without one. Every way of asking for
an impossible comparison, including asking for a place against itself, says what
was wrong with the request and that nothing was compared.

## The audit

Contrast first, computed rather than eyeballed. Every foreground token against
every surface, in both schemes: only `accent-muted` and `state-pending` fall
below 4.5:1, both clear 3:1, and neither is used for text anywhere in the
codebase. Nothing to fix.

Structure second, across fifteen routes including the not-found page and several
with query state. Two findings, both real:

1. **`/jobs` jumped from h1 to h3.** Job titles are h3 and nothing headed the
   results, so a reader navigating by heading level landed on the first
   advertisement having been told nothing about what they were in. The results
   are a labelled region now, with a hidden heading: the release strip directly
   under it already says the same thing visually, and repeating it on screen
   would be furniture.

2. **The site footer's column headings were h3.** The footer is a top-level
   region of every page, so its headings sit directly under the h1, and any page
   whose content had no h2 jumped a level. The not-found page did exactly that,
   which is the page a reader most often arrives at already lost.

The second one is worth dwelling on: it was introduced three milestones ago, by
this same body of work, and nothing caught it until something looked. That is
the argument for the script rather than the checklist.

The script is honest about its reach. It decides what can be decided by reading
markup, which is a real subset and not the whole of accessibility: it cannot
tell you whether a heading is a good heading or whether an alternative conveys
what the graphic conveys. It can tell you a page jumped a level, which is the
defect it was written to catch.

## Checks that run themselves

Four commands now exist that answer questions nobody was asking often enough.
Two workflows make them run.

**`ci.yml`** on push and pull request: format, lint, types and tests, then data
quality, then a build, then accessibility against the built server rather than
the dev one, because the built output is what readers get.

The database-dependent halves are skipped when the secret is absent rather than
reporting a pass they have not earned, and the run says so in an annotation. A
fork's pull request gets no secrets and gets the first half, honestly labelled.
The offline checks still cover what matters most before a deployment: every
publishing source stores its required attribution, every source with established
rights names a linkable licence, every live listing source states what may be
reproduced from an advertisement.

**`source-health.yml`** weekly, on Monday, after both ingestion schedules have
had their chance that day. Weekly rather than daily is a trade against how fast
a stopped crawler needs finding: listings are retired after fourteen days
without being seen, so a weekly check gets two chances to notice before the
corpus begins emptying itself, and a daily one mostly repeats itself six more
times. It runs on demand from the Actions tab when something looks wrong.

It also runs the data quality checks, and that is the point of putting them
there as well as on push: **corruption arrives with an import, not with a
commit**, so a gate that only fires when somebody changes code would miss the
thing it exists to catch.

Failure is the notification. A red run on the default branch is visible without
anything else being configured, and this is deliberately not wired to an
alerting service the project does not have. When one exists, the change is a
step, not a rewrite.

Every check is a command that can be run locally. The workflows schedule them
rather than defining them, so no check exists only in CI where nobody can
reproduce it.

## Files

| Path                                  | Change                                    |
| ------------------------------------- | ----------------------------------------- |
| `app/compare/page.tsx`                | New                                       |
| `components/compare-form.tsx`         | New. Two GET forms, no script             |
| `scripts/check-accessibility.ts`      | New. `npm run a11y:check`                 |
| `.github/workflows/ci.yml`            | New. The gate                             |
| `.github/workflows/source-health.yml` | New. Scheduled health and integrity       |
| `app/jobs/page.tsx`                   | Results are a labelled region             |
| `components/layout/site-footer.tsx`   | Column headings are h2, and Compare added |
| `app/occupations/page.tsx`            | Uses the shared hierarchy rule            |

## Checks

`npm run check` clean: Prettier, ESLint, TypeScript, 518 tests. `npm run build`
succeeds. `npm run data:check` passes 16 of 16. `npm run a11y:check` reports no
structural problems across 15 routes. Both comparison modes and every invalid
request verified against the live database.

## Loose end closed

The previous milestone claimed the occupation hierarchy rule was shared between
the movers and the insights page. It was not: the rule had been left inline on
the occupations page and copied into `domain/occupation.ts` for insights. It is
shared now, and the movers output is byte-identical after the change.

## Not done here

- Keyboard and screen reader testing by hand. The script covers structure; how
  the map actually reads to a screen reader is a question only a person can
  answer.
- Touch target sizes are not measured. The controls are built to a 44px minimum
  by construction, and verifying that needs a rendering engine rather than
  markup.
- No alerting beyond a failed workflow run.
