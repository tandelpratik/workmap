# ADR-0001: Provider-neutral domain with source adapters

- **Status:** Accepted
- **Date:** 2026-08-28
- **Milestone:** 01 (Product & Architecture)
- **Amended by:** [ADR-0009](0009-source-activation-and-synthetic-containment.md)

## Context

The platform draws on structurally different data sources:

- **Individual job listings**: Adzuna initially, licensed feeds and permitted
  employer feeds later.
- **Labour-market intelligence**: Jobs and Skills Australia Internet Vacancy
  Index initially, further public or licensed datasets later.

These sources disagree on almost everything: field names, geography identifiers,
occupation coding, salary representation, update cadence, and what a "record"
even is. They also differ in licensing, which can change independently of the code.

The constitution requires that provider-specific code lives under `/integrations`
and that domain logic must not depend on provider-specific types. The commercial
plan requires swapping or adding a provider without rewriting the domain model.

## Decision

**The domain defines the contracts. Providers implement them. Dependencies point
inward, never outward.**

### Layering

```text
presentation  ──▶ api ──▶ domain ◀── ingestion ◀── integrations
                            │
                            ▼
                       persistence
```

- `domain/`: canonical entities, value objects, ports (interfaces) and rules.
  Depends on nothing but `types/` and `lib/`. **Never imports `integrations/`.**
- `integrations/<provider>/`: HTTP clients, provider DTOs, and mappers that
  translate DTOs into canonical domain objects. Imports `domain/` contracts.
- `ingestion/` orchestrates: fetch through an adapter, validate, map, persist.
- `persistence/` (`db/`): Prisma schema and repositories returning domain types.
- `analytics/`, `search/`, `geography/`, `skills/`, `salary/`: services over
  canonical data only.

### Ports

The domain owns narrow interfaces; each provider supplies an implementation:

```ts
interface JobSourceAdapter {
  readonly descriptor: SourceDescriptor;
  fetchPage(request: JobFetchRequest): Promise<SourcePage<RawJobRecord>>;
}

interface MarketDataSource {
  readonly descriptor: SourceDescriptor;
  listAvailablePeriods(): Promise<ReferencePeriod[]>;
  fetchPeriod(period: ReferencePeriod): Promise<SourcePage<RawMarketRecord>>;
}
```

Names are generic, per the constitution: `JobSourceAdapter`, not
`WorkMapJobSourceAdapter`; `Job`, not `WorkMapJob`.

### Source descriptors

Every adapter declares itself, and that declaration is data the system can act on:

```ts
interface SourceDescriptor {
  key: string; // stable identifier, e.g. "adzuna", "jsa-ivi"
  displayName: string; // for attribution in the UI
  kind: 'JOB_LISTING' | 'MARKET_INDICATOR' | 'GEOGRAPHY' | 'CLASSIFICATION';
  attributionRequired: boolean;
  complianceStatus: 'VERIFIED' | 'UNVERIFIED' | 'RESTRICTED';
  rateLimit?: { requests: number; perSeconds: number };
}
```

`complianceStatus` is deliberately part of the contract rather than a comment.
An adapter whose status is not `VERIFIED` must not run in production; see
[the source register](../compliance/SOURCE_REGISTER.md).

### Mapping rule

Provider DTOs stop at the adapter boundary. A mapper converts DTO to canonical
type, and mapping is total and explicit: every canonical field is either mapped
from source data, or explicitly marked unavailable. A field the source does not
supply is never invented and never defaulted to a plausible-looking value.

## Consequences

**Accepted costs**

- A mapping layer per provider, and a second set of types to maintain.
- Adding a field visible in the UI can touch DTO, mapper, domain type, schema
  and query, which is more edits than a pass-through design.

**Gained**

- A provider can be added or removed without the domain, analytics, search or UI
  knowing.
- Compliance status is enforceable in code, not tribal knowledge.
- Provider outages and schema changes are contained inside one directory.

**Enforcement**

Import boundaries are checked by lint rule, not convention: a
`no-restricted-imports` configuration forbidding `domain/**` from importing
`integrations/**`. This is set up in milestone 02 and must fail the build.

## Alternatives rejected

- **Provider types straight through to the UI.** Fastest to build, and the
  reason most aggregators cannot change supplier without a rewrite. Rejected
  outright by the constitution.
- **One permissive "any source" schema.** Loses provenance and field-level
  semantics, which are the product's actual differentiator.
