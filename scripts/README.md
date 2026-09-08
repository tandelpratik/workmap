# Scripts

Offline build and maintenance tasks. These run on a developer machine or in CI,
never in a request.

Four of them answer questions rather than change anything, and all four exit
non-zero when the answer is bad, so they work as gates as well as as commands:

| Script                      | Command                 | Reads only       |
| --------------------------- | ----------------------- | ---------------- |
| `check-data-quality.ts`     | `npm run data:check`    | Yes              |
| `check-source-health.ts`    | `npm run source:health` | Yes              |
| `check-accessibility.ts`    | `npm run a11y:check`    | Yes              |
| `redact-stored-listings.ts` | `npm run jobs:redact`   | Unless `--apply` |

The rest import, ingest, build or purge. `build-geometry.ts` is the geometry
pipeline described in ADR-0003; `vercel-build.mjs` is the deployment entry point.

A script here is a thin shell around a module in `ingestion/` or `analytics/`.
Argument parsing and printing belong here; the work does not, so a test can
exercise it and a route could call it if one ever needed to.
