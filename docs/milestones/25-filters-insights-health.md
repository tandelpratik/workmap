# Filters, specialisation, and finding out when a crawler stops

Three pieces: job search gains the filters the data supports, `/insights`
answers a question no other page does, and there is finally something that reads
back the ingestion records nobody has ever looked at.

The third found two live problems within a minute of existing.

## Filters, and the two that were not built

Job search had keyword, location and sponsorship. It now has employment type,
source and posting date as well, with every filter carried through paging from a
single definition — the sponsorship filter had already been dropped on page two
once, and hand-rolling a query string at each call site with six filters is that
bug waiting.

The more interesting half is what was left out. Each candidate was checked
against the corpus rather than against the schema:

| Filter           | Coverage       | Built |
| ---------------- | -------------- | ----- |
| Employment type  | 2,582 of 2,713 | Yes   |
| Source           | 2,713 of 2,713 | Yes   |
| Posted date      | 2,713 of 2,713 | Yes   |
| Remote or hybrid | **0 of 2,713** | No    |
| Salary           | **9 of 2,713** | No    |

`remoteType` is a column both adapters write `null` to. A remote filter would
have been present, plausible, and empty on every setting — telling a reader the
answer is "none" when the answer is "unknown". Salary is stated by nine listings;
a filter on it would hide 99.7% of the index and look broken doing it, and a
range filter would additionally have to reconcile hourly and yearly figures that
nothing normalises yet.

The source filter only appears when more than one source holds listings. A
control with one meaningful setting is furniture.

An unrecognised value widens the search rather than erroring, and is dropped from
the address, so `?type=banana` reports "In the index" rather than "Matching" and
does not survive to page two.

## What each place advertises more of

`/insights` deliberately does not digest the other pages. The rankings there
answer "which is biggest" and "which moved most", and both are dominated by size.

This asks what each state's advertising is _unlike_ the country's: the share of
its own advertising a group takes, divided by the share that group takes
nationally. Labour economists call it a location quotient; the page calls it
concentration and explains it, because the name is jargon and the idea is not.

The results are their own validation:

```text
Western Australia          Australian Capital Territory
  Science Professionals 2.12    ICT Professionals        3.83  (11.2% of ACT ads)
  Mining Labourers      2.08    Office Managers          1.53
  Plant Operators       2.06    Construction Managers    1.37
  Automotive Trades     1.90
```

A mining state advertising mining labour and plant operators at twice the
national proportion, and a capital territory devoting one advertisement in nine
to ICT. Neither was known to the code; both fell out of the arithmetic.

Four guards, because this measure invites four different wrong readings:

- **A high figure is not more jobs.** It is a statement about mix, and the
  advertisement count is printed beside every quotient so the two cannot be
  confused. A small state concentrating on one trade outranks a large state
  advertising many more of those roles, and that is the measure working.
- **Only leaf groups.** A parent is its children added up, so including both
  reports the same specialism twice at two grains. Same rule as the movers, now
  shared in `domain/occupation.ts` rather than written twice.
- **A floor of 100 advertisements.** Twelve advertisements against a one percent
  national share is a quotient of six that moves on one posting. Without the
  floor this page ranks the smallest samples in the country.
- **Only above 1.0.** A state whose most distinctive group still sits below the
  national proportion has no specialism, and printing its least under-represented
  group as one would invent a finding.

`concentration()` returns null rather than a number wherever the ratio would
mean nothing, including the case that matters most: an occupation nobody
advertises nationally would otherwise make every area infinitely specialised in
it.

## Something that reads the records back

Ingestion has written runs, cursors, counters and quarantined records since
milestone 05. Nothing had ever read them. Two crawlers run unattended, and the
first sign of either stopping would have been a reader noticing the listings had
gone stale.

`npm run source:health` answers, per source: when it last succeeded, when it last
failed, what it brought back, how much is quarantined, and how old the oldest
thing it holds is. It exits non-zero when anything needs attention, so it can run
on a schedule and speak only when there is something to say.

It is a command rather than a page. Run counts and error rates are operational
facts about this project rather than labour market information, and some sit
close enough to the aggregate figures the Adzuna terms reserve that publishing
them is an argument nobody needs to have.

### The false positive it started with

The first run reported Jobs and Skills Australia as **SILENT for 190 hours**.
True, and not a fault: it is a monthly workbook an operator downloads and
imports, and sitting still between releases is what it is supposed to do. A
monitor that reports a healthy source as broken every day but one a month is a
monitor everybody learns to ignore, which is worse than not having one — the
same failure the attribution check hit two milestones ago.

The expectation now comes from the registry's own `retrieval.method`. An API or a
crawl is scheduled and its silence is worth acting on; a file download is not,
and its age carries no verdict. Failures and unparseable records still count
against it, because those are faults whenever the run happened.

### Two real findings

Both stand, and neither is fixable from here:

1. **Adzuna has not had a successful run in 240 hours.** The Vercel cron is
   `0 19 * * *` and the last success was 30 August, which also wrote 0 of 50
   records seen. Worth checking whether `OPERATIONS_SECRET` is set in the
   deployment, since the endpoint fails closed without it.
2. **Queensland has one unparseable record in the last 48 hours** and an
   abandoned run recorded before its last success. One record is not an
   emergency; it is the shape a portal changing its markup makes on the way in.

## Files

| Path                                | Change                                    |
| ----------------------------------- | ----------------------------------------- |
| `components/job-search-form.tsx`    | Three new filters, and why two were not   |
| `app/jobs/page.tsx`                 | Bounded parsing, one address builder      |
| `db/repositories/job.ts`            | Source and posted-within, indexed sources |
| `domain/occupation.ts`              | New. Hierarchy rule and concentration     |
| `app/insights/page.tsx`             | New                                       |
| `analytics/source-health.ts`        | New                                       |
| `scripts/check-source-health.ts`    | New. `npm run source:health`              |
| `components/layout/masthead.tsx`    | Insights in the rail                      |
| `components/layout/site-footer.tsx` | Insights in the footer                    |

## Checks

`npm run check` clean: Prettier, ESLint, TypeScript, 518 tests (from 489).
`npm run build` succeeds. `npm run data:check` passes 16 of 16. Filters, paging,
invalid values and the insights output all verified against the live database,
and the ACT quotient reproduced by hand in a test.

## Not done here

- `/compare`. Two places or two occupations side by side is a real gap and a
  bigger one than it looks: the interesting comparison is of mix, which is what
  `/insights` now computes, so the two should be designed together.
- Nothing alerts on the health check. It exits non-zero; wiring that to a
  schedule and a notification is a deployment change rather than a code one.
- Adzuna's silence is reported, not fixed.
