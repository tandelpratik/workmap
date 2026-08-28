# ADR-0003: Geospatial pipeline (registry in Postgres, geometry as artefact)

- **Status:** Accepted
- **Date:** 2026-08-28
- **Milestone:** 01 (Product & Architecture)

## Context

The heatmap is the flagship feature. It needs authoritative Australian
boundaries at two supported levels (State/Territory and SA4) with drilldown
between them, on a free tier, with small payloads and no fabricated geometry.

Australian statistical boundaries come from the ABS Australian Statistical
Geography Standard (ASGS). Full-resolution SA4 boundaries are far too large to
ship to a browser. JSA publishes IVI by state and by region; the platform must
never imply a finer level than a source actually supports.

## Decision

**Split geography into a registry (database) and geometry (static build
artefact). They are versioned together and joined by code, never by shape.**

### Registry: PostgreSQL

A `Geography` table holding identity and hierarchy only, no geometry:

| Column        | Purpose                                 |
| ------------- | --------------------------------------- |
| `code`        | Official identifier, e.g. ASGS SA4 code |
| `name`        | Official name                           |
| `level`       | `COUNTRY` \| `STATE` \| `SA4`           |
| `parentCode`  | Hierarchy link                          |
| `asgsEdition` | ASGS release the code belongs to        |
| `sourceKey`   | Provenance of the record                |

Boundary codes change between ASGS editions. Storing `asgsEdition` means a future
edition can be loaded alongside the current one rather than silently corrupting
historical series.

### Geometry: generated, static, tiered

A repeatable offline script (`scripts/build-geometry`) downloads the authoritative
ASGS release, simplifies it, and emits TopoJSON per level and tier:

- **Overview tier**: national view, aggressive simplification, all states plus
  SA4 outlines within a bounded budget.
- **Detail tier**: one file per state, finer simplification, loaded only on
  drilldown.

Outputs are committed as versioned static assets and served with long-lived
immutable cache headers. Raw downloads live in `/data/raw/` and are gitignored,
because they are reproducible rather than source.

Simplification preserves topology (shared borders stay shared, no slivers or
gaps). The artefact records the ASGS edition, simplification parameters and
source URL in a sidecar manifest, so any displayed boundary is traceable.

### PostGIS deferred

The MVP performs **no spatial queries**. Every join is `geography.code` to a
metric row. Point-in-polygon, radius search and spatial aggregation are not MVP
features, so PostGIS earns nothing yet.

Revisit when a feature genuinely needs geometry in the database. The likely
trigger is a query such as "jobs within 25 km of a point". Both Neon and the
alternatives support PostGIS, so this is reversible at low cost. Recording it
here so the deferral is a decision rather than an oversight.

### Integrity rules

- Never synthesise, approximate or hand-draw a boundary.
- Never relabel one administrative geography as another.
- A level a source does not publish is `NOT_COVERED`
  ([ADR-0002](0002-official-vs-derived-metrics.md)), not interpolated, not
  estimated from a parent.
- Simplified geometry is a _display_ generalisation and must be described as
  such; it is never presented as exact cadastral boundary.
- Suburb/city level is out of scope unless a source supports it directly.

### Accessibility

Every map state has an equivalent table: geography, value, change, and rank where
supported. The table is a first-class view, not a hidden fallback; it is the
only representation available to a screen-reader user and the only one that works
when geometry fails to load.

## Consequences

**Accepted costs**

- Updating boundaries means re-running a build script and committing artefacts.
- No ad-hoc spatial SQL until PostGIS is introduced.
- Two simplification tiers to keep in sync with the registry.

**Gained**

- Geometry is cached at the edge and costs no database time.
- Payloads stay small enough for a free tier and a mobile connection.
- Boundary provenance and edition are auditable.

## Open blocker

**ABS ASGS licensing must be verified before production.** ABS material is
generally published under Creative Commons Attribution, which would permit use
with attribution, but this has **not** been verified for the specific ASGS
boundary release, and it is recorded as `UNVERIFIED` in
[the source register](../compliance/SOURCE_REGISTER.md). Milestone 04 must
confirm the licence and required attribution wording before any boundary file is
committed or displayed.
