# Milestone 03a: ABS ASGS licence verification

- **Date:** 2026-08-28
- **Trigger:** Compliance verification required before milestone 04, authorised
  by the product owner
- **Outcome:** Verified. `abs-asgs` is the first production eligible source.

## Why this was needed

The constitution forbids production use of a source without a documented
compliance status. ADR-0003 recorded ABS licensing as an open blocker and
milestone 04 cannot commit or display a boundary file until it is resolved.

## What was read

| Page                                                                                                                                                                                                          | What it established                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [Website privacy, copyright and disclaimer](https://www.abs.gov.au/website-privacy-copyright-and-disclaimer)                                                                                                  | ABS material is CC BY 4.0 by default, plus the list of exclusions                         |
| [ASGS Edition 4 digital boundary files](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-4-july-2026-june-2031/access-and-downloads/digital-boundary-files) | The licence statement on the page hosting the files, plus formats, datum and release date |
| [How to cite ABS sources](https://abs.gov.au/websitedbs/d3310114.nsf/home/attributing+abs+material)                                                                                                           | Citation format guidance                                                                  |

## Finding

**Creative Commons Attribution 4.0 International.** The boundary files page
states verbatim:

> Copyright Commonwealth of Australia administered by the ABS. Unless otherwise
> noted, content is licensed under a Creative Commons Attribution 4.0
> International licence.

Commercial use, redistribution and adaptation are all permitted with
attribution. Simplifying geometry for web display, which ADR-0003 requires, is
an adaptation and is allowed.

Full answers to the twelve compliance questions, the exact attribution wording
and the exclusion list are recorded in
[the source register](../compliance/SOURCE_REGISTER.md).

## Two findings beyond the licence question

**ASGS Edition 4 is now the current release.** It covers July 2026 to June 2031
and replaced Edition 3, which lapsed in June 2026. The Main Structure, including
SA4, State and Australia boundaries, was published on 22 July 2026 on the
GDA2020 datum and is marked complete. Milestone 03 made `asgs_edition` part of
geography identity for exactly this reason, a month before it mattered.

**ANZSCO may be superseded.** The ABS exclusion list names the Occupation
Standard Classification for Australia (OSCA), which is ANZSCO's successor. Only
OSCA branding and artwork is excluded from CC BY 4.0, implying the
classification content is licensed like other ABS material, but that was not
confirmed on an OSCA page and is not assumed. The `anzsco` source key may need
renaming. Decide at milestone 11.

## Changes made

- `docs/compliance/SOURCE_REGISTER.md`: `abs-asgs` moved to `VERIFIED` with full
  evidence, attribution wording, exclusions and edition decision. OSCA finding
  added to the ANZSCO entry. Summary table and change log updated.
- `config/sources.ts`: `abs-asgs` set to `VERIFIED`, with the attribution text
  stored verbatim so the UI cannot paraphrase a licence requirement.
- `docs/adr/0003-geospatial-pipeline.md`: resolution appended to the open
  blocker section. The original reasoning is left intact.
- `tests/source.test.ts` and `tests/database.test.ts`: the two tripwire tests
  asserting that no source was production eligible have been replaced.

## About those tests

Both previously asserted that **no** source was production eligible, and both
failed the moment `abs-asgs` was verified. That is the behaviour they were
written for: a source becoming usable in production is a compliance decision and
should never pass unnoticed.

They now assert an **exact list** rather than an empty one, so the next source
to become eligible will fail them again and require a deliberate edit. Two
further tests were added: one asserting the database and the code agree on which
sources are eligible, and one asserting that any verified source requiring
attribution actually carries the wording, since a licence obligation that cannot
be rendered is not satisfied.

## Verification

| Check              | Result                                           |
| ------------------ | ------------------------------------------------ |
| `npm run db:seed`  | 5 sources updated, database now matches code     |
| `vitest run`       | 68 tests, all pass, 21 against the real database |
| `eslint`           | Pass                                             |
| `tsc --noEmit`     | Pass                                             |
| `prettier --check` | Pass                                             |

## What is still blocked

1. **JSA IVI licence unverified.** The launch-critical one, since JSA carries
   the product alone. Needs the same treatment.
2. **Which ASGS edition JSA publishes against.** Not a licence question, but it
   determines which boundary set milestone 04 should load. Joining JSA data to
   the wrong edition would mislabel geography.
3. **ANZSCO against OSCA**, at milestone 11.
4. **Adzuna access.** Unchanged, no timeline.

Milestone 04 is unblocked on the licence question. It should not load boundaries
until item 2 is settled, or it risks building the geography registry on the
wrong edition.
