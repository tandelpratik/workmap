# WorkMap — Production Claude Code Plan

This package is for an **actual product**, not a learning project.

WorkMap is the current working product name. It must be treated as replaceable branding from day one.

## Mission

Build a commercially viable Australian Job Intelligence Platform that combines:
- permitted individual job listings
- Australian labour-market intelligence
- geographic heatmaps
- occupation intelligence
- skill intelligence
- salary insights
- historical trends
- high-quality job discovery

## Execution

Read `CLAUDE.md` first.

Then read:
- `01_PRODUCT_SPEC.md`
- `02_ARCHITECTURE.md`
- `03_DESIGN_SYSTEM.md`
- `04_DATA_STRATEGY.md`
- `05_HEATMAP_GEOSPATIAL_SPEC.md`
- `06_FREE_TIER_MVP.md`
- `07_COMMERCIAL_READINESS.md`

Execute `prompts/01` through `prompts/35` sequentially.

Every prompt is a self-contained Claude Code specification. Claude must inspect the current repository before changing it and must not assume a clean repository.

## Critical distinction

The free-tier MVP is a **commercial product prototype**, not a toy or tutorial.

The architecture must be capable of moving from low-volume/free-tier operation to licensed, higher-volume production without rewriting the domain model.

## Working brand

WorkMap
See where the work is.

The name may change later. Do not couple the technical architecture to it.
