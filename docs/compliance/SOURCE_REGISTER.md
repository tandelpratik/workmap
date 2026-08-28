# Source Compliance Register

The constitution requires every source to have a documented compliance status
before production use. This register is that document.

**Status of this register: incomplete.** It was created at milestone 01 so that
no source can quietly reach production unverified. One source (`abs-asgs`) has
now been verified against its published terms; the rest have not. Milestone 30
completes the remainder, and any milestone that touches a specific source must
verify that source first.

## Two axes

A source is usable in production only when both axes permit it (ADR-0009).
Compliance answers "are we permitted?". Activation answers "is it turned on?".
Adzuna is the reason these are separate: nothing is known to be wrong with its
terms, and access is unavailable regardless.

### Compliance status

| Status       | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| `VERIFIED`   | Terms read, permissions confirmed, evidence recorded below |
| `UNVERIFIED` | Not yet confirmed. **Must not be used in production.**     |
| `RESTRICTED` | Permitted for some uses only; restrictions recorded        |
| `PROHIBITED` | Not permitted. Do not integrate.                           |

### Activation state

| State              | Meaning                                          |
| ------------------ | ------------------------------------------------ |
| `ACTIVE`           | Authorized and configured; may run in production |
| `PENDING`          | Adapter exists, access not yet obtained          |
| `BLOCKED`          | Access attempt stopped by an unmet requirement   |
| `DEVELOPMENT_ONLY` | Must never run in production                     |

Both values appear on the source descriptor (ADR-0001, ADR-0009) and must match
this register.

## Current state

| Source      | Kind                | Activation         | Compliance     | Production eligible      |
| ----------- | ------------------- | ------------------ | -------------- | ------------------------ |
| `jsa-ivi`   | Market indicator    | `ACTIVE`           | `UNVERIFIED`   | No, pending verification |
| `abs-asgs`  | Geography           | `ACTIVE`           | `VERIFIED`     | **Yes**, CC BY 4.0       |
| `anzsco`    | Classification      | `PENDING`          | `UNVERIFIED`   | No                       |
| `adzuna`    | Job listings        | `BLOCKED`          | `UNVERIFIED`   | No                       |
| `synthetic` | Development fixture | `DEVELOPMENT_ONLY` | Not applicable | **Never**                |

## What every source must answer

Before a source is marked `VERIFIED`, record an answer with evidence for each:

1. Commercial use permitted?
2. Display rights: what may be shown, and how much?
3. Redistribution permitted?
4. Derived data: may aggregates be published?
5. Caching and retention: what may be stored, and for how long?
6. Deletion obligations on removal at source?
7. Attribution: exact required wording and placement?
8. Branding constraints?
9. Application links: must traffic be sent to the source destination?
10. Rate limits and quotas?
11. Acceptable use restrictions?
12. Terms URL and the date it was reviewed?

## Register

### Jobs and Skills Australia: Internet Vacancy Index

- **Key:** `jsa-ivi`
- **Kind:** Labour-market indicator
- **Activation:** `ACTIVE`. Designated the live MVP source.
- **Compliance:** `UNVERIFIED`
- **Needed by:** Milestone 05 (importer), 06 (history)
- **Open questions:** licence terms of the published data files; required
  attribution wording; permitted derived and aggregated publication;
  redistribution of the underlying series.
- **Critical path:** This is now the only source of public value at launch. Its
  licence verification blocks production, not just a feature. Verify before
  milestone 05 rather than at milestone 30.
- **Semantic constraint (already binding):** IVI counts online job
  advertisements on a defined set of boards. It is **never** described as total
  Australian vacancies (ADR-0002).

### ABS: Australian Statistical Geography Standard boundaries

- **Key:** `abs-asgs`
- **Kind:** Geography
- **Activation:** `ACTIVE`
- **Compliance:** `VERIFIED`
- **Verified on:** 2026-08-28, by reading the pages listed under Evidence.
- **Needed by:** Milestone 04 (geography)

**Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0).

The digital boundary files download page carries the statement verbatim:

> Copyright Commonwealth of Australia administered by the ABS. Unless otherwise
> noted, content is licensed under a Creative Commons Attribution 4.0
> International licence.

**Answers to the twelve questions**

| Question              | Answer                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| Commercial use        | Permitted. CC BY 4.0 places no restriction on commercial use                                           |
| Display rights        | Permitted, no volume or extent limit                                                                   |
| Redistribution        | Permitted, including as static assets                                                                  |
| Derived data          | Permitted. Simplified geometry is an adaptation and is allowed                                         |
| Caching and retention | No restriction                                                                                         |
| Deletion obligations  | None                                                                                                   |
| Attribution           | Required. Exact wording below                                                                          |
| Branding constraints  | Commonwealth Coat of Arms, ABS logo and trade marks are excluded from the licence and must not be used |
| Application links     | Not applicable                                                                                         |
| Rate limits           | None. Files are downloaded once, not fetched per request                                               |
| Acceptable use        | No additional restrictions beyond CC BY 4.0                                                            |
| Terms reviewed        | 2026-08-28                                                                                             |

**Required attribution.** CC BY 4.0 requires attribution, a licence notice, a
link to the licence, and an indication that changes were made. The product
simplifies boundary geometry for display (ADR-0003), which is a modification, so
the change indication is mandatory rather than optional. ABS guidance is to use
"Source: Australian Bureau of Statistics" for unchanged material and "Based on
Australian Bureau of Statistics data" for modified material.

The string the product must display wherever ASGS boundaries appear:

