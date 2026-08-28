# Analytics

Aggregation and summary refresh.

Aggregates are precomputed on a schedule, never on request (ADR-0004). Reads
a view that excludes synthetic records, so a summary can never be computed
partly from fixtures (ADR-0009).
