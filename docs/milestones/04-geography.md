# Milestone 04: Geographic Foundation

- **Date:** 2026-08-28
- **Prompt:** `.claude/prompts/04_geography.md`
- **Outcome:** Complete

## Repository state at start

Scaffold and canonical schema in place. ABS ASGS verified as CC BY 4.0 at
milestone 03a. No geography data loaded, no geometry pipeline.

## What was built

Authoritative Australian geography, from the ABS release through to queryable
rows and display-ready boundaries.

**Geometry build (`scripts/build-geometry.ts`).** Downloads the ASGS Edition 4
Main Structure archives, extracts the registry, and emits simplified TopoJSON
tiers plus a provenance manifest. Records the source URL, SHA-256 and byte size
of every archive, and the exact simplification parameters, so any artefact can
be traced back and regenerated.

**Registry importer (`ingestion/geography.ts`).** Loads the committed registry
into the database as a tracked `IngestionRun`, in hierarchy order, upserting on
(code, level, edition). Idempotent: the second run writes the same 120 rows and
changes nothing. Refuses to run if the source is not `VERIFIED`, so compliance
is checked rather than trusted.

**Domain contracts (`domain/geography.ts`).** Levels, parent relationships,
structural validation, and the mappability distinction. Knows nothing about
geometry beyond whether a boundary exists.

**Repository (`db/repositories/geography.ts`).** Returns domain types, never
Prisma rows. Decimal columns are converted at the boundary.

### What was loaded

| Level   | Areas | With a boundary | Without |
| ------- | ----- | --------------- | ------- |
| COUNTRY | 2     | 1               | 1       |
| STATE   | 10    | 9               | 1       |
| SA4     | 108   | 89              | 19      |

The 21 areas without a boundary are the classification's non-spatial areas:
"Migratory, Offshore, Shipping" and "No usual address" for each state, plus
"Outside Australia". They are recorded because sources report against them, and
they are never given invented geometry. The schema carries `has_geometry` so the
map and the accessible table can show them as not mappable rather than as
missing or as zero.

## A silent data-corruption bug, found by real data

The import wrote 120 records and produced 119 rows.

**ASGS codes are unique only within a level, not across the standard.** `ZZZ` is
both a COUNTRY and an SA4, in both cases "Outside Australia". The milestone 03
schema keyed geography on `(code, asgs_edition)`, so the SA4 upsert matched the
country row and overwrote it. A country silently became an SA4, with no error
anywhere.

Fixed by making level part of geography identity, in migration
`20260828104500_geography_code_unique_per_level`. The importer's parent lookup
was keyed by code alone for the same reason and is now keyed by level and code.
After the fix the import produces exactly 120 rows and both `ZZZ` records
coexist.

This was only visible because the importer compares what it wrote against what
landed. A test now asserts that codes reused across levels exist in the registry
and that the repository can tell them apart.

## Simplification, with measurements

The national overview was tuned against real transfer size rather than guessed:

| Setting                                          | Raw        | Gzipped   |
| ------------------------------------------------ | ---------- | --------- |
| 2%, all island rings                             | 391 KB     | 116 KB    |
| 1%, all island rings                             | 213 KB     | 70 KB     |
| **0.7%, island rings under 20 vertices dropped** | **142 KB** | **47 KB** |
| 0.4%, under 40 vertices dropped                  | 86 KB      | 28 KB     |

0.7% with the island filter was chosen. 0.4% distorts recognisable coastline for
a saving that does not matter. A build-time check and a test both assert that
all 89 SA4 areas with boundaries survive simplification, because losing one
would leave a hole in the map with no error.

Detail tiers are one file per state, 3 KB to 217 KB gzipped, loaded only on
drilldown. Simplification runs before the split so shared state borders stay
identical between files rather than drifting apart.

## Source geometry against display geometry

The prompt asks for these to be separable so simplification is reversible.

- **Source geometry** is the ABS archive: gitignored, checksummed in the
  manifest, re-downloadable. Never modified.
- **Display geometry** is the TopoJSON, derived by the parameters the manifest
  records.

Reversibility comes from the derivation being reproducible and the original
being untouched, not from storing two copies of the geometry. Geometry stays out
of the database entirely, per ADR-0003.

## Licence obligation, discharged

