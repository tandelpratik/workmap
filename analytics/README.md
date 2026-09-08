# Analytics

Aggregation and summary refresh.

Aggregates are precomputed on a schedule, never on request (ADR-0004). Reads
a view that excludes synthetic records, so a summary can never be computed
partly from fixtures (ADR-0009).

Also the read side of records the rest of the system writes and nothing used to
read: `quality.ts` checks the invariants the schema cannot express, and
`source-health.ts` answers whether each live source is still running. Both are
commands rather than pages. Run counts and error rates are operational facts
about this project rather than labour market information, and some sit close
enough to the aggregate figures the Adzuna terms reserve that publishing them
would be an argument nobody needs to have.
