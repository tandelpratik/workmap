# Source Compliance Register

The constitution requires every source to have a documented compliance status
before production use. This register is that document.

**Status of this register: incomplete.** It was created at milestone 01 so that
no source can quietly reach production unverified. Four sources (`jsa-ivi`,
`abs-asgs`, `adzuna` and `smartjobs-qld`) have now been verified against their
published terms, and one (`jobs-wa`) has been verified as prohibited. The rest
have not been verified. Milestone 30 completes the remainder, and any milestone
that touches a specific source must verify that source first.

A status of `PROHIBITED` or `RESTRICTED` is a completed verification, not a gap.
It means the terms were read and they refuse us.

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

| Source          | Kind                | Activation         | Compliance     | Production eligible                   |
| --------------- | ------------------- | ------------------ | -------------- | ------------------------------------- |
| `jsa-ivi`       | Market indicator    | `ACTIVE`           | `VERIFIED`     | **Yes**, CC BY 4.0                    |
| `abs-asgs`      | Geography           | `ACTIVE`           | `VERIFIED`     | **Yes**, CC BY 4.0                    |
| `anzsco`        | Classification      | `PENDING`          | `UNVERIFIED`   | No                                    |
| `adzuna`        | Job listings        | `ACTIVE`           | `VERIFIED`     | **Yes**, for publishing listings only |
| `smartjobs-qld` | Job listings        | `ACTIVE`           | `VERIFIED`     | **Yes**, CC BY 3.0 AU                 |
| `jobs-wa`       | Job listings        | `BLOCKED`          | `PROHIBITED`   | **Never**, without written permission |
| `workday`       | Job listings        | `BLOCKED`          | `RESTRICTED`   | Only per employer, on written consent |
| `pageup`        | Job listings        | `BLOCKED`          | `UNVERIFIED`   | No: access blocked, terms unread      |
| `iworkfor-nsw`  | Job listings        | `BLOCKED`          | `UNVERIFIED`   | No: no data served, licence unknown   |
| `careers-vic`   | Job listings        | `PENDING`          | `UNVERIFIED`   | No: not yet mapped                    |
| `synthetic`     | Development fixture | `DEVELOPMENT_ONLY` | Not applicable | **Never**                             |

The six job-listing candidates below `adzuna` were added on 2026-08-31 from
[DIRECT_SOURCE_FEASIBILITY.md](DIRECT_SOURCE_FEASIBILITY.md), which records the
measurements and the clauses behind each status. That document is the evidence;
this one is the decision.

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

Answers 1, 3, 4 and 12 stopped being prose on 2026-09-08. They are now fields on
the descriptor in `config/sources.ts`, under `licence`, `rights` and
`retrieval`, and a test asserts them. The paragraphs below remain the evidence:
they say why an answer is what it is, which no enum can carry.

## Job content rights

A licence covering a page does not cover every component printed on it, so a
listing source additionally carries a `jobContentRights` matrix: one position
per field of an advertisement, defaulting to `NEEDS_VERIFICATION` for anything
unstated. `mayRepublishField()` is the single gate, the job repository is the
single place it is applied, and a field it refuses is reported to the reader as
withheld rather than left blank.

| Field                     | `adzuna`     | `smartjobs-qld` | Basis                                                                      |
| ------------------------- | ------------ | --------------- | -------------------------------------------------------------------------- |
| `title`                   | Permitted    | Permitted       | Licence and terms both cover the listing as published                      |
| `employer`                | Permitted    | Permitted       | As above                                                                   |
| `location`                | Permitted    | Permitted       | As above                                                                   |
| `salary`                  | Permitted    | Permitted       | As above. Adzuna estimates carry the Jobsworth label separately            |
| `employmentType`          | Permitted    | Permitted       | As above                                                                   |
| `postedAt`                | Permitted    | Permitted       | As above                                                                   |
| `closingDate`             | Unstated     | Permitted       | Not supplied by the Adzuna API                                             |
| `description`             | Permitted    | Permitted       | Adzuna: the excerpt their API returns for display. QLD: CC BY 3.0 AU       |
| `contactDetails`          | **Withheld** | **Withheld**    | Personal information, and unnecessary: every listing links to the original |
| `logo`                    | **Withheld** | **Withheld**    | An employer's trade mark, not the platform's to sublicense                 |
| `applicationInstructions` | **Withheld** | **Withheld**    | Applying happens at the source, where the instructions stay current        |