> Based on Australian Bureau of Statistics data. Australian Statistical
> Geography Standard (ASGS) Edition 4, July 2026 to June 2031.
> © Commonwealth of Australia, administered by the ABS, licensed under
> [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Boundaries have
> been simplified for display.

**Excluded from the licence**, and therefore never to be used: the Commonwealth
Coat of Arms, the ABS logo, material protected by a trade mark, unit record data
(microdata), content supplied by third parties, ABS sub-brands (DataLab, SEAD),
Aboriginal artwork and branding, Census branding and artwork, and OSCA branding
and artwork.

**Edition:** ASGS **Edition 4** (July 2026 to June 2031) is the current release.
Edition 3 covered July 2021 to June 2026 and has now lapsed. The Main Structure,
which includes SA4, State/Territory and Australia boundaries, was released on
22 July 2026 in GeoPackage and ESRI Shapefile formats on the GDA2020 datum, and
is marked complete with no further updates planned.

**Open question, not a licence matter:** which edition JSA IVI reports regions
against. If JSA still publishes against Edition 3 regions, joining its data to
Edition 4 boundaries would mislabel geography, which the constitution forbids.
The `asgs_edition` column exists precisely so both can be loaded. Resolve before
milestone 05.

**Evidence**

- [Website privacy, copyright and disclaimer](https://www.abs.gov.au/website-privacy-copyright-and-disclaimer),
  the general CC BY 4.0 statement and the list of exclusions.
- [ASGS Edition 4 digital boundary files](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-4-july-2026-june-2031/access-and-downloads/digital-boundary-files),
  the licence statement on the page that hosts the files themselves, plus
  formats, datum and release date.
- [How to cite ABS sources](https://abs.gov.au/websitedbs/d3310114.nsf/home/attributing+abs+material),
  citation format guidance.

### ANZSCO occupation classification

- **Key:** `anzsco`
- **Kind:** Classification
- **Activation:** `PENDING`
- **Compliance:** `UNVERIFIED`
- **Needed by:** Milestone 11 (occupation intelligence)
- **Open questions:** licence and attribution for the classification structure;
  the version to standardise on, and how version changes are handled in
  historical series.
- **Note:** Occupation mappings are never invented. An unmapped listing is
  recorded as unmapped rather than guessed into a plausible code.
- **Finding, 2026-08-28:** While verifying the ABS licence, the ABS exclusion
  list was found to name the "Occupation Standard Classification for Australia
  (OSCA)". OSCA is the successor to ANZSCO, so the classification this source
  key assumes may be superseded. Only OSCA _branding and artwork_ is excluded
  from CC BY 4.0, which implies the classification content itself is licensed
  like other ABS material, but that has not been confirmed on an OSCA page and
  must not be assumed. Decide ANZSCO against OSCA at milestone 11, and check
  which one JSA IVI publishes against before milestone 05. The source key may
  need renaming.

### Adzuna API

- **Key:** `adzuna`
- **Kind:** Individual job listings
- **Activation:** `BLOCKED`
- **Compliance:** `UNVERIFIED`
- **Blocker:** The available onboarding path requires organization and website
  details that do not exist yet. Organization details must not be invented and
  onboarding must not be bypassed.
- **Needed by:** Milestone 12 (adapter boundary), 13 (ingestion). Both proceed
  without live credentials; see ADR-0009.
- **Open questions:** commercial use on a free tier; permitted description
  storage and display length; caching duration; attribution wording; whether
  applications must be directed to the source listing; request quotas.
- **Activation procedure:** `.claude/docs/SOURCE_ACTIVATION_RUNBOOK.md`.
- **Note:** Credentials must never reach the browser (ADR-0006). Requests are
  server-side only. No fake credentials or placeholder organization details are
  ever committed.

### Synthetic job source

- **Key:** `synthetic`
- **Kind:** Development fixture, **not a data source**
- **Activation:** `DEVELOPMENT_ONLY`
- **Compliance:** Not applicable. The records are generated by this project and
  describe no real employer, vacancy, salary or person, so no third party holds
  rights in them.
- **Needed by:** Milestone 13 onward, for building and testing the pipeline
  while no authorized job provider is available.
- **Binding constraints:** Never in production. Never in public APIs, official
  metrics, market reporting, public job search, SEO or commercial analytics.
  Never labelled as a real provider. Containment is specified in ADR-0009 and
  enforced by a boot gate that refuses to start a production process with
  synthetic sources enabled.
- **Why this is not fabrication:** The constitution forbids fabricating job
  listings. These records are test input that can never reach a user, which is
  a different thing from invented data presented as real. The distinction holds
  only while containment holds, which is why it is enforced in five independent
  layers rather than by convention.

## Standing prohibitions

Independent of any terms, and not subject to trade-off:

- No bypassing access controls, authentication, rate limits, onboarding
  requirements or paywalls.
- No inventing organization, business or website details to obtain access.
- No scraping where the intended use is not authorised.
- No ignoring robots directives or terms of use.
- No presenting an estimate as an official statistic.
- No presenting synthetic records as real vacancies, in any context.
- No claiming complete Australian coverage without evidence.

## Change log

| Date       | Change                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-28 | Register created at milestone 01. All sources `UNVERIFIED`.                                                                                                    |
| 2026-08-28 | Activation axis added (ADR-0009). Adzuna recorded `BLOCKED` at onboarding. JSA and ABS recorded `ACTIVE`. Synthetic fixture registered as `DEVELOPMENT_ONLY`.  |
| 2026-08-28 | ABS ASGS verified as CC BY 4.0 against its published terms. First source to become production eligible. Attribution wording recorded, ASGS Edition 4 selected. |
