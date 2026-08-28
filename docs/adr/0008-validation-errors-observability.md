# ADR-0008: Validation boundaries, error taxonomy and free-tier observability

- **Status:** Accepted
- **Date:** 2026-08-28
- **Milestone:** 01 (Product & Architecture)

## Context

The constitution requires validating external data and all inputs, treating
third-party content as untrusted, never logging secrets, and handling loading,
empty, error and unavailable states. It also forbids adding paid infrastructure
without evidence, which rules out a commercial APM for the MVP.

Two distinct problems: keeping bad data out, and knowing what happened when
something goes wrong, without a paid observability stack.

## Decision

### Validation at every trust boundary

Zod schemas guard four boundaries. Data that has not crossed one is untrusted.

1. **Environment**: validated once at startup; the process refuses to start on a
   missing or malformed variable.
2. **Provider responses**: every external response parsed before it becomes a
   domain object. A provider changing its schema produces a quarantined record
   (ADR-0005), not a corrupted row.
3. **Request inputs**: every route handler parses params, query and body.
   Filters, pagination and sort keys are allow-listed; a rejected input returns a
   structured error rather than reaching a query.
4. **Admin actions**: authorised and validated, and never reachable without an
   explicit credential check.

### Third-party content is untrusted output, too

Job descriptions are attacker-controlled text from the perspective of this
application.

- HTML from a provider is sanitised through an allow-list before rendering.
  React escaping alone is not sufficient once HTML is intentionally rendered.
- Outbound application links get `rel="noopener noreferrer nofollow"` and are
  restricted to `http`/`https`.
- Provider-supplied URLs and image sources are validated before use.

### Error taxonomy

Two categories, treated differently:

- **Expected failures**: source unavailable, rate limited, not found, invalid
  input, insufficient sample. Modelled as values in a `Result` type, mapped to
  specific UI states. These are part of the product, not exceptions.
- **Programmer errors**: broken invariants. Thrown, logged with context, and
  surfaced as a generic failure. Never leaked to the client in detail.

Client-facing errors carry a stable machine-readable `code`, a safe message, and
a correlation id. Stack traces, SQL and provider payloads never cross the
boundary.

The distinction matters at the UI: "no results for this filter", "this region is
not covered by the dataset", and "the market data service is unavailable" are
three different screens, and collapsing them into one generic error is a product
failure as well as an engineering one.

### Required UI states

Every data-backed view implements: loading, empty, error, and **unavailable**.
The fourth is distinct; it means the data does not exist for this selection
(ADR-0002), and it must never be rendered as a zero or an empty chart.

### Logging and redaction

- Structured JSON logs, one event per line, with a correlation id.
- A redaction allow-list applied at the logger: credentials, tokens, connection
  strings and full provider payloads never reach output. Redaction is enforced by
  the logger itself, not by the discipline of each caller.
- No personal data logged beyond what is operationally necessary.

### Observability without paid tooling

- **`/api/health`**: build identifier, database reachability, and last
  successful import per source. No secrets, no internal detail.
- **Import runs as telemetry**: `ImportRun` rows already record counts,
  duration, cursor and quarantine rate. Ingestion health is therefore queryable
  history, not a log grep.
- **`SystemEvent` table**: significant operational events (schema drift,
  threshold breach, migration applied) retained with bounded retention.
- **Platform logs** for request-level detail.

This is deliberately modest. The upgrade path is to ship the same structured
events to a hosted backend when volume justifies the cost.

## Consequences

**Accepted costs**

- Schema definitions to maintain alongside types.
- Parsing overhead on every boundary crossing.
- Observability is pull-based; there is no alerting until one is added.

**Gained**

- A provider schema change is detected and contained, not silently absorbed.
- Untrusted content cannot reach the DOM unsanitised.
- Incidents can be reconstructed from data with no paid tooling.

## Alternatives rejected

- **Trust provider responses, validate only user input.** External sources are
  the _more_ likely source of malformed data, and they change without notice.
- **TypeScript types as validation.** Types vanish at runtime and assert nothing
  about a JSON response.
- **A hosted APM now.** Recurring cost before there is traffic to observe.
