# Architecture

The consolidated technical view. Individual decisions and their trade-offs live
in the [architecture decision records](../adr/README.md); this document describes
the resulting system.

Binding rules come from `.claude/CLAUDE.md`. Where this document and the
constitution disagree, the constitution wins.

## Shape of the system

```text
  SOURCES            adapters translate, they do not decide
  ├── JSA IVI    ACTIVE ──▶ integrations/jsa       statistics, CC BY 4.0
  ├── ABS ASGS   ACTIVE ──▶ ingestion/geography    boundaries, CC BY 4.0
  ├── Adzuna     ACTIVE ──▶ integrations/adzuna    listings only, no aggregates
  ├── QLD        ACTIVE ──▶ integrations/smartjobs-qld   listings + aggregates
  └── Synthetic     DEV ──▶ no adapter built; the containment is real
                                  │
                                  ▼
                            ingestion/            validate ▸ map ▸ upsert
                                  │               idempotent, resumable
                                  ▼
                            CANONICAL DATA        db/ + domain/
                                  │
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
                          analytics/          geography/
                                  │                   │
              └───────────────────┼───────────────────┘
                                  ▼
                                api/               contracts + provenance
                                  ▼
                            app/ + components/     editorial + cartographic
```

## Module map

| Directory       | Responsibility                            | May import                   |
| --------------- | ----------------------------------------- | ---------------------------- |
| `app/`          | Routes, pages, layouts, route handlers    | components, api, config, lib |
| `components/`   | Presentation                              | lib, config, types           |
| `config/`       | Brand, feature flags, tunable thresholds  | types                        |
| `domain/`       | Entities, value objects, ports, rules     | types, lib                   |
| `db/`           | Prisma schema, repositories               | domain, types                |
| `integrations/` | Provider clients, DTOs, mappers           | domain, types, lib           |
| `ingestion/`    | Import orchestration, runs, quarantine    | domain, db, integrations     |
| `analytics/`    | Aggregation, data quality, source health  | domain, db, config           |
| `geography/`    | Registry, geometry manifest, projection   | domain, db                   |
| `skills/`       | Deterministic skill extraction from text  | domain                       |
| `lib/`          | Framework-neutral utilities               | types                        |
| `types/`        | Shared type declarations                  | nothing                      |
| `tests/`        | Unit, integration, contract tests         | anything                     |
| `scripts/`      | Offline build tasks (geometry, data prep) | anything                     |

`skills/` reads advertisement text and returns what it found, and depends on
`domain/` alone. It does not reach `db/`: the pass that writes its results is
`ingestion/extract-skills.ts`, which keeps the extractor testable without a
database and keeps persistence out of a module whose job is reading English.

Search lives in `db/repositories/job.ts` rather than in a module of its own. A
`search/` directory existed for a while describing full-text search with trigram
fallback and keyset pagination; none of it was built, the query is `ILIKE`
matching with offset paging, and an empty boundary claiming otherwise misled
about where search actually was. `salary/` was removed on evidence: nine of
2,713 listings state a salary.

The synthetic source has a descriptor, an environment flag and a repository
filter, and no adapter. The containment described below is real and enforced;
what it contains has never been built.

### The dependency rule

**Dependencies point inward.** `domain/` is the centre and imports no outer
module. In particular, `domain/` importing `integrations/` is forbidden and
enforced by lint (ADR-0001), not by convention.

`components/` never queries the database and never calls a provider. Data
reaches it through `app/` or `api/`.

## Data flow

1. **Fetch.** An adapter calls a provider, respecting rate limits, and returns
   raw records plus a cursor.
2. **Validate.** Zod parses each record. Failures are quarantined with the error;
   the run continues (ADR-0005, ADR-0008).
3. **Map.** A provider mapper produces canonical objects. Unavailable fields are
   marked unavailable, never invented.
4. **Persist.** Upsert on `(sourceKey, sourceId)`; `contentHash` skips unchanged
   records. Provenance is written with the record.
5. **Aggregate.** Scheduled refresh recomputes summary tables, recording sample
   size and basis (ADR-0004).
6. **Serve.** API returns values wrapped in provenance, with missingness explicit
   (ADR-0002).
7. **Render.** Loading, empty, error and unavailable are all implemented; every
   visualisation has an accessible equivalent.

## Where aggregation happens

In the database. Sums, distincts and per-group totals are expressed as SQL and
return the rows the page displays, rather than being assembled in the
application from broader queries (ADR-0004). The occupation totals were built
the other way once, and cost four sequential round trips and 8,550 rows to
produce 57 numbers; the measurement is in
[milestone 11a](../milestones/11a-query-performance.md).

Independent reads on one page run together rather than in sequence. Every
round trip is latency the reader waits through, and a page that needs three
unrelated answers should wait once.

## Retention

Labour market history is kept at the two most recent reference periods per
dataset, which is what the product displays: the latest month and its change on
the month before. The window is applied while importing rather than afterwards,
so a release costs thousands of writes rather than hundreds of thousands
followed by as many deletes, and it is read from the file rather than from the
clock, so a late or archived release keeps its own newest months. The published
workbook remains the record of everything outside the window. See ADR-0010.

This is the one place in the system that deletes rather than expires. Elsewhere
deleting would destroy the evidence that a record existed; here the evidence is
the publisher's own file.

## Three data lineages

The most important structural rule in the system. No two of these are ever
combined into one value.

