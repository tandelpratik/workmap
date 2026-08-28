# Prompt 31 — Comprehensive QA

## Context

This is an actual production product. The initial environment is free/low-cost, but the implementation must be maintainable and commercially upgradable.

## Read first

- `CLAUDE.md`
- `01_PRODUCT_SPEC.md`
- `02_ARCHITECTURE.md`
- `03_DESIGN_SYSTEM.md`
- `04_DATA_STRATEGY.md`
- `05_HEATMAP_GEOSPATIAL_SPEC.md`
- `06_FREE_TIER_MVP.md`
- `07_COMMERCIAL_READINESS.md`
- all relevant previous milestone documentation

## Required workflow

Before changing code:
1. Inspect the repository.
2. Identify what already exists.
3. Identify affected files/modules.
4. State a short implementation plan.
5. Check for conflicts with existing architecture.

## Implementation objective

Create a complete test strategy and execute it. Cover unit, integration, API, database, ingestion, deduplication, geography, heatmap, search, skills, salary, SEO, accessibility and security-sensitive paths. Include malformed provider data, outages, retries, duplicates, missing values and boundary cases. Fix failures rather than suppressing them.

## Engineering requirements

- Keep source-specific code isolated.
- Preserve provenance.
- Validate external and user data.
- Avoid hard-coded business data.
- Do not fabricate missing values.
- Keep the design consistent with `03_DESIGN_SYSTEM.md`.
- Keep WorkMap branding configurable.
- Do not add paid infrastructure without evidence.
- Prefer explicit, testable modules.
- Handle loading, empty, error and unavailable states.

## Verification

After implementation:
- run formatter
- run lint
- run typecheck
- run relevant tests
- inspect the final diff
- update documentation
- report files changed and verification results

## Scope control

Do not implement the next milestone.
Do not silently redesign unrelated areas.
If a requirement is impossible or a source permission is unclear, stop that part and document the blocker rather than guessing.
