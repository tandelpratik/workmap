# Documentation

## Governing documents

The product constitution and milestone specifications live in `.claude/`:

- `.claude/CLAUDE.md`: the constitution. Binding, and it overrides everything here.
- `.claude/01_PRODUCT_SPEC.md` through
  `.claude/07_COMMERCIAL_READINESS.md`: specifications.
- `.claude/prompts/`: the 35 sequenced milestones.

## Engineering documentation

| Document                                                                           | Purpose                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)                       | Consolidated technical view: modules, boundaries, data flow                          |
| [adr/README.md](adr/README.md)                                                     | Architecture decision records and their status                                       |
| [compliance/SOURCE_REGISTER.md](compliance/SOURCE_REGISTER.md)                     | Per-source compliance status, and what each licence permits                          |
| [compliance/DIRECT_SOURCE_FEASIBILITY.md](compliance/DIRECT_SOURCE_FEASIBILITY.md) | Direct employer and government sources: measured access, and what their terms permit |
| [milestones/](milestones/)                                                         | One record per completed milestone                                                   |
| [BACKLOG.md](BACKLOG.md)                                                           | Deferred work, what each item waits on, and what it blocks in turn                   |

## Reading order for a new contributor

1. `.claude/CLAUDE.md`: the rules.
2. [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md): the system.
3. [adr/README.md](adr/README.md): why it is that way.
4. [compliance/SOURCE_REGISTER.md](compliance/SOURCE_REGISTER.md): what may
   and may not be done with each data source.

## Project status

Ten reader-facing surfaces, all rendered on the server.

**Map** draws online job advertisements by region from the July 2026 JSA IVI
release: 50 areas, the eight capitals at GCCSA and the rest of the country at
SA4, with a table of the same figures beside it. It drills into a state from a
finer boundary tier, filters by occupation, and keeps every selection in the
URL, so a view is shareable and needs no JavaScript.

**Locations** gives each state a page rather than another map: its figure and how
it moved, its share of the country, the occupations advertised in it, and the
regions inside it carrying the publisher's own figures.

**Occupations** ranks the 57 groups, filters them, shows the month's largest
movements among the finest groups the release carries, and gives each group a
page with its regional and state breakdown.

**Jobs** searches ingested advertisements from Adzuna and Queensland Smart Jobs,
each carrying what it says about visa sponsorship, quoted rather than
characterised, and where it is in its life. Filters cover keyword, location,
employment type, source, posting date and sponsorship, and each one exists
because the stored data supports it.

**Insights** answers what each place advertises more of than the country does.
**Compare** puts two places or two occupations side by side and spends its space
on how their mixes differ rather than on which is larger. **Explore** answers the
question the product is named for: pick a kind of work and see where it is
advertised, and where it is unusually concentrated.

**Methodology** sets out how every figure is made and what it cannot say.
**Data and licensing** is generated from the source registry, so it cannot
describe a permission the software does not hold. Both derived datasets are
downloadable as CSV or JSON with the licence written inside the file.

Every listing is also read for the skills it names, deterministically and
against a measured vocabulary: 403 of 2,713 listings carry at least one, mostly
the credential a role requires
([milestone 26](milestones/26-skill-extraction.md)). A listing that named one
says so, quoting the advertisement's own words, and job search can be narrowed
to it from the page and from `/api/jobs`
([milestone 27](milestones/27-skill-surface.md)). No count of skills is
published: showing what one advertisement says is not an aggregate, and an
aggregate is what the Adzuna licence reserves.

### Held back

Labour market history is retained at two reference periods
([ADR-0010](adr/0010-labour-market-retention-window.md)), so the product shows a
month and its change on the month before and calls it a comparison rather than a
trend. Widening that window and re-importing is what history and trend begin
with.

Resolving occupation codes to a classification is blocked on an open licence
question, ANZSCO against OSCA, recorded in the source register. Until it
resolves, listings are not mapped to occupation codes and nothing pretends
otherwise.

The site is not indexed, and the remaining legal pages are unwritten, both
waiting on brand identity. See [BACKLOG.md](BACKLOG.md) for what each item is
blocked on.

**Source position:** Adzuna carries job listings and is verified for exactly
that. Its terms bar publishing aggregate figures without written consent, so
counts, averages, the map and every download stay on JSA IVI, which is CC BY 4.0.
Queensland Smart Jobs is the one listing source licensed for both republication
and aggregation, though its listings are Queensland Government vacancies and
never a picture of the Queensland labour market. ABS ASGS supplies geography. A
development-only synthetic source exists for the pipeline and can never run in
production. See
[ADR-0009](adr/0009-source-activation-and-synthetic-containment.md) and the
[source register](compliance/SOURCE_REGISTER.md).

**Launch blocker:** `public/adzuna-logo.png` must be added by hand before the
site is public. Adzuna's terms require their logo in the attribution and their
site blocks automated download.
