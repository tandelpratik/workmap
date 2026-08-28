# ADR-0009: Source activation states and synthetic data containment

- **Status:** Accepted
- **Date:** 2026-08-28
- **Milestone:** 01 (Product & Architecture), revision
- **Amends:** ADR-0001, ADR-0002

## Context

Adzuna onboarding is blocked. The available onboarding path requires
organization and website details that do not exist yet, and inventing them is
forbidden. The constitution was updated accordingly: JSA is the active MVP
source, Adzuna is pending, and a `SyntheticJobSource` exists for development
only.

Three consequences follow, and each breaks an assumption made in milestone 01.

1. **The product launches without individual job listings.** ADR-0002 assumed
   two lineages, official and platform-derived. At launch the derived lineage
   will be empty, because there are no authorized listings to derive from.
2. **Development still needs records.** Ingestion, normalization, deduplication,
   skills and salary cannot be built or tested against nothing.
3. **Synthetic job records will exist in the codebase.** The constitution
   forbids fabricating job listings, salary and skills.

Point 3 is the whole risk. A synthetic fixture is legitimate as a test input and
becomes a fabricated job advertisement the moment it reaches a real user. The
reconciliation is that synthetic records are a fixture, never a source, and that
separation has to be structural rather than a matter of care.

## Decision

### Part 1: Two independent gates per source

ADR-0001 gave every source a `complianceStatus`. That answers "are we permitted
to use this?". It does not answer "is this turned on?", and Adzuna now sits in a
state where the answer to the second question is no, for a reason unrelated to
the first.

```ts
type SourceActivation =
  | 'ACTIVE'             // authorized, configured, may run in production
  | 'PENDING'            // adapter exists, access not yet obtained
  | 'BLOCKED'            // access attempt stopped by an unmet requirement
  | 'DEVELOPMENT_ONLY';  // must never run in production
```

The descriptor from ADR-0001 gains `activation` alongside `complianceStatus`,
and production eligibility becomes a single predicate that both axes must
satisfy:

```ts
function isProductionEligible(d: SourceDescriptor): boolean {
  return d.activation === 'ACTIVE' && d.complianceStatus === 'VERIFIED';
}
```

No call site evaluates this itself. A source is eligible or it is not, and the
answer comes from one function.

| Source | Activation | Compliance | Production eligible |
| --- | --- | --- | --- |
| `jsa-ivi` | ACTIVE | UNVERIFIED | No, pending licence verification |
| `adzuna` | BLOCKED | UNVERIFIED | No |
| `synthetic` | DEVELOPMENT_ONLY | Not applicable | Never |

### Part 2: Synthetic containment in five layers

Each layer catches a different failure. No single one is trusted.

**1. Boot gate, failing closed.** An explicit `APP_ENV` of `development`,
`preview` or `production` is validated at startup with the rest of the
environment (ADR-0008). If `APP_ENV` is `production` and synthetic sources are
enabled, the process refuses to start. It does not warn and continue. A
misconfigured deployment must not boot at all, because a running server that
serves invented job advertisements is the worse outcome.

Preview deployments may enable synthetic data so the UI can be reviewed, on two
conditions: the pages carry the development label described below, and they are
served `noindex` so that nothing synthetic reaches a search engine.

**2. Marking in the row itself.** `JobListing.isSynthetic` is
`NOT NULL DEFAULT false`, and synthetic records carry `sourceKey = 'synthetic'`
plus the fixture version that produced them. The default is the safe value, so a
record written by any path that forgets the field is treated as real. That is
the direction which fails safely, because the record in question came from a
real provider.

**3. Queries that exclude by default.** The repository job query filters
`isSynthetic = false` unconditionally. Reading synthetic records requires a
separately named function that asserts the boot gate before it runs. Leaking
synthetic data is therefore not something a developer can do by omission; it
requires calling a differently named function on purpose.

**4. Aggregation over a filtered view.** Analytics read from a database view
that excludes synthetic rows, rather than from the table directly. Summary
tables (ADR-0004) can then never hold a value computed partly from fixtures,
which would be the hardest leak to detect because the output is a number rather
than a visible listing.

**5. A contract test per public surface.** Tests seed synthetic records, call
every public route, and assert that none come back. This covers search, job
detail, market pages, sitemap and structured data. The test exists because the
other four layers are all things a future change could quietly undo.

### Part 3: A third metric lineage

ADR-0002 defined `MetricBasis` as `OFFICIAL | DERIVED`. It gains a third value:

```ts
type MetricBasis = 'OFFICIAL' | 'DERIVED' | 'SYNTHETIC';
```

`SYNTHETIC` exists so that a derived figure computed from fixtures during
development is labelled honestly on screen, instead of looking like a real
platform metric. In production the value is unreachable, because the boot gate
prevents synthetic records from existing there at all.

Synthetic data never contributes to a metric of any other basis. There is no
blend.

### Part 4: Unavailable is not empty

When no job source is production eligible, the job surfaces return an explicit
unavailable state. They do not return zero results.

The distinction is a product requirement rather than a nicety. Empty means the
query ran and matched nothing. Unavailable means the product cannot answer the
question yet. Rendering the second as the first tells a user there are no jobs
in Australia matching their search, which is false. This maps onto the
unavailable UI state already required by ADR-0008 and the missingness states in
ADR-0002.

Market intelligence from JSA continues to work normally while this is true. The
site is a functioning labour-market atlas without a job board.

### Part 5: Naming

`SyntheticJobSource` implements `JobSourceAdapter` like any other provider, so
the pipeline it exercises is the real one. It carries its own `sourceKey` and
never borrows one belonging to a real provider. Synthetic records are never
labelled Adzuna, JSA, or any real organization, in the database or on screen.

## Consequences

**Accepted costs**

- Two axes to reason about per source instead of one.
- A view and a partial index to maintain for analytics.
- Synthetic fixtures must be maintained as the schema evolves, or they rot and
  stop exercising the pipeline honestly.

**Gained**

- The full ingestion pipeline can be built and tested now, against the real
  adapter contract, with no authorized provider available.
- Adzuna can be activated later by verifying terms and changing configuration,
  with no code path invented for it at that point.
- Fabricated records reaching production requires defeating five independent
  mechanisms, one of which stops the server from starting.
- The product has an honest posture for launch rather than a padded one.

## Alternatives rejected

- **Wait for Adzuna before building the job pipeline.** Blocks a large part of
  the product on a dependency with no timeline, and leaves the adapter contract
  untested until the day it matters most.
- **A boolean flag plus careful review.** Relies on every future contributor
  remembering. The failure mode is publishing invented job advertisements, which
  is too severe to defend with discipline alone.
- **Seed the database with listings taken from elsewhere.** Forbidden by the
  constitution, and the reason the synthetic source exists at all.
- **Show an empty job board.** Misrepresents the Australian labour market as
  having no vacancies. Unavailable is the truthful state.
