# Milestone 05: JSA IVI importer

- **Date:** 2026-08-29
- **Prompt:** `.claude/prompts/05_jsa_importer.md`
- **Outcome:** Built and tested. **Not yet run against a real release**: the IVI
  data files cannot be obtained from this environment. See "The blocker".

## Repository state at start

Milestones 01 to 04 complete. Schema, geography (120 ASGS Edition 4 areas) and
the source register in place, with `jsa-ivi` verified as CC BY 4.0 at 04a. The
working tree carried uncommitted groundwork: the `source_*` dimension columns,
`input_ref` / `input_checksum`, and `read-excel-file`, with no migration.

## The blocker

The importer is finished. It has not imported anything, because the files are
unreachable from here.

| Path                                       | Result                                            |
| ------------------------------------------ | ------------------------------------------------- |
| `jobsandskills.gov.au`                     | Connection and TLS succeed, no HTTP response. Same application-layer block recorded at 04a |
| `data.gov.au`, the official open-data mirror | Reachable, but `robots.txt` is `Disallow: /` for all agents |

The second is the notable one. The Australian Government's own open-data portal
disallows automated access site-wide, so a scripted download from it is not
permitted under the constitution's source rules. It was not worked around.

**What unblocks this:** an operator supplies the workbook, exactly as the
product owner supplied the copyright page at 04a. Drop it anywhere and run:

```
npm run jsa:inspect -- <file>.xlsx     # what the file contains, no writes
npm run jsa:import  -- <file>.xlsx --dry-run
npm run jsa:import  -- <file>.xlsx
```

## What was built

**A reader that discovers the layout instead of assuming one**
(`integrations/jsa/ivi.ts`). The milestone requires surviving changed column
names, which a hard-coded column map cannot do: it either breaks or, worse,
quietly reads the wrong column. So the header row is found by looking for a row
naming at least one dimension and at least two reference periods; dimension
columns are matched against alias sets case and punctuation insensitively; and
every decision is reported. A sheet whose columns are unrecognised is skipped
with the headers it actually saw, and a workbook where nothing matches fails
with the same detail rather than importing nothing quietly.

This also made writing the importer possible without the file. The only
assumption is a list of header spellings, extending it is a one-line change, and
a wrong guess surfaces as a loud skip rather than as wrong data.

**An unrecognised column becomes a qualifier, not a discard.** A column that is
neither a period nor a known dimension is carried into the series key. Dropping
it would silently merge two different series into one, which is the failure mode
that matters: an "Original" and a "Trend" row for the same state and month would
otherwise collide and one would overwrite the other.

**Three refusals to guess**, each tested:

- **`-` is not interpreted.** In ABS notation it can mean nil and it can mean a
  figure rounded to zero. Either reading invents a measurement, so the cell is
  quarantined and an operator resolves it against the release's own notes. Only
  `np` (not for publication) and `..` (not applicable) are mapped, being
  unambiguous across Australian official statistics.
- **A bare number is never read as an Excel date serial.** `38718` is a valid
  serial for 2006-01-31 and a plausible figure; guessing would misdate a column.
- **No fuzzy geography matching.** Exact match after normalisation, and a code
  or name matching areas at two levels is ambiguous rather than a match. `ZZZ`
  is both a country and an SA4, the collision that silently overwrote a country
  row at milestone 04.

**Idempotency in three layers** (`ingestion/jsa-ivi.ts`). The file is
checksummed, so re-importing the same bytes is a no-op unless forced. Series
upsert on a key built only from what the source stated, never from what we
resolved, so when milestone 11 loads the occupation classification the keys do
not move and the history does not split. Observations are compared against what
is stored and only genuine changes are written, which makes the second run
observably a no-op rather than merely a harmless one.

**Unresolved references are preserved, not dropped.** No ANZSCO classification
is loaded, so no occupation resolves today. Each series keeps the source's own
code and title, and resolves later without re-reading the file. The same applies
to any IVI region the ASGS registry does not recognise.

**Quarantine and threshold.** A row that cannot be read is quarantined with its
raw cell and the run continues; a run whose quarantine rate exceeds 5% fails
loudly, per ADR-0005, because a rate that high means the release changed shape.

## Verification

| Check                                        | Result                                 |
| -------------------------------------------- | -------------------------------------- |
| `vitest run`                                 | 154 tests, all pass (58 new)           |
| `eslint`, `tsc --noEmit`, `prettier --check` | Pass                                   |
| Migration applied                            | `20260829163311_labour_market_source_dimensions_and_input_versioning` |
| Import against a real IVI release            | **Not run.** No file obtainable        |

The import test runs the real importer against a generated `.xlsx` fixture,
inside a transaction that is rolled back. That exercises the real schema, its
CHECK constraints and its unique indexes, and proves the second run writes
nothing, while guaranteeing no fabricated figure is ever stored under an
official source. The test asserts the rollback: zero `jsa-ivi` series remain
afterwards.

## Files changed

- `domain/labour-market.ts`, `integrations/jsa/{ivi,workbook}.ts`
- `ingestion/{jsa-ivi,dimensions}.ts`, `db/repositories/labour-market.ts`
- `scripts/{import-jsa-ivi,inspect-workbook}.ts`, `package.json`
- `db/schema.prisma` plus the migration above
- `tests/labour-market.test.ts`

## Decisions

- **Failures are returned, not thrown.** The importer returns `Result`, unlike
  `ingestion/geography.ts`, which throws. A malformed workbook and an unverified
  source are expected operational states that a caller must handle (ADR-0008).
  The geography importer predates this and is worth aligning later.
- **`write-excel-file` as a dev dependency**, to generate fixture workbooks in
  tests rather than commit binary files. Build-time only.
- **Measure and unit are our own labelling**, taken from ADR-0002 and checked
  against the forbidden-phrase list before parsing begins. The source's own
  names are preserved verbatim and never edited.

## Open issues

1. **No live import has happened.** Every column alias, the value notations and
   the unit are unconfirmed against a real release. The first real file may
   require alias additions; `jsa:inspect` exists to make that a short job.
2. **Whether IVI values are advertisement counts or index points.** The unit is
   recorded as `advertisements` and is overridable per import. Confirm against
   the release before anything is displayed.
3. **IVI Regions are still not loaded**, unchanged from milestone 04.
4. **ANZSCO against OSCA**, at milestone 11.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 154 of 154
- [x] Typecheck, lint, format pass
- [x] Provenance preserved: source dimensions, input checksum, run, retrieval time
- [x] No unauthorized data handling: robots checked on both candidate hosts, and
      the one that disallows automated access was not used
- [x] Documentation updated
- [ ] Verified against a real release: **blocked on file access**
