# Architecture Decision Records

Each record captures one significant, hard-to-reverse decision: the context that
forced it, the decision itself, and the consequences accepted.

An ADR is immutable once accepted. If a decision changes, add a new record that
supersedes the old one and mark the old one `Superseded by ADR-XXXX`. Do not edit
history: the reasoning behind a past decision stays useful even when the
decision does not.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-provider-neutral-domain.md) | Provider-neutral domain with source adapters | Accepted |
| [0002](0002-official-vs-derived-metrics.md) | Strict separation of official and derived metrics | Accepted |
| [0003](0003-geospatial-pipeline.md) | Geospatial pipeline (registry in Postgres, geometry as artefact) | Accepted |
| [0004](0004-postgresql-first.md) | PostgreSQL-first search and analytics | Accepted |
| [0005](0005-idempotent-ingestion.md) | Idempotent, resumable batch ingestion | Accepted |
| [0006](0006-deployment-vercel-neon.md) | Deployment on Vercel with Neon PostgreSQL | Accepted |
| [0007](0007-brand-configuration.md) | Brand as configuration, never as namespace | Accepted |
| [0008](0008-validation-errors-observability.md) | Validation boundaries, error taxonomy and free-tier observability | Accepted |

## Status values

- **Proposed**: written, not yet agreed.
- **Accepted**: agreed and binding on implementation.
- **Superseded**: replaced by a later record, which must be named.

## Relationship to the constitution

`.claude/CLAUDE.md` is the constitution: it states non-negotiable rules.
These records explain *how* the implementation satisfies those rules, and record
the trade-offs chosen where the constitution left room. Where an ADR and the
constitution disagree, the constitution wins and the ADR is defective.
