# ADR-0004: PostgreSQL-first search and analytics

- **Status:** Accepted
- **Date:** 2026-08-28
- **Milestone:** 01 (Product & Architecture)

## Context

The product needs keyword job search with filters, occupation and skill
aggregation, geographic rollups, and historical trends. The constitution forbids
introducing Redis, Elasticsearch/OpenSearch or paid queues without evidence that
they are required.

## Decision

**PostgreSQL does search, aggregation and caching support. Nothing else is added
until measurements justify it.**

### Search

- A generated `tsvector` column with a GIN index, weighted:
  title (A), company (B), skills (C), description (D).
- `pg_trgm` for fuzzy matching on occupation and company names, so a misspelled
  query still finds work.
- Filters (state, region, employment type, remote type, salary, freshness,
  source) as ordinary indexed predicates.
- Ranking combines `ts_rank_cd` with a freshness decay. Ranking weights live in
  configuration, not scattered through SQL.
- Keyset pagination, not `OFFSET`: deep offsets degrade badly and the UI never
  needs random page access.

### Analytics

- Aggregates are **precomputed on a schedule, never on request.** A user-facing
  request must not trigger a full-table scan.
- Summary tables per analytical grain, refreshed by the same run machinery as
  ingestion (ADR-0005):
  - occupation x geography x period
  - skill x occupation x period
  - skill x geography x period
  - salary distribution x occupation x geography x period
- Each summary row records `sampleSize` and its basis (ADR-0002). A statistic
  below a minimum sample threshold is `SUPPRESSED`, not shown with a caveat;
  the number itself is withheld. The threshold is configuration, and it matters
  most for salary, where a median over four listings is worse than no median.

### Caching

Three layers, none of them a new service:

1. Precomputed summary tables (the real cache).
2. Next.js data cache with explicit revalidation tags per dataset.
3. HTTP cache headers on static geometry and stable API responses.

### Revisit criteria

Written down now so the decision stays falsifiable rather than dogmatic.
Introduce a dedicated search engine or cache only when a measurement shows:

- p95 search latency above 400 ms after indexing and query tuning, **or**
- an active listing corpus beyond roughly 500,000 rows, **or**
- a genuinely absent capability: multilingual stemming, semantic ranking, or
  faceted counts too slow to precompute.

Until one of those is measured and recorded, the answer is no.

## Consequences

**Accepted costs**

- Relevance ranking is cruder than a purpose-built engine.
- Some analytics are minutes stale rather than live. Labour-market data moves
  daily at best, so this is honest rather than limiting.
- Refresh jobs must be scheduled and monitored.

**Gained**

- One datastore to operate, back up, and reason about.
- No recurring infrastructure cost.
- Transactional consistency between listings and the aggregates derived from
  them.

## Alternatives rejected

- **Elasticsearch/OpenSearch now.** Better search, plus a cluster to run, sync
  and pay for, at a corpus size where Postgres is not remotely stressed.
- **Redis for caching.** The expensive work is aggregation, which precomputed
  tables solve inside the database already.
- **Aggregating on request.** Simple until the first slow page, then a rewrite.
