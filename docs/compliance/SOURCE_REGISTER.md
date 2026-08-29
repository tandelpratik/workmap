# Source Compliance Register

The constitution requires every source to have a documented compliance status
before production use. This register is that document.

**Status of this register: incomplete.** It was created at milestone 01 so that
no source can quietly reach production unverified. Two sources (`jsa-ivi` and `abs-asgs`) have now been verified against their
published terms; the rest have not. Milestone 30
completes the remainder, and any milestone that touches a specific source must
verify that source first.

## Two axes

A source is usable in production only when both axes permit it (ADR-0009).
Compliance answers "are we permitted?". Activation answers "is it turned on?".
Adzuna was the reason these are separate: for months nothing was known to be
wrong with its terms and access was unavailable regardless. Access has since
been granted, and it now illustrates a third distinction: a source can be fully
verified and still be barred from part of the product. Its terms permit
publishing advertisements and reserve aggregate figures for a written licence,
so `permitsDerivedAggregates` is a separate field on the descriptor and a
separate gate in `canPublishDerivedAggregates`.

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

| Source      | Kind                | Activation         | Compliance     | Production eligible                   |
| ----------- | ------------------- | ------------------ | -------------- | ------------------------------------- |
| `jsa-ivi`   | Market indicator    | `ACTIVE`           | `VERIFIED`     | **Yes**, CC BY 4.0                    |
| `abs-asgs`  | Geography           | `ACTIVE`           | `VERIFIED`     | **Yes**, CC BY 4.0                    |
| `anzsco`    | Classification      | `PENDING`          | `UNVERIFIED`   | No                                    |
| `adzuna`    | Job listings        | `ACTIVE`           | `VERIFIED`     | **Yes**, for publishing listings only |
| `synthetic` | Development fixture | `DEVELOPMENT_ONLY` | Not applicable | **Never**                             |

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
- **Compliance:** `VERIFIED`
- **Verified on:** 2026-08-28, from the copyright and disclaimer page, supplied
  by the product owner because the site is unreachable from the development
  environment (see the earlier attempt below).
- **Needed by:** Milestone 05 (importer), 06 (history)

**Licence:** Creative Commons Attribution 4.0 International (CC BY 4.0).

> All content on the Jobs and Skills Australia website is provided under a
> Creative Commons Attribution 4.0 International Licence with the exception of:
> content supplied by third parties, the Commonwealth Coat of Arms, material
> protected by a trade mark, any images and/or photographs.

**Answers to the twelve questions**

| Question              | Answer                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Commercial use        | Permitted. CC BY 4.0 places no restriction on commercial use                                                        |
| Display rights        | Permitted, no volume or extent limit                                                                                |
| Redistribution        | Permitted                                                                                                           |
| Derived data          | Permitted. Aggregation and reformatting are adaptations, which CC BY allows                                         |
| Caching and retention | No restriction stated                                                                                               |
| Deletion obligations  | None stated                                                                                                         |
| Attribution           | Required: "© Commonwealth of Australia". Full wording below                                                         |
| Branding constraints  | Coat of Arms, trade marks, third-party content and **all images and photographs** are excluded and must not be used |
| Application links     | Not applicable to this source                                                                                       |
| Rate limits           | None stated. Data files are downloaded periodically, not fetched per request                                        |
| Acceptable use        | See the linking clause below                                                                                        |
| Terms reviewed        | 2026-08-28                                                                                                          |

**Required attribution.** The site mandates "© Commonwealth of Australia". CC BY
4.0 additionally requires a licence notice, a link to the licence, and an
indication that changes were made. The product aggregates and reformats, so the
change indication applies. The string the product must display:

