# The occupation half catches up

Locations got a place to stand at milestone 22. Occupations had a flat list of
fifty-seven rows and a detail page that answered one question. This closes the
asymmetry: the occupations index gains a filter and the month's largest
movements, and an occupation page gains a state rollup and a route into the
advertisements.

## Largest movements, and the tautology avoided

The two reference periods held support exactly one insight that was not being
shown: which groups moved, and by how much. It is now at the head of
`/occupations`, in both directions, because a page showing only the risers tells
half a story and omits the half a reader planning a move most needs.

The first version was useless, and usefully so. Ranked by absolute change across
every group, it read:

```text
PROFESSIONALS (2)                        +1,748
TECHNICIANS AND TRADES WORKERS (3)       +1,423
COMMUNITY AND PERSONAL SERVICE (4)         +993
CLERICAL AND ADMINISTRATIVE (5)            +888
MANAGERS (1)                               +824
```

Which is to say: the biggest groups moved the most. That is nearly a tautology,
and worse, it puts a whole beside its own parts — `PROFESSIONALS` is the sum of
the finer groups numbered `2x`, so its movement is their movements added up and
reporting both is double-counting the same shift.

Restricted to the finest groups the release carries, the same table says
something:

```text
Sales Assistants and Salespersons (62)     +453   +4.8%
Legal, Social and Welfare Professionals    +427   +5.2%
Hospitality Workers (43)                   +416  +14.6%
Automotive and Engineering Trades (32)     +384   +4.5%
General-Inquiry Clerks, Call Centre (5B)   +346   +2.7%
```

Hospitality moving 14.6% in a month is a fact about the labour market. The
earlier table was a fact about arithmetic.

A group whose code is a prefix of another published code is a parent and is left
out. The rule reads the release rather than assuming a code length, which keeps
it correct if the publisher adds a finer tier, and it handles the alphanumeric
codes the publisher actually uses: `5` is a prefix of `5B`.

Percentages are suppressed below a floor of 200 advertisements in the earlier
month. A group advertising 40 roles that advertises 52 has moved 30%, and
printing that beside a national group's 3% invites a reader to conclude the small
one is the story. The absolute change is still shown, because it is still a fact.

Only one group fell in July 2026, so "Decreased most" has a single row. That is
the month, not a bug, and a table with one row says so more honestly than a
table padded to five.

## Finding one group among fifty-seven

A plain GET filter, no client JavaScript, query in the URL. It narrows what is
listed and never what is measured: the headline figure and the movers describe
the whole release either way.

The empty state matters more than the populated one. A term matching nothing
gets told that every group is on the page already, so this is a mistyped term
rather than a part of the market with no advertisements. Those are very
different findings and a bare "no results" implies the second.

## An occupation, by state

The fifty-row regional table answers _where precisely_. The state rollup added
above it answers _where broadly_, which is the question most readers arrive with,
and it links to the location pages so the two halves of the product finally point
at each other in both directions.

### The cross-check that matters

A state's figure for one occupation is now computed two different ways, on two
different pages:

- a **location** page runs the state-scoped aggregate in SQL;
- an **occupation** page reads every region and sums those inside each state in
  the application.

A reader will see both. If they ever diverge, one page is wrong and neither would
look wrong, which is the worst shape a data bug can take. They agree:

```text
Education Professionals (24)     occupation page   location page
New South Wales                            812            812
Queensland                                 741            741
Victoria                                   719            719
Western Australia                          238            238
                              ... eight states summing to 2,753,
                              which is the group's national total
```

A database test now asserts this across a sample of groups, and asserts that both
routes agree with the national figure so neither can be consistently wrong in the
same direction. It reads each state once rather than once per occupation: the
first version made 44 round trips and timed out without making the property any
truer.

## The link that is not a mapping

An occupation page now offers a route into the advertisements. It is a **keyword
search**, and the label says so twice.

Listings carry no occupation classification. Mapping them is blocked on an open
licence question, and an unmapped listing stays unmapped rather than being
guessed into a plausible code. Presenting a text search as "advertisements in
this occupation group" would be exactly that guess, dressed as a feature. So the
link reads "search advertisements for these words", with "a keyword search, not a
classification" under it.

The alternative was no link at all. This is more useful and still true.

## Files

| Path                                    | Change                          |
| --------------------------------------- | ------------------------------- |
| `app/occupations/page.tsx`              | Movers, filter, empty state     |
| `app/occupations/[code]/page.tsx`       | State rollup, keyword route     |
| `components/occupation-search-form.tsx` | New. GET filter, no JavaScript  |
| `tests/database.test.ts`                | The two aggregation paths agree |

## Checks

`npm run check` clean: Prettier, ESLint, TypeScript, 489 tests. `npm run build`
succeeds. `npm run data:check` passes 16 of 16. Movers, filter, empty state and
the state rollup all verified against the live database, and the cross-path
figures compared by hand before the test was written.

## Not done here

- No trends. Two reference periods support a movement on one month, and that is
  what is shown and what it is called.
- Occupation hierarchy is not drawn as a tree. The prefix relationship is used
  to pick the movers and is not yet shown to a reader, who currently sees a flat
  ranking with a note that the groups overlap.
- Listings are still not mapped to occupations, and will not be until the
  classification licence question resolves.
