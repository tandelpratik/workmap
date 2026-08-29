# Milestone 04b: ASGS edition compatibility for JSA data

- **Date:** 2026-08-28
- **Trigger:** Open question blocking the milestone 05 join
- **Outcome:** Resolved. The edition JSA publishes against does not matter.

## The question

Milestone 04 loaded ASGS Edition 4. The IVI SA4 series was introduced in 2024,
when Edition 3 was current, so it is probably reported against Edition 3.
Joining an Edition 3 series to Edition 4 boundaries would attach figures to the
wrong areas, which the constitution forbids as mislabelled geography.

The IVI methodology page states the edition, and that page is unreachable from
this environment.

## How it was answered without the blocked source

The question was reframed. Rather than asking what JSA used, ask whether it
could possibly matter: if no code or boundary moved between the two editions, a
series keyed by SA4 code joins identically either way.

That is answerable entirely from the ABS side, which is reachable.

**Check 1: the ABS change flag.** Every area in the Edition 4 release carries
`CHG_FLAG26` and `CHG_LBL26` stating what changed since Edition 3.

| Level   | No change | Name change | Anything else |
| ------- | --------- | ----------- | ------------- |
| COUNTRY | 2         | 0           | 0             |
| STATE   | 10        | 0           | 0             |
| SA4     | 104       | 4           | 0             |

**Check 2: direct comparison.** Downloaded the Edition 3 SA4 boundary file and
compared the code sets: 108 areas in both editions, **0 added, 0 removed**, 4
names differing.

The two checks agree, and the second does not depend on trusting the first.

## The four differences

| Code | Edition 3                              | Edition 4                             |
| ---- | -------------------------------------- | ------------------------------------- |
| 297  | Migratory - Offshore - Shipping (Vic.) | Migratory - Offshore - Shipping (Vic) |
| 299  | No usual address (Vic.)                | No usual address (Vic)                |
| 697  | Migratory - Offshore - Shipping (Tas.) | Migratory - Offshore - Shipping (Tas) |
| 699  | No usual address (Tas.)                | No usual address (Tas)                |

Punctuation, on four areas that have no geometry. Nothing is drawn differently.

## Answer

**An IVI series keyed by SA4 code joins correctly to the Edition 4 registry
whichever edition JSA published it against.** No second edition needs loading and
no mapping table is required. Milestone 05 can proceed on Edition 4 alone.

## Two rules this imposes

- **Join by code, never by name.** Four names differ between editions, so a
  name-based join would fail silently on exactly the areas nobody inspects.
- **Re-check at the next edition.** This finding covers Edition 3 to Edition 4
  and says nothing about Edition 5.

## Made durable rather than documented

A claim in a document decays. The build now captures the ABS change label on
every registry entry and summarises it per level in the manifest, and three
tests hold it to account:

- the manifest records what changed since the previous edition;
- **no level reports anything beyond a name change**, which fails the build if a
  future edition adds, removes, splits, merges or redraws an area, forcing the
  join question to be asked again;
- name changes are confined to areas that cannot be mapped.

## Files changed

- `scripts/build-geometry.ts`: captures `CHG_LBL26` per area, adds
  `summariseEditionChanges`, writes `editionCompatibility` into the manifest
- `data/geography/registry-ASGS2026.json`, `manifest-ASGS2026.json`: regenerated
- `tests/geography.test.ts`: three edition-compatibility tests
- `docs/compliance/SOURCE_REGISTER.md`: open question closed under `jsa-ivi`

## Verification

| Check                                        | Result                                              |
| -------------------------------------------- | --------------------------------------------------- |
| Edition 4 change flags                       | 0 code or boundary changes at COUNTRY, STATE or SA4 |
| Edition 3 downloaded and compared            | 108 codes both editions, 0 added, 0 removed         |
| `geo:build`                                  | Manifest carries the compatibility summary          |
| `vitest run`                                 | 96 tests, all pass                                  |
| `eslint`, `tsc --noEmit`, `prettier --check` | Pass                                                |

## Still open

1. **How milestone 05 obtains the IVI data files**, given the access block.
   Unchanged by this finding.
2. **ANZSCO against OSCA**, at milestone 11.
3. **Adzuna access.** Unchanged.
