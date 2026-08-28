# ADR-0002: Strict separation of official and derived metrics

- **Status:** Accepted
- **Date:** 2026-08-28
- **Milestone:** 01 (Product & Architecture)

## Context

The product shows two kinds of number that look identical in a chart and are not
remotely the same thing:

1. **Official indicators.** The JSA Internet Vacancy Index counts online job
   advertisements on a defined set of job boards, using a published methodology.
   It is an *indicator of advertised demand*, not a count of Australian
   vacancies. Many real vacancies never appear online at all.
2. **Platform-derived analytics.** Counts and rates computed from the listings
   this platform has indexed, for example "listings mentioning SQL". These
   describe *our corpus*, whose coverage is partial and provider-dependent.

Conflating them is the single largest credibility and legal risk in the product.
The constitution forbids describing IVI as total vacancies, and commercial
readiness forbids presenting derived analytics as government metrics.

## Decision

**The two lineages never merge. Every metric carries its basis, and the basis is
required at every layer: storage, API, and UI.**

### Separate storage

- `MarketObservation`: official values, one row per
  (source, dataset, geography, occupation, period, measure). Never written by
  anything except a market-data importer.
- Derived aggregates: computed from `JobListing` into clearly named summary
  tables (see [ADR-0004](0004-postgresql-first.md)). Never written into
  `MarketObservation`.

No query joins them into a single value. There is no sum, ratio or average that
mixes an official figure with a derived one. If a screen shows both, they are
separate series, separately labelled.

### Basis discriminator

Every metric leaving the domain carries:

```ts
type MetricBasis = 'OFFICIAL' | 'DERIVED';

interface MetricProvenance {
  basis: MetricBasis;
  sourceKey: string;          // "jsa-ivi"
  sourceDisplayName: string;  // "Jobs and Skills Australia"
  dataset: string;            // "Internet Vacancy Index"
  measure: string;            // "Online job advertisements"
  referencePeriod: string;    // "2026-07"
  retrievedAt: string;        // ISO timestamp of import
  methodologyUrl?: string;
  sourceVersion?: string;
}
```

`MetricProvenance` is not optional and has no default. A metric that cannot state
its provenance is a bug, and serialisation should fail rather than emit a bare
number.

### Explicit missingness

Missing data is modelled, never coerced. The constitution is explicit: never turn
missing into zero.

```ts
type MetricValue =
  | { state: 'PRESENT'; value: number }
  | { state: 'ZERO' }              // genuinely measured as zero
  | { state: 'UNAVAILABLE' }       // not yet imported / source gap
  | { state: 'SUPPRESSED' }        // withheld by the publisher
  | { state: 'NOT_COVERED' };      // outside the dataset's scope
```

`SUPPRESSED` and `NOT_COVERED` are distinct on purpose: the first means the
publisher had a value and withheld it, the second means the question does not
apply to that geography or occupation. Rendering must distinguish all five states
visually **and** in the accessible table, not by colour alone.

### Language rules

Enforced in copy, and testable:

| Never | Use instead |
| --- | --- |
| "Total vacancies" for IVI | "Online job advertisements (JSA IVI)" |
| "All jobs in Australia" | "Job advertisements indexed by <productName>" |
| "Jobs available" for derived counts | "Listings indexed, last 30 days" |
| Unlabelled mixed chart | Separate, individually attributed series |

Every visualisation must let a reader determine: what is measured, source,
reference period, geographic level, and whether it is official or derived. This
is a rendering requirement, not a tooltip nicety; it belongs in the accessible
table too.

## Consequences

**Accepted costs**

- Contracts are more verbose; a metric is an object, not a number.
- Some intuitively appealing combined visualisations are impossible by design.

**Gained**

- The product can never accidentally claim government authority for its own
  estimates.
- Provenance is available for attribution, caching and staleness decisions
  without a second lookup.
- Coverage limits become a visible product feature rather than a hidden flaw.

## Alternatives rejected

- **Provenance as a sibling metadata blob.** Drifts from the values it
  describes; a refactor eventually ships a number with the wrong source.
- **Provenance only at the API edge.** Too late; the mistake happens in the
  query that merged the two lineages, well before serialisation.
