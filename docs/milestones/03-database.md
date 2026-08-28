# Milestone 03: Canonical Database

- **Date:** 2026-08-28
- **Prompt:** `.claude/prompts/03_database.md`
- **Outcome:** Complete

## Repository state at start

Scaffold from milestone 02. Prisma configured with an empty schema, no models,
no migrations. A Neon project now exists in `ap-southeast-2`, so this milestone
is verified against a real database rather than typechecked alone.

## What was built

15 tables, 17 enums, 5 CHECK constraints, 3 partial indexes, 1 view, 63 indexes
in total, applied in one migration.

### Entities

Every entity named in the prompt, plus one from ADR-0008.

| Prompt             | Implemented as       | Note                               |
| ------------------ | -------------------- | ---------------------------------- |
| Job                | `Job`                |                                    |
| Company            | `Company`            |                                    |
| Location           | `Location`           |                                    |
| JobSource          | `Source`             | Renamed. See deviations            |
| Skill              | `Skill`              |                                    |
| JobSkill           | `JobSkill`           |                                    |
| Occupation         | `Occupation`         |                                    |
| Geography          | `Geography`          |                                    |
| IngestionRun       | `IngestionRun`       |                                    |
| IngestionError     | `IngestionError`     |                                    |
| JobDuplicateGroup  | `JobDuplicateGroup`  |                                    |
| LabourMarketMetric | `LabourMarketMetric` |                                    |
| LabourMarketSeries | `LabourMarketSeries` |                                    |
| GeographyMetric    | `GeographyMetric`    | Precomputed heatmap projection     |
| (not named)        | `SystemEvent`        | Required by ADR-0008 observability |

### Constraints the database enforces

Prisma cannot express these, so they were added by hand in the migration. Each
exists because an application-level rule is not sufficient protection.

**Missing data cannot become zero.** `labour_market_metric` and
`geography_metric` both carry a CHECK tying `value` to `value_state`: a value is
present only when the state says `PRESENT`, `ZERO` must actually be zero, and
`UNAVAILABLE`, `SUPPRESSED` and `NOT_COVERED` must carry no value at all. This
is the ADR-0002 rule made structural rather than conventional.

**One running import per dataset.** A partial unique index on
`(source_key, dataset) WHERE status = 'RUNNING'` means an overlapping cron
firing collides instead of starting a second import (ADR-0005).

**Synthetic records are self-identifying.** A CHECK requires a synthetic row to
name the fixture that produced it, and forbids a real row from carrying one. In
SQL the two are impossible to confuse (ADR-0009).

**Salary is never ambiguous.** A range must be ordered, and any salary figure
must state whether the employer reported it or the provider estimated it.

**The `job_real` view** excludes synthetic rows. Analytics read the view, never
the table, so a summary can never be computed partly from fixtures (ADR-0009,
containment layer 4).

### A uniqueness bug caught before it shipped

Prisma generated a plain unique index for
`(geography_id, measure, basis, period_start, occupation_id)` on
`geography_metric`. PostgreSQL treats NULLs as distinct in unique indexes, so
that index does not constrain rows where `occupation_id` is null. That is the
all-occupations case, which is the most common heatmap row, and the result would
have been silent duplicate metrics and a broken upsert.

Fixed with an additional partial unique index covering exactly the null case.
Prisma's own index is left untouched, so no schema drift is introduced. A test
asserts the duplicate is rejected.

## Files changed

- `db/schema.prisma`, the full schema
- `db/migrations/20260828070419_initial_schema/migration.sql`, generated plus a
  hand-written section for the constraints above
- `db/seed.ts`
- `domain/source.ts`, source contracts and the production eligibility gate
- `config/sources.ts`, the source registry
- `prisma.config.ts`, seed command
- `package.json`, `db:seed` and `db:reset` scripts, `tsx` dev dependency
- `vitest.config.mts`, timeouts raised for real database round trips
- `tests/database.test.ts`, 19 tests
- `tests/source.test.ts`, 13 tests
- `README.md`, `docs/README.md`, `docs/milestones/03-database.md`

## Verification

| Check                      | Result                                                           |
| -------------------------- | ---------------------------------------------------------------- |
| `prisma validate`          | Pass                                                             |
| `prisma migrate dev`       | Applied to Neon, one migration                                   |
| Schema objects present     | 15 tables, 17 enums, 63 indexes, 1 view verified by query        |
| Custom constraints present | 5 CHECK, 3 partial indexes verified by query                     |
| `npm run db:seed`          | 5 sources created, then 5 updated on re-run, proving idempotency |
| `vitest run`               | 66 tests, 6 files, all pass, 19 against the real database        |
| `eslint`                   | Pass                                                             |
| `tsc --noEmit`             | Pass                                                             |
| `prettier --check`         | Pass                                                             |
| `next build`               | Pass                                                             |