The three withheld rows are decisions rather than open questions. The register
distinguishes the two: `WITHHELD` means someone decided, `NEEDS_VERIFICATION`
means nobody has.

## Personal information in advertisement text

Queensland advertisements routinely name a contact officer with a direct
telephone number and a work email address, and unlike Adzuna the description
held for that source is the whole advertisement rather than an excerpt. The
licence permits reproducing it; that does not make republishing a named person's
direct line proportionate for an indexing product that links to the original.

So contact details are removed on the way in, before anything is stored, by
`domain/personal-information.ts`. Minimising what is collected is stronger than
minimising what is displayed: a later export or database dump cannot reintroduce
what a render-time filter would only have been hiding.

The filter is deterministic and covers email addresses and Australian telephone
numbers. It deliberately does not attempt names or postal addresses:

- a contact officer's name is indistinguishable by pattern from an employer's
  name, a suburb, or half the words in a job title;
- a workplace address is the location of the job, which is the product's
  subject.

Those limits are documented rather than assumed solved, and `/report` is the
route by which a person can ask for a specific removal.

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

### Smart Jobs and Careers (Queensland)

- **Key:** `smartjobs-qld`
- **Kind:** Individual job listings
- **Activation:** `PENDING`. Permitted, and both the adapter and the ingestion
  path are built and tested against captured pages. Nothing has crawled the live
  portal, and the gate refuses every run while this says `PENDING`. Activating it
  is a decision to begin crawling a public service, so it is left to the product
  owner (milestone 13a).
