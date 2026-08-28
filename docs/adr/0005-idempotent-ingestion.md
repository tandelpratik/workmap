# ADR-0005: Idempotent, resumable batch ingestion

- **Status:** Accepted
- **Date:** 2026-08-28
- **Milestone:** 01 (Product & Architecture)

## Context

The constitution requires the ingestion system to be idempotent. Deployment is on
Vercel (ADR-0006), where work runs in serverless functions with a bounded
execution time and no long-running worker. Sources impose rate limits that must
be respected rather than worked around.

A full import must therefore survive being cut off mid-way, retried, or run
twice concurrently, without duplicating or corrupting data.

## Decision

**Ingestion is a sequence of bounded, resumable batches recorded as explicit
runs, with per-record idempotency keys.**

### Runs are first-class

```ts
interface ImportRun {
  id: string;
  sourceKey: string;
  dataset: string;
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
  cursor: string | null;      // resume point, source-defined
  recordsSeen: number;
  recordsWritten: number;
  recordsSkipped: number;
  recordsQuarantined: number;
  startedAt: Date;
  finishedAt: Date | null;
  error: string | null;       // redacted; never contains credentials
}
```

An invocation claims a run, processes one bounded batch, persists the cursor and
counters, and returns. The next invocation resumes from the cursor. A run is
complete only when the source reports exhaustion.

Concurrent execution is prevented by a conditional status transition: PENDING to
RUNNING succeeds for exactly one caller, so an overlapping cron firing becomes a
no-op rather than a double import.

### Idempotency key

Every record upserts on `(sourceKey, sourceId)`. There are no blind inserts.

A `contentHash` over the normalised payload lets an unchanged record skip the
write entirely and update only `lastSeenAt`. Re-running the previous day import
is therefore cheap and safe, an important property both for correctness and for
staying inside free-tier limits.

### Freshness lifecycle

Listings are tracked, not merely inserted:

- `sourcePostedAt`: as reported by the source.
- `firstSeenAt`: first import that observed it.
- `lastSeenAt`: most recent import that observed it.
- `expiredAt`: set when the source stops returning it or its expiry passes.

Records disappear from search when expired; they are not deleted, because
history is what makes trends possible.

### Failure isolation

A record failing validation is **quarantined**, not dropped and not allowed to
abort the run: the raw payload and the validation error are stored for
inspection, the counter increments, and the run continues.

A run whose quarantine rate exceeds a configured threshold fails loudly. That
pattern means the source schema changed, and silently importing 40% of a dataset
is worse than importing none of it.

### Scheduling

- Vercel Cron triggers ingestion endpoints on a schedule sized to the rate limits
  and publication cadence of each source. JSA IVI publishes monthly; polling it
  hourly would be pointless load on a public service.
- A manual trigger exists for operations, protected by a shared secret in a
  header and never exposed to the browser.
- Rate limits are respected by design: bounded batch size, delay between
  requests, and honouring `Retry-After`. Backoff on 429 and 5xx is exponential
  with jitter. Rate limits are never circumvented.

## Consequences

**Accepted costs**

- More schema and orchestration than a single import script.
- Import completion is eventual across several invocations.

**Gained**

- Safe retry, safe redeploy mid-import, safe overlapping schedule.
- Works unchanged on a long-running worker later, because batching is not
  Vercel-specific, so ADR-0006 can be revisited without touching ingestion.
- Import health is observable from data rather than from logs.

## Alternatives rejected

- **One long-running import.** Cannot complete inside a serverless limit, and
  restarts from zero on any failure.
- **Truncate and reload.** Destroys `firstSeenAt` history and the trend data that
  depends on it, and is not idempotent in any useful sense.
- **A queue service.** Recurring cost for a problem a cursor column solves at
  this volume.