Publishing boundary files is redistribution, and CC BY 4.0 requires attribution
to travel with redistributed material. The build emits
`public/geography/ATTRIBUTION.txt` beside the artefacts, generated from the
source registry so it cannot drift from what compliance recorded. It states the
change indication that simplification obliges. A test asserts it exists and says
what it must.

**Still outstanding:** the attribution must also appear wherever boundaries are
displayed. That is milestone 09, and it is a licence condition rather than a
nicety.

## Files changed

- `scripts/build-geometry.ts`, `scripts/import-geography.ts`
- `domain/geography.ts`, `ingestion/geography.ts`,
  `db/repositories/geography.ts`
- `db/schema.prisma`, plus migrations `geography_boundary_flags` and
  `geography_code_unique_per_level`
- `types/mapshaper.d.ts`
- `tests/geography.test.ts` (25 tests), `tests/database.test.ts` (updated)
- `data/geography/registry-ASGS2026.json`, `manifest-ASGS2026.json`
- `public/geography/`, 11 artefacts plus the attribution notice
- `package.json` (`geo:build`, `geo:import`, mapshaper), `.prettierignore`,
  `.gitattributes`, `README.md`, `docs/README.md`

## Verification

| Check                                             | Result                                                          |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `robots.txt` checked before any scripted download | Boundary path permitted                                         |
| `geo:build`                                       | 120 registry records, 11 artefacts, all SA4 boundaries retained |
| `geo:import`                                      | 120 written, 0 quarantined; re-run identical                    |
| Row count against registry                        | 120 of 120, no collisions                                       |
| Orphan check                                      | 0 areas below root without a parent                             |
| `vitest run`                                      | 93 tests, 7 files, all pass                                     |
| `eslint`, `tsc --noEmit`, `prettier --check`      | Pass                                                            |
| `next build`                                      | Pass                                                            |

## Decisions

- **ASGS Edition 4**, current since July 2026, on GDA2020. Edition 3 lapsed in
  June 2026. Edition is part of geography identity, so Edition 3 can load
  alongside it if JSA needs it.
- **mapshaper as a dev dependency.** Build-time only, no production footprint.
  It does topology-preserving simplification, which naive per-feature
  simplification cannot.
- **Registry committed, archives not.** The registry is 120 small records, so
  the import is reproducible without re-downloading 70 MB. The archives are
  reproducible artefacts and stay gitignored.
- **Generated artefacts excluded from Prettier.** Reformatting them would
  inflate the payloads the build deliberately minified.
- **`skipped` counter retained but always zero.** Content-hash skipping belongs
  with the larger job feeds, not a 120-row registry.

## Issues

**Neon connection drops during long test runs.** One run failed with
"Connection terminated unexpectedly"; the next passed unchanged. Free-tier
scale-to-zero suspends the compute during idle gaps in a 60-second suite. Not a
code defect, and it will disappear in CI running in-region, but it makes the
local suite intermittently flaky. Revisit if it becomes frequent.

**Western Australia's detail tier is 217 KB gzipped**, the largest by some
margin because of its coastline. Acceptable for a drilldown that loads one state,
worth revisiting if the map feels slow.

**The `job_real` view still uses `SELECT *`.** Unchanged from milestone 03, and
unaffected here because no column was added to `job`.

## Open issues

1. **JSA IVI licence unverified**, still launch-blocking, still unreachable from
   this environment.
2. **Which ASGS edition JSA reports against.** Now the binding question for
   milestone 05: joining JSA data to Edition 4 boundaries when it publishes
   against Edition 3 would mislabel geography. The registry can hold both.
3. **IVI Regions are not loaded.** The prompt asks for them "where source data
   supports them". They are a JSA classification, not an ABS one, so they cannot
   be built until the JSA source is readable. Deferred to milestone 05 rather
   than guessed.
4. **ANZSCO against OSCA**, at milestone 11.
5. **Adzuna access blocked.** Unchanged.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 93 of 93
- [x] Typecheck pass
- [x] Lint pass
- [x] Accessibility considered: areas without boundaries are modelled as not
      mappable, so the accessible table can represent what the map cannot
- [x] Provenance preserved: source URL, checksum, edition, datum, simplification
      parameters and import run all recorded
- [x] No unauthorized data handling: robots checked, licence verified before
      download, attribution shipped with the redistributed files
- [x] Documentation updated
- [ ] Ready for next milestone, awaiting product owner review