- **Compliance:** `VERIFIED`
- **Verified on:** 2026-08-31, from the search page's own footer licence link
  and [qld.gov.au/legal/copyright](https://www.qld.gov.au/legal/copyright), read
  directly.

**The grant.** The Queensland Government copyright statement says:

> Unless otherwise noted, all copyright material available on or through this
> website is licensed under a Creative Commons Attribution 4.0 International
> licence (CC BY 4.0). You are free to use copyright material available on or
> through this website that is covered by a CC BY licence in line with the
> licence terms.

The Smart Jobs search page carries a Creative Commons Attribution licence link
in its own footer alongside links to that statement, so the licence reaches the
listings and not merely the parent site.

**Why this one matters.** CC BY permits commercial use, redistribution and
adaptation with attribution. It is the only live job-listing source found that
permits both republication and published statistics, which makes it the natural
compliant core of a listings product. `permitsDerivedAggregates` is therefore
`true`, on the same reasoning as `jsa-ivi` and `abs-asgs`.

**Licence version: resolved 2026-08-31 as CC BY 3.0 AU.** The pages carry AGLS
metadata declaring the licence in machine-readable form:

```html
<meta
  name="DCTERMS.license"
  scheme="DCTERMS.URI"
  content="http://creativecommons.org/licenses/by/3.0/au/"
/>
<meta
  name="DCTERMS.creator"
  scheme="AGLSTERMS.GOLD"
  content="c=AU; o=The State of Queensland"
/>
```

The footer links the same 3.0 AU deed. `qld.gov.au/legal/copyright` states CC BY
4.0 "unless otherwise noted", and these pages do note otherwise, so 3.0 AU is
what governs here. Both permit commercial use, redistribution and adaptation
with attribution, so the conclusion is unchanged and the attribution wording is
now pinned to the version actually declared.

The adapter asserts this in a test against a captured page, so a silent change
to the declared licence fails the build rather than passing unnoticed.

**One open item remains.** "Unless otherwise noted" means an individual
advertisement carrying third party material may fall outside the grant.
Advertisement text should be treated more cautiously than the factual fields.

**Activated 2026-09-01.** Idempotency holds against the live portal: a re-run
recognises listings already stored and asks the portal for nothing about them.
Every region has resolved to a real ASGS area, and nothing has been quarantined
for bad data.

**Operational note.** A run that dies without recording its own failure used to
hold the single-active-run lock forever, because the handler that would mark it
FAILED needs the same database that has just become unreachable. That happened
here on 2026-09-05 and left the source un-ingestible until the row was cleared
by hand. Runs older than two hours are now treated as abandoned and released
automatically (`ingestion/stale-runs.ts`).

**Coverage: resolved 2026-09-05. The crawler reaches the whole portal.**
A run on that date walked 2,118 of the 2,127 rows the portal reported, with
nothing quarantined.

The earlier limit of about 56 rows was never the portal's doing. Two faults of
ours produced it, and both are worth recording because they had the same
signature: something that made the source look far smaller than it is, in
silence.

1. **The parser followed one link form out of two.** The portal writes some
   results as `jncustomsearch.viewFullSingle?...&in_jnCounter=N` and others as
   a vanity path such as `/jobs/QLD-QLD-PTCAP2026`, mixed within one page. Rows
   using the second form were dropped without a word, which read as pages
   decaying (20 rows, then 14, 12, 9, 1) and then as the portal running out of
   results. The detail pages behind both forms are identical.
2. **A single dropped connection ended the crawl.** The client had no retry, so
   one transient network failure stopped the paging walk and left the rest
   unread. Transient failures are now retried twice with increasing backoff;
   refusals (4xx) are never retried, and retries count against the request
   budget so a struggling host cannot be hammered under cover of the ceiling.

Filtering by region was also tried as a way to partition the result set into
shallow slices. It is not needed now, and it did not work as attempted: the
`in_multi01_id` field alone is ignored and returns the unfiltered total, so it
would need the paired label field as well.

**What a full crawl costs.** About 107 page requests plus one detail request per
listing, so roughly 2,200 requests. At the default pacing that is around 90
minutes. Runs are bounded by a request budget and report `stoppedOnBudget` when
they stop early, so a partial run is legible as partial rather than being
mistaken for a small portal.

**Technical note, measured 2026-08-31.** Runs on NGA.NET. **2,038 live jobs**
at time of writing. The search is a form POST; paging works by replaying the
server's own hidden fields (`in_pg` as the cursor, `in_nav=next_set`) rather
than constructing an offset. Listing pages carry no JSON-LD; detail pages do,
and that is where the stable reference (`QLD/164089`) and the real dates live.
The JSON-LD `jobLocation` is published empty, so geography comes from the
rendered "Workplace Location" field instead.

**Geography is the reason to build this first.** The portal names a closed
vocabulary of Queensland regions ("Cairns region", "Darling Downs - Maranoa",
"North West Qld"), so placing a listing is a lookup rather than the free-text
geocoding every other candidate source would require.

`robots.txt` returns 404, so no crawl policy is published. The client therefore
paces itself (1.5s between requests, sequential, with a per-run request
ceiling): absence of a stated limit is not permission.

### WA Government Jobs

- **Key:** `jobs-wa`
- **Kind:** Individual job listings
- **Activation:** `BLOCKED`
- **Compliance:** `PROHIBITED`
- **Verified on:** 2026-08-31, from
  [wa.gov.au/terms-of-use](https://www.wa.gov.au/terms-of-use), reached by
  following `wa.gov.au/copyright`, read directly.

**The prohibition.** Three clauses, all against us:

> **no commercial use:** not resell or make the WA.gov.au website or Other
> Government Services available to any third party, or otherwise commercially
> exploit

> You may copy, distribute, display, download or print the material on this
> website for your own personal use, for non-commercial educational purposes or
> for non-commercial use within your organisation, provided you attribute the
> source of the information

> no part may be reproduced or re-used for any commercial purposes whatsoever
> without prior written permission of the State of Western Australia

This product is commercial, so WA is closed absent that written permission.

**Recorded because it is the most tempting source found.** Its `robots.txt`
permits crawling at a 5 second delay and publishes a sitemap listing 963 live
jobs, 371 of them outside Perth. Its JSON-LD is the best encountered anywhere:
real WA planning regions in `addressLocality`, a populated `addressRegion`,
proper multi-location arrays, and ISO `datePosted` and `validThrough`. It would
solve the geography problem outright.

None of that is the question. A permissive `robots.txt` is a crawl policy, not a
licence, and this entry exists so that a future reader who rediscovers the good
data does not mistake one for the other. A test pins the status for the same
reason.

**Route if wanted:** written permission from the State of Western Australia.

### Workday career sites

- **Key:** `workday`
- **Kind:** Individual job listings, employer-hosted, one tenant per employer
- **Activation:** `BLOCKED`
- **Compliance:** `RESTRICTED`, and the distinction from `PROHIBITED` is
  deliberate: the platform is open and the barrier is each employer's own
  terms, which differ and can be negotiated.
- **Verified on:** 2026-08-31, from four employers' terms of use, read directly.

**Technically proven.** An unauthenticated JSON endpoint returned 528 live
listings across six Australian employers in about a minute, with no throttling.
`robots.txt` explicitly allows the career paths and publishes sitemaps. Records
carry a stable `jobReqId`, satisfying ADR-0005, plus real `startDate` and
`endDate`. The career sites carry no terms of use of their own.

**Legally barred, employer by employer.** All four employer terms that could be
located prohibit what the product needs:

| Employer   | Clause as written                                                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lendlease  | "use any **robot, spider, other automatic device** or manual process to monitor, copy or extract any web pages on the Website, or any of the Content, without our prior written permission"                                                                  |
| Transurban | "no part of material on this website may be uploaded to a third party, **linked to, framed**, reproduced, adapted, performed in public, distributed or transmitted in any form by any process without our specific written consent"                          |
| Telstra    | "You must not otherwise reproduce, transmit (including broadcast), communicate, adapt, distribute, sell, modify or publish or otherwise use any of the material on the Telstra websites... except as permitted by statute or with our prior written consent" |
| UQ         | "For personal, non-commercial purposes, you may view or make copies of the material... Content may not be reproduced or transmitted without our prior written permission"                                                                                    |

Lendlease bars the **act of extraction** regardless of what is done with the
output. Transurban bars **linking**. UQ directs commercial requests to its
Copyright Officer, so a written permission route exists.

**Two arguments that soften this, neither settled, neither legal advice.**
Facts are not copyright in Australia and there is no separate database right, so
a title, employer, suburb, date and link differ from republished advertisement
copy. And whether `telstra.com.au`'s terms bind
`telstra.wd3.myworkdayjobs.com` is genuinely open, since it is a different host
with no terms link of its own. Obtain legal advice before relying on either.

**Standing prohibition.** Rio Tinto's Workday `robots.txt` sets
`Disallow: /RioTinto_Careers/`. It must never be ingested.

**Unread:** CommBank and AGL terms pages could not be located.

**Route:** this source may move toward `ACTIVE` only per employer, and only on
written permission. Employers generally want the traffic, so the ask is cheap.

### PageUp career sites

- **Key:** `pageup`
- **Kind:** Individual job listings
- **Activation:** `BLOCKED`
- **Compliance:** `UNVERIFIED`, not `PROHIBITED`: access was blocked before any
  terms could be read, so nothing is known about what they permit.
- **Checked on:** 2026-08-31

Eight of eight Australian tenants (JCU, CQU, Charles Sturt, Wollongong, Deakin,
Federation, La Trobe, Sydney Water) return an Imperva/Incapsula challenge marked
`NOINDEX, NOFOLLOW`. There is no public JSON or XML endpoint, contrary to the
claim that prompted this investigation.

This matters more than the other blocks, because the blocked tenants are
concentrated in exactly the regional universities and utilities the product most
wants. PageUp operates feeds for contracted partners, so the route is a
commercial agreement rather than an engineering one.

**Never attempt to defeat the challenge.** That is bypassing an access control,
which the constitution forbids outright.

### I Work for NSW

- **Key:** `iworkfor-nsw`
- **Kind:** Individual job listings
- **Activation:** `BLOCKED`
- **Compliance:** `UNVERIFIED`
- **Checked on:** 2026-08-31

Serves no data without JavaScript: the homepage is a client-rendered shell with
no server-rendered listings and no JSON-LD. The copyright page returns 403, so
the licence position could not be established. `nsw.gov.au` material is CC BY
4.0, but that statement covers `nsw.gov.au` and not this host, and **must not be
assumed to extend here**.

**Its `robots.txt` is worth honouring if this is revisited.** It carries
`Content-Signal: search=yes,ai-train=no,use=reference`, which permits building a
search index and returning links and short excerpts, and forbids training on the
content. It names `ClaudeBot`, `GPTBot`, `CCBot` and `Google-Extended` as
disallowed. Any future classification or matching work must respect
`ai-train=no`.

**Correction to the record:** the proposal that prompted this study cited
`iworkfornsw.gov.au`, which does not exist. The real host is
`iworkfor.nsw.gov.au`.

### Careers.vic

- **Key:** `careers-vic`
- **Kind:** Individual job listings
- **Activation:** `PENDING`
- **Compliance:** `UNVERIFIED`
- **Checked on:** 2026-08-31

Not yet mapped. A Drupal site whose `robots.txt` disallows `/search/` and
`/search?`, which is where listings are likely reached, and no copyright or
terms page could be found at the standard paths. Neither the listing structure
nor the licence is established, so this is an open question rather than a
negative finding.

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
- No ingesting Rio Tinto's career site. Its `robots.txt` sets
  `Disallow: /RioTinto_Careers/` (recorded 2026-08-31).
- No treating a permissive `robots.txt` as a licence. WA Government Jobs is the
  worked example: crawling is permitted, commercial reuse is forbidden.

## Change log

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-28 | Register created at milestone 01. All sources `UNVERIFIED`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-28 | Activation axis added (ADR-0009). Adzuna recorded `BLOCKED` at onboarding. JSA and ABS recorded `ACTIVE`. Synthetic fixture registered as `DEVELOPMENT_ONLY`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-28 | ABS ASGS verified as CC BY 4.0 against its published terms. First source to become production eligible. Attribution wording recorded, ASGS Edition 4 selected.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-08-28 | JSA IVI verification attempted and not completed. Primary source unreachable (application-layer block, not circumvented). data.gov.au records only `other-open` with no licence URL, which is insufficient. Status remains `UNVERIFIED`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-28 | JSA IVI verified as CC BY 4.0 from the copyright page, supplied by the product owner. Attribution recorded. Linking clause flagged; written confirmation recommended before monetisation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-29 | Adzuna access granted and its API terms verified. `ACTIVE` / `VERIFIED` for publishing listings. Aggregation barred without written consent, enforced by `permitsDerivedAggregates`. Mandatory attribution recorded. Logo asset still outstanding.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-31 | Six direct job-listing candidates registered from the feasibility study. `smartjobs-qld` verified as CC BY and the first listing source permitted to aggregate. `jobs-wa` verified as `PROHIBITED`: non-commercial use only. `workday` `RESTRICTED`, barred by employer terms and openable only per employer on written consent. `pageup`, `iworkfor-nsw` and `careers-vic` recorded `UNVERIFIED`. Rio Tinto added to the standing prohibitions.                                                                                                                                                                                                                                                               |
| 2026-09-01 | `smartjobs-qld` activated after its adapter and ingestion were built and tested. First live runs stored 25 listings, idempotency confirmed (a re-run refetched nothing it already held), and every region resolved to a real ASGS area. Known limit recorded: the crawler currently reaches about 56 of the portal's 2,131 listings because deep pagination returns decaying then empty pages.                                                                                                                                                                                                                                                                                                                 |
| 2026-09-05 | `smartjobs-qld` coverage resolved: the crawler now reaches the whole portal (2,118 of 2,127 rows walked, nothing quarantined). Two faults of ours had capped it near 56: a parser that followed only one of the portal's two result-link forms, and a client with no retry, so one dropped connection ended a crawl. Abandoned runs are now released automatically rather than wedging the source.                                                                                                                                                                                                                                                                                                             |
| 2026-09-07 | `smartjobs-qld` corpus filled: 2,213 listings held, all active, against a portal reporting 2,095 that day. A defect found while checking the fill: expiry read a `lastSeenAt` that was only refreshed for listings a run did not need to refetch, so a listing the budget never reached could be retired after 14 days while the portal advertised it throughout. Seen and verified are now distinct, and only a run that walks the whole portal may retire anything.                                                                                                                                                                                                                                          |
| 2026-09-08 | Licence, rights and retrieval became structured fields on every descriptor rather than prose in `notes`, and are now asserted by `tests/rights.test.ts`. A per-field `jobContentRights` matrix was added for the two live listing sources, defaulting closed, gated once in the job repository. Contact details are removed from advertisement text at ingestion by `domain/personal-information.ts`, with `npm run jobs:redact` sweeping what was collected earlier. `termsUrl` no longer doubles as a licence link for the Creative Commons sources: the deed moved to `licence.url`, which is what lets the attribution component satisfy CC BY's requirement to link the licence rather than only name it. |