> Based on Jobs and Skills Australia data. Internet Vacancy Index,
> © Commonwealth of Australia, licensed under
> [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Figures have been
> aggregated and reformatted for display.

**A clause worth flagging.** Under an "Attribution" heading, the page also says:

> You may link to this website at your full expense and responsibility. In doing
> so you must not alter any of the website's contents, frame or reformat the
> files, pages, images, information and materials from this website on any other
> website. We reserve the right to prevent linking.

Read in isolation, "reformat the ... information and materials ... on any other
website" would forbid exactly what this product does. Read in context it is
scoped by "In doing so", meaning while linking, and concerns framing and
mirroring their pages rather than reuse of CC BY licensed data. The two readings
cannot both be right: the CC BY grant above it explicitly permits adaptation and
redistribution, and a CC BY licence once granted is irrevocable.

**Operating rules adopted, which satisfy either reading:**

- Never frame, iframe, mirror or reproduce JSA pages.
- Reuse the data, not their presentation of it.
- Always attribute as above, and state that figures were adapted.
- Link to JSA pages plainly, without altering or wrapping them.

**Recommended before monetisation:** written confirmation from
`copyright@dewr.gov.au` that reuse of IVI data in a commercial product is within
the CC BY grant. `07_COMMERCIAL_READINESS.md` requires commercial rights to be
verified before monetisation, and a one-line email removes the only ambiguity in
this entry.

**No warranty.** JSA states it makes no representation about the accuracy,
reliability, currency or completeness of the material. The product must not
present IVI figures as guaranteed accurate, and must show reference periods so a
reader can judge currency.

**Semantic constraint (binding):** IVI counts online job advertisements on a
defined set of boards. It is **never** described as total Australian vacancies
(ADR-0002).

### ASGS edition: resolved 2026-08-28, and it does not matter

The open question was which ASGS edition the IVI SA4 series is reported against,
because joining an Edition 3 series to Edition 4 boundaries would mislabel
geography. The IVI methodology page is unreadable from here, so the question was
settled from the ABS side instead, which is conclusive and did not require the
blocked host.

**Nothing moved between Edition 3 and Edition 4 at the levels this product
uses.** Two independent checks agree:

1. The ABS publishes a change flag on every area in the Edition 4 release:

   | Level   | No change | Name change | Anything else |
   | ------- | --------- | ----------- | ------------- |
   | COUNTRY | 2         | 0           | 0             |
   | STATE   | 10        | 0           | 0             |
   | SA4     | 104       | 4           | 0             |

2. Downloading the Edition 3 SA4 boundaries and comparing directly: 108 areas in
   both, **0 codes added, 0 removed**, 4 names differing.

The four name changes are punctuation, "Vic." to "Vic" and "Tas." to "Tas", on
Migratory/Offshore/Shipping and No usual address areas. All four have no
geometry, so nothing is drawn differently.

**Consequence:** an IVI series keyed by SA4 code joins to the Edition 4 registry
correctly whichever edition JSA published it against. No second edition needs
loading, and no mapping table is required.

**Two rules this imposes:**

- **Join by code, never by name.** Four names differ between editions, so a
  name-based join would silently fail on exactly the areas that are hardest to
  notice.
- **Re-check at the next edition.** This holds for Edition 3 to Edition 4 and
  says nothing about Edition 5. The manifest records the change counts and a
  test fails if any future edition reports anything beyond a name change, which
  forces the question to be asked again rather than assumed.

**Evidence:** `jobsandskills.gov.au/copyright-and-disclaimer`, contents supplied
by the product owner on 2026-08-28.

**Verification attempted 2026-08-28. Not completed. Status stays `UNVERIFIED`.**

The primary source could not be read from the development environment, and the
secondary source is not specific enough to rely on.

**What happened with jobsandskills.gov.au.** Requests to `www.jobsandskills.gov.au`
complete the TCP connection (0.14s) and the TLS handshake (0.35s), then receive
no HTTP response at all until timeout. The apex domain answers normally and
redirects to `www`. A connection that is accepted and then silently dropped at
the application layer is a deliberate block, not a network fault.

No attempt was made to work around it. Rotating user agents, spoofing browser
headers or routing through a proxy to defeat that filter would be bypassing an
access control, which the constitution prohibits regardless of the reason. The
block may be geographic, may target automated clients, or may be temporary.

**What data.gov.au provided.** The Internet Vacancy Index dataset is listed, and
its licence metadata is:

| Field                   | Value                                            |
| ----------------------- | ------------------------------------------------ |
| `license_id`            | `other-open`                                     |
| `license_title`         | Other (Open)                                     |
| `license_url`           | not set                                          |
| Publishing organisation | Department of Employment and Workplace Relations |
| `metadata_modified`     | 2023-08-11                                       |

This is **not sufficient to mark the source verified.** "Other (Open)" names no
licence, carries no URL, and states no attribution requirement. The record is
three years stale and attributed to a predecessor department rather than to JSA.
It establishes that the data is intended to be open; it does not establish the
terms, and the register requires terms.

**Corroborated, and useful.** The data.gov.au description confirms the semantic
constraint independently:

> This index is based on a count of online job advertisements newly lodged on
> three main job boards (SEEK, CareerOne and Australian JobSearch) during the
> month.

Treat the specific board list as indicative rather than current, since that
description dates from 2023 and Australian JobSearch has since been replaced by
Workforce Australia. The principle holds regardless: the IVI is a count of
advertisements on a defined set of boards, not a measure of all vacancies.

**Indicative, from search result summaries only, and not to be relied on.** The
IVI appears to publish by IVI Region, by SA4 (series added in 2024 and backcast
to 2019), and by state, using ANZSCO at the 2 and 4 digit levels as recently as
the June 2026 release. If the SA4 series was introduced in 2024 it would follow
ASGS Edition 3, which was current then, but that is inference and has not been
confirmed against the methodology document.

**Resolved the same day.** The product owner supplied the contents of
`jobsandskills.gov.au/copyright-and-disclaimer`, which is recorded above. The
licence question is closed. The IVI methodology page was not supplied, so the
ASGS edition question remains open.

The access block itself is unchanged: the site is still unreachable from this
environment, so any future JSA page this project needs has to be supplied the
same way, or fetched from somewhere that can reach it.

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
- **Activation:** `ACTIVE`. API credentials obtained by the product owner.
- **Compliance:** `VERIFIED`, with a restriction that is as important as the
  verification itself.
- **Verified on:** 2026-08-29, from
  [their API terms of service](https://developer.adzuna.com/docs/terms_of_service),
  read directly.
- **Needed by:** Milestone 12 (adapter), 13 (ingestion), 16 and 17 (search).

**Permissible use is a closed list.** The terms name three uses:

> The Adzuna API may be used for: Publishing Adzuna ad listings; Publishing
> Jobsworth salary estimates; Personal research

Publishing listings is the first of those, so the job search product sits
squarely inside the grant.

**The restriction.** The clause immediately after that list:

> Any other use of the Adzuna API by a commercial, government or academic
> organisation including any affiliates or individuals, is permitted subject to
> a 14 day trial period... **It may not be used in its original format or in
> aggregation (including but not limited to vacancy counts, average salaries
> etc) to deliver any ongoing work or research**, apart from the purpose stated
> prior, without written consent. After the trial period ends, a licence
> agreement may be required.

So Adzuna data may be **displayed as individual advertisements** and may **not**
be turned into published statistics. No vacancy counts, no average salaries, no
regional or category breakdowns, no trends. The market intelligence layer, and
the heatmap in particular, stays on JSA IVI, which is CC BY 4.0 and permits
exactly that.

This is enforced rather than documented: `permitsDerivedAggregates: false` on
the descriptor, `canPublishDerivedAggregates` as the single gate, an exact-list
test that fails if the flag changes, and no aggregate query in
`db/repositories/job.ts`.

**Where the line falls.** A result count on a search page is part of paginating
a search and is shown as such. A count of advertisements per region or per
occupation, presented as information about the labour market, is the
aggregation the clause reserves. The first is inside the grant; the second is
not.

**Answers to the twelve questions**

| Question              | Answer                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Commercial use        | Permitted for publishing ad listings. Aggregation requires written consent and possibly a licence |
| Display rights        | Permitted, subject to the mandatory label below                                                   |
| Redistribution        | As displayed advertisements linking back to Adzuna. Not as a data set                             |
| Derived data          | **Not permitted** without written consent                                                         |
| Caching and retention | No duration stated. Data is stored to serve search and refreshed on a schedule                    |
| Deletion obligations  | **Yes.** On termination, all Adzuna data must be removed from the site immediately                |
| Attribution           | Mandatory and prescriptive; exact requirements below                                              |
| Branding constraints  | Their logo must be used, from their press page. Confidential information must not be disclosed    |
| Application links     | `redirect_url` is used unmodified, including its tracking parameters                              |
| Rate limits           | 25/minute, 250/day, 1000/week, 2500/month on the default allowance                                |
| Acceptable use        | No contacting their third-party content providers. No multiple accounts. No extraction for resale |
| Terms reviewed        | 2026-08-29                                                                                        |

**Mandatory attribution, quoted in full because the wording is prescriptive:**

> An API user shall label each displayed advert with the phrase "Jobs by Adzuna"
> at least 116 X 23 pixels in size, wherein the word "Jobs" shall be hyperlinked
> to http://www.adzuna.co.uk or the relevant local domain and the word "Adzuna"
> shall be the Adzuna Logo Image and shall also be hyperlinked to
> http://www.adzuna.co.uk or the relevant local domain.

And for estimated salaries:

> An API user shall label every Jobsworth salary estimate that they publish with
> an icon at least 20 x 20 pixels in size and the word "Adzuna Jobsworth". Both
> elements will link to http://www.adzuna.co.uk/jobs/salary-predictor.html. An
> API user will add the following mouseover text to these links: "Salary
> estimate powered by Adzuna Jobsworth"

Implemented in `components/adzuna-attribution.tsx`. This is a licence condition,
so it outranks the design system's restraint where the two disagree.

**Outstanding: the logo asset.** `public/adzuna-logo.png` is not in the
repository. Adzuna's own site returns HTTP 403 to automated requests and their
bot protection was not circumvented, so the file must be downloaded by hand from
https://www.adzuna.co.uk/press.html. Until it is, the component renders the
required wording and links and logs an error on every render. **Publishing the
site to the public without the logo would not satisfy the terms.** The same
applies to the 20x20 Jobsworth icon.

**Termination obligation.**

> Upon termination of this agreement, for any reason and by either party, an API
> user shall immediately remove all insertion codes and data acquired from
> Adzuna from all pages of its web sites.

`npm run adzuna:purge -- --confirm` deletes every Adzuna row. It deletes rather
than expires, which is the one place in the system where that is correct: an
obligation to remove data is not satisfied by hiding it.

**Note:** Credentials are server-side only and never reach the browser
(ADR-0006). They are never prefixed `NEXT_PUBLIC_`, and the client strips them
from any URL before logging, because Adzuna passes credentials in the query
string.

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

| Date       | Change                                                                                                                                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-28 | Register created at milestone 01. All sources `UNVERIFIED`.                                                                                                                                                                                        |
| 2026-08-28 | Activation axis added (ADR-0009). Adzuna recorded `BLOCKED` at onboarding. JSA and ABS recorded `ACTIVE`. Synthetic fixture registered as `DEVELOPMENT_ONLY`.                                                                                      |
| 2026-08-28 | ABS ASGS verified as CC BY 4.0 against its published terms. First source to become production eligible. Attribution wording recorded, ASGS Edition 4 selected.                                                                                     |
| 2026-08-28 | JSA IVI verification attempted and not completed. Primary source unreachable (application-layer block, not circumvented). data.gov.au records only `other-open` with no licence URL, which is insufficient. Status remains `UNVERIFIED`.           |
| 2026-08-28 | JSA IVI verified as CC BY 4.0 from the copyright page, supplied by the product owner. Attribution recorded. Linking clause flagged; written confirmation recommended before monetisation.                                                          |
| 2026-08-29 | Adzuna access granted and its API terms verified. `ACTIVE` / `VERIFIED` for publishing listings. Aggregation barred without written consent, enforced by `permitsDerivedAggregates`. Mandatory attribution recorded. Logo asset still outstanding. |