## Deviations from the prompt

**`JobSource` implemented as `Source`.** The prompt names the entity
`JobSource`, but the registry has to hold market, geography and classification
sources too, and `jsa-ivi` is not a job source. Two near-identical tables would
be worse. The model carries a `kind` discriminator instead. Say the word and I
will rename it.

**No `UNKNOWN` enum members.** Employment type, remote type, occupation and
location are nullable instead. Having both `null` and `UNKNOWN` gives two ways
to say the same thing, which becomes a bug. Absence is recorded as absence.

## Decisions

- **Provenance is stated once per series, not per observation.**
  `LabourMarketSeries` holds source, dataset, measure, unit, basis and
  dimensions; `LabourMarketMetric` holds period, value and state. Repeating
  provenance on every data point invites drift between a number and its source.
- **`GeographyMetric` is a projection, not a second copy of the truth.** It is
  the precomputed heatmap surface (ADR-0004), refreshed on a schedule, carrying
  change, rank and sample size. `basis` is part of its identity, so an official
  and a derived figure for the same geography and period are separate rows and
  cannot merge into one number.
- **Reference data identity includes its edition.** Geography carries
  `asgs_edition` and Occupation carries `classification_version`. Boundary and
  occupation codes change between releases, so a new edition can load alongside
  the current one instead of corrupting historical series.
- **Coordinates only when supplied.** Latitude and longitude are nullable and
  are never derived or geocoded into existence (ADR-0003).
- **Money and metrics are `Decimal`,** never float.
- **Company merging is by normalised name,** a deliberate simplification. Two
  genuinely distinct employers sharing a normalised name would merge. Recorded
  so it is revisited if observed rather than assumed.
- **`tsx` added as a dev dependency.** The generated Prisma client uses
  extensionless internal imports, which Node's native TypeScript stripping
  rejects, so the seed needs a runner. Dev-only, no production footprint.
- **Vitest timeouts raised to 30s per test.** Database tests run against Neon in
  Sydney and a round trip from this development machine is a few hundred
  milliseconds. This is local latency, not a production characteristic.

## Seed scope

The seed writes the source registry and nothing else. That is deliberate:

- **Geography and occupation reference data is not seeded.** It comes from ABS
  releases whose licence is unverified, and committing it now would put
  unverified third-party data in the repository.
- **No job listings are seeded.** They would be fabricated. Development fixtures
  arrive at milestone 13 behind the synthetic source.

So the seed contains only data this project owns: which sources exist and what
state each is in. A test asserts the database and the code agree, and a second
asserts that no source is production eligible, since no licence has been read.

## Issues

**The `job_real` view uses `SELECT *`,** which PostgreSQL expands at creation
time. A later migration that adds a column to `job` must recreate the view. The
failure mode is safe: the column is absent and a query referencing it fails
loudly rather than returning wrong data. Noted in the migration.

**Full-text search is not implemented.** ADR-0004 specifies a generated
`tsvector` column with a GIN index and `pg_trgm`. That belongs to milestone 16
and was deliberately left out to avoid implementing the next milestone.

**Database tests write to the development database.** They create a
`test-fixture-source` and remove everything in `afterAll`. Acceptable against a
development database, and it will need revisiting before tests ever run against
anything shared.

**The test suite now takes about 58 seconds,** almost entirely round-trip
latency to Sydney. It will be fast in CI running in-region.

## Open issues

1. **JSA IVI licence unverified**, still the launch-blocking dependency.
2. **ABS ASGS licence unverified.** Blocks milestone 04, which is next.
3. **ANZSCO version not chosen.** Blocks milestone 11.
4. **Adzuna access blocked.** No timeline. Does not block launch.
5. **Vercel plan limits unconfirmed.** Re-verify at milestone 34.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 66 of 66
- [x] Typecheck pass
- [x] Lint pass
- [x] Accessibility considered: not applicable, no UI in this milestone
- [x] Provenance preserved: every externally sourced row carries source, and
      metrics carry dataset, measure, basis, period and retrieval time
- [x] No unauthorized data handling: no source contacted, no third-party data
      stored, seed limited to data this project owns
- [x] Documentation updated
- [ ] Ready for next milestone, awaiting product owner review