|               | Official                                 | Derived                               | Synthetic                              |
| ------------- | ---------------------------------------- | ------------------------------------- | -------------------------------------- |
| Source        | JSA IVI and other published datasets     | Listings from an authorized provider  | Fixtures generated by this project     |
| Means         | An indicator of online advertised demand | A description of our own corpus       | Nothing. It is test input              |
| Storage       | `MarketObservation`                      | Summary tables from `JobListing`      | `JobListing` with `isSynthetic = true` |
| Label         | Named dataset and reference period       | Explicitly marked as platform-derived | Visibly marked development data        |
| In production | Yes, once verified                       | Yes, once a provider is active        | **Never.** Boot gate fails closed      |

JSA IVI is an online job-advertisement indicator. It is never presented as total
Australian vacancies. See ADR-0002 and ADR-0009.

## Source states and launch posture

Every source carries two independent values: a compliance status (are we
permitted?) and an activation state (is it turned on?). Production use requires
`ACTIVE` and `VERIFIED` together, decided by one predicate rather than at each
call site. See ADR-0009 and the
[source register](../compliance/SOURCE_REGISTER.md).

Adzuna was blocked at onboarding and is now `ACTIVE` and `VERIFIED`. Its terms
divide the product rather than open it:

- **Adzuna powers search and nothing else.** Its terms reserve aggregate use,
  so counts, averages and anything drawn on a map are barred without written
  consent. This is a third axis beyond compliance and activation: a source can
  be verified, active, and still barred from part of the product.
- **JSA IVI powers every published figure.** CC BY 4.0, aggregation permitted.
  The map reads it and no other source.
- **The bar is a gate, not a note.** `canPublishDerivedAggregates()` decides it
  once, `listRegionTotals` refuses any source that fails it, and an exact-list
  test fails if a later edit flips a flag.
- **Queensland Smart Jobs is verified, active and permits both.** It is the
  only live listing source found that permits republication and aggregation
  together, which is what made it worth crawling. Activated 2026-09-01, and
  744 listings are held; see [milestone 13b](../milestones/13b-smartjobs-activation.md).
  What the licence permits and what a figure means stay separate questions:
  these are Queensland Government vacancies, never the Queensland labour
  market.
- **The synthetic source stays out of production**, held there by five
  independent mechanisms.

Adding a provider is a configuration and verification exercise, not a redesign.
That is what ADR-0001 was for.

## Naming

- Domain and API vocabulary is generic: `Job`, `Company`, `Geography`,
  `/api/jobs`. The brand never appears in a technical identifier (ADR-0007).
- Provider names appear only inside `integrations/`, where they are correct.
- Database identifiers follow the same rule as domain types.

## Visual grammar

From the design constitution, and structural rather than decorative:

- **WHERE** is a map. **WHAT** is a matrix. **WHEN** is a trend.
- Editorial and cartographic: paper surfaces, ink text, thin rules, typography-led
  hierarchy, generous whitespace.
- The map is a primary interface, not a widget inside nested cards.
- Listings are editorial rows, not oversized cards.
- Explicitly excluded: AI gradients, glassmorphism, glowing cards, gradient text,
  sparkle iconography, generic dashboard card grids, oversized SaaS heroes.

## Accessibility

Not a later milestone, but a structural requirement:

- Every map state has an equivalent table (geography, value, change, rank).
- Meaning is never encoded by colour alone; state is also conveyed by text or
  pattern.
- Semantic headings, labelled controls, visible focus, keyboard operability.
- Legends state metric, units, scale, period and source.

## Scaling path

Each step happens only when a measurement justifies it (ADR-0004, ADR-0006).

```text
now       Next.js on Vercel + Neon Postgres + cron ingestion
  ↓       search latency or corpus size crosses recorded thresholds
next      read replica, materialised views, tuned indexes
  ↓       ingestion volume outgrows batched cron
then      dedicated worker process on a container host
  ↓       search capability genuinely absent
later     dedicated search engine
  ↓       traffic justifies the cost
finally   hosted observability, edge caching, additional providers
```

The domain model does not change at any step. That is the point of ADR-0001.

## Build order

Revised after the Adzuna blocker, following the implementation path in
`.claude/00_START_HERE.md`:

```text
JSA  ▸  geography  ▸  analytics  ▸  heatmap  ▸  occupation intelligence
     ▸  synthetic job development  ▸  future authorized job provider
```

Value now sits in the market-intelligence half of the product, which has an
active source. The job half is built against the adapter contract and waits for
authorized access.

## Current status

Ten surfaces, all rendered on the server, shipping neither a map library nor a
search runtime to the browser.

| Surface                               | Answers                                               |
| ------------------------------------- | ----------------------------------------------------- |
| `/`                                   | What is happening, and where the rest of this is      |
| `/map`                                | Where, as a picture, with a table of the same figures |
| `/locations`, `/locations/[state]`    | Where, as places with regions and occupations         |
| `/occupations`, `/occupations/[code]` | What, and which groups moved this month               |
| `/jobs`                               | The advertisements behind the figures                 |
| `/insights`                           | What each place advertises more of than the country   |
| `/compare`                            | Two places or two occupations, side by side           |
| `/explore`                            | Where should I look, for one kind of work             |
| `/methodology`                        | How every figure is made, and what it cannot say      |
| `/data-and-licensing`                 | Where each came from, generated from the registry     |
| `/api/datasets/[slug]`                | The derived figures as files, licence inside          |

Four commands answer the questions nobody was asking often enough: `data:check`
for integrity, `source:health` for whether the crawlers are running,
`a11y:check` for structure, and `jobs:redact` for contact details in the back
catalogue. Two workflows run them.

Each listing carries what its advertisement says about visa sponsorship, quoted
rather than characterised (milestone 17a), and where it is in its life, derived
from dates rather than stored (milestone 21). How the system reached this shape
is recorded in [milestones/](../milestones/).
