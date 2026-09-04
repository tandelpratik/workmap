# Direct Source Feasibility Study

**Date:** 2026-08-31
**Status:** Technical access tested and terms of use read for the sources named
below. Terms remain unread for several sources, which are marked as such in
[What this study does not prove](#what-this-study-does-not-prove).

Every figure below was measured from a live request on 2026-08-31, and every
quoted clause was read from the publisher's own page on the same day. Nothing
here is projected, inferred or assumed unless it says so.

> **Revision note.** An earlier version of this document called WA "the most
> immediately workable" source. That was written before its terms of use were
> read, and it was wrong. WA prohibits commercial use. The correction is
> recorded here rather than quietly removed, because the error is instructive:
> `robots.txt` permission and licence permission are unrelated, and this study
> initially conflated them.

## What you can actually use

This is the complete list of sources that permit commercial use. It is short.

| Source             | Licence             | Permits                                                    | State                               |
| ------------------ | ------------------- | ---------------------------------------------------------- | ----------------------------------- |
| **QLD Smart Jobs** | CC BY (attribution) | Commercial use, including aggregation                      | **New finding, not yet integrated** |
| **JSA IVI**        | CC BY 4.0           | Commercial use, including published statistics             | Already `ACTIVE`/`VERIFIED`         |
| **ABS ASGS**       | CC BY 4.0           | Commercial use                                             | Already `ACTIVE`/`VERIFIED`         |
| **Adzuna**         | API terms           | Individual advertisements **only**. No counts, no averages | Already `ACTIVE`/`VERIFIED`         |

`smartjobs.qld.gov.au` carries a Creative Commons Attribution licence link in
its own page footer (`creativecommons.org/licenses/by/3.0/au/`) alongside links
to `qld.gov.au/legal/copyright`, which states:

> Unless otherwise noted, all copyright material available on or through this
> website is licensed under a Creative Commons Attribution 4.0 International
> licence (CC BY 4.0). You are free to use copyright material available on or
> through this website that is covered by a CC BY licence in line with the
> licence terms.

CC BY permits commercial use with attribution. This is a genuine, unrestricted
grant and it is the only one found for live job listings.

**Version resolved 2026-09-01.** The pages declare the licence in AGLS
metadata: `DCTERMS.license` is `http://creativecommons.org/licenses/by/3.0/au/`
and `DCTERMS.creator` is "The State of Queensland". The policy page's CC BY 4.0
applies "unless otherwise noted", and these pages note otherwise, so 3.0 AU
governs. Both permit commercial use, so the conclusion stands and the
attribution wording is now pinned to the declared version.

One caveat remains: "unless otherwise noted" means individual advertisements
containing third-party material may fall outside the grant.

## What is technically possible but legally closed

Both of these work. Neither may be used.

### Workday: proven, then barred by employer terms

| Fact                                   | Measured                                              |
| -------------------------------------- | ----------------------------------------------------- |
| Live jobs pulled, 6 employers, 7 sites | **528**                                               |
| Time taken                             | about 1 minute                                        |
| Authentication required                | none                                                  |
| Requests needed for all 528            | ~30                                                   |
| Throttling or errors encountered       | zero                                                  |
| Robots permission                      | explicit `Allow:` on career paths, sitemaps published |

The records are technically excellent: stable `jobReqId` for idempotent
ingestion, real `startDate` and `endDate`, an `externalUrl` for attribution, and
JSON-LD `JobPosting` markup on detail pages.

**Then the terms were read.** Four of four employers prohibit precisely this.
See [Terms of use: what they actually say](#terms-of-use-what-they-actually-say).

### WA: the best data found anywhere, and explicitly non-commercial

`search.jobs.wa.gov.au` publishes a sitemap listing **963 live jobs**, with WA
planning regions encoded in the URL slugs:

| Region               | Listings |
| -------------------- | -------: |
| Perth Metropolitan   |      592 |
| Goldfields-Esperance |      108 |
| Kimberley            |      104 |
| South West           |       94 |
| Wheatbelt            |       85 |
| Mid West             |       85 |
| Great Southern       |       85 |
| Pilbara              |       62 |
| Gascoyne             |       55 |
| Peel                 |       37 |

(Regions exceed 963 because multi-region roles list several.)

Its job pages carry the best JSON-LD encountered in this study, solving the
geography problem outright:

```json
"jobLocation": [
  { "@type": "Place", "address": { "@type": "PostalAddress",
      "addressLocality": "Kimberley Region",
      "addressRegion": "Western Australia", "addressCountry": "AU" } },
  { "@type": "Place", "address": { "@type": "PostalAddress",
      "addressLocality": "Pilbara Region",
      "addressRegion": "Western Australia", "addressCountry": "AU" } }
]
```

Real regions, a real state field, proper multi-location arrays, ISO
`datePosted` and `validThrough`. Its `robots.txt` permits crawling at a 5 second
delay.

**And its terms of use forbid the use.** `wa.gov.au/copyright` redirects to
`wa.gov.au/terms-of-use`, which reads:

> **no commercial use:** not resell or make the WA.gov.au website or Other
> Government Services available to any third party, or otherwise commercially
> exploit

> You may copy, distribute, display, download or print the material on this
> website for your own personal use, for non-commercial educational purposes or
> for non-commercial use within your organisation, provided you attribute the
> source of the information

> Apart from any fair dealing for the purposes of private study, research,
> criticism or review, as permitted under the provisions of the Copyright Act
> 1968, or where different copyright terms are expressly stated, **no part may
> be reproduced or re-used for any commercial purposes whatsoever without prior
> written permission of the State of Western Australia**

This product is commercial. WA is therefore closed absent written
permission from the State.

## What is blocked outright

**PageUp is closed.** 8 of 8 tenants tested (JCU, CQU, Charles Sturt, UOW,
Deakin, Federation, La Trobe, Sydney Water) return an Imperva/Incapsula
challenge. There is no public JSON or XML endpoint.

**Two named sources do not exist.** `lgjobs.com.au` returns NXDOMAIN.
`iworkfornsw.gov.au` returns NXDOMAIN; the real host is `iworkfor.nsw.gov.au`.

**Rio Tinto forbids it in writing.** Its Workday `robots.txt` reads
`Disallow: /RioTinto_Careers/`.

**NSW yields nothing.** Its homepage loads but is a 504 KB JavaScript shell with
zero server-rendered job links and no JSON-LD. Its `/copyright` page returns 403. `nsw.gov.au` is CC BY 4.0, but that statement covers `nsw.gov.au` and not
this host, so the licence position is unestablished.

**VIC yields nothing.** No copyright or terms page exists at the standard paths,
and the site is a JavaScript application. `Disallow: /search/` and `/search?`.

**Adzuna cannot feed the map.** Its licence forbids "aggregation (including but
not limited to vacancy counts, average salaries etc)". Individual advertisements
only.

## Terms of use: what they actually say

Read directly from each publisher on 2026-08-31.

### Permissive

| Publisher                                              | Clause                                                                                                                                   | Effect                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **QLD Government**                                     | "all copyright material available on or through this website is licensed under a Creative Commons Attribution 4.0 International licence" | **Commercial use permitted** with attribution                     |
| **NSW Government** (`nsw.gov.au`, not the jobs portal) | "All material on this website is licensed under the Creative Commons Attribution 4.0 licence, except as noted below"                     | Permissive, but scope over `iworkfor.nsw.gov.au` is unestablished |

NSW's exclusions are the State's coat of arms, symbols, logos and trademarks;
any third-party material; and anything expressly published under other
conditions.

### Prohibitive

| Publisher         | Clause as written                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **WA Government** | "no part may be reproduced or re-used for any commercial purposes whatsoever without prior written permission of the State of Western Australia"                                                                                                             |
| **Lendlease**     | "use any **robot, spider, other automatic device** or manual process to monitor, copy or extract any web pages on the Website, or any of the Content, without our prior written permission"                                                                  |
| **Telstra**       | "You must not otherwise reproduce, transmit (including broadcast), communicate, adapt, distribute, sell, modify or publish or otherwise use any of the material on the Telstra websites... except as permitted by statute or with our prior written consent" |
| **Transurban**    | "no part of material on this website may be uploaded to a third party, **linked to, framed**, reproduced, adapted, performed in public, distributed or transmitted in any form by any process without our specific written consent"                          |
| **UQ**            | "For personal, non-commercial purposes, you may view or make copies of the material... Content may not be reproduced or transmitted without our prior written permission"                                                                                    |

Lendlease's clause is the most directly applicable: it prohibits the **act of
extraction** regardless of what is done with the output. Transurban's prohibits
**linking**. UQ directs commercial requests to its Copyright Officer, which
means a written permission route exists.

Four of four private employers whose terms could be located prohibit
republication without written consent. This is standard Australian corporate
boilerplate, so the remaining employers should be assumed to match until shown
otherwise.

### Two mitigating nuances

Neither is legal advice, and both should be confirmed with a lawyer before
commercialisation.

1. **Facts are not copyright in Australia.** Job title, employer, suburb, date
   and a URL are facts. Copyright protects expression, which here is the
   description text. An index of facts linking back to the source is materially
   different from republishing advertisement copy, and is the model aggregators
   operate on. Australia has no separate database right.
2. **Host scope is arguable.** Whether `telstra.com.au`'s terms bind
   `telstra.wd3.myworkdayjobs.com` is genuinely open: different host, and the
   career site carries no terms link of its own. Copyright in the advertisement
   text subsists regardless of any terms of use.

These soften the position but do not clear it. Lendlease's anti-extraction
clause and Transurban's anti-linking clause bite even against a facts-only
index.

## What this study does not prove

- **Terms were read for 7 publishers only**: QLD, WA, NSW (whole-of-government),
  Telstra, Transurban, UQ and Lendlease. **CommBank and AGL terms pages could
  not be located** (404 and 403 at the paths tried). PageUp's terms were never
  reached because access is blocked.
- **No legal advice was obtained.** The facts-versus-expression argument and the
  host-scope argument are stated as open questions, not conclusions.
- **Rate limits were not probed.** "No throttling at 400 ms" is one cooperative
  pass, not a known ceiling. Probing limits means straining someone's service.
- **Six employers is a small sample**, skewed by two large tenants. The 88 per
  employer figure is indicative, not a population estimate.
- **These are undocumented internal endpoints.** They can change without notice.
  Any adapter must fail loudly rather than silently.
- ~~**QLD's listing structure was not mapped.**~~ **Resolved 2026-09-01.** The
  extraction path was mapped and built: 2,038 live jobs, a form-POST search
  paged by replaying the server's own cursor, JSON-LD on detail pages carrying
  the stable `QLD/164089` reference, and a closed region vocabulary. See
  `integrations/smartjobs-qld/`.

## Bottom line

The engine works and the targets are mostly closed.

Workday ingestion was proven in about a minute, and then four of four employer
terms turned out to prohibit it. WA has the best structured job data found in
this study and explicitly bars commercial use. PageUp is behind a WAF.

**One compliant live-listing source was found: Queensland Smart Jobs, under CC
BY.** Everything else either needs written permission or is already in the
register.

The realistic architecture is therefore: QLD as the compliant listings core,
JSA IVI for all published statistics, Adzuna for advertisement volume, and
direct employer feeds only where written permission has been obtained. Employer
permission is likely cheap to get, because employers want the traffic. That is
an email campaign, not an engineering project.

## Verdict by pillar

| Pillar                       | Verdict                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1. Government portals        | **One usable (QLD, CC BY).** WA bars commercial use, NSW and VIC yield no server-rendered data, one named address does not exist |
| 2a. PageUp                   | **Not viable without a commercial agreement.** 8 of 8 tenants blocked                                                            |
| 2b. Workday                  | **Technically proven, legally barred.** 528 jobs pulled; 4 of 4 employer terms prohibit republication                            |
| 3. Direct regional employers | **Requires written permission.** A flagship target forbids it in robots.txt; corporate terms are uniformly prohibitive           |
| 4. schema.org crawler        | **Real, and best on the source that bars commercial use.** WA's markup is excellent and unusable                                 |

## Purpose

A proposal was put forward to source Australian job listings directly from
employers and public sector portals rather than from aggregators, on the
argument that the largest regional employers post to their own career engines
first. The proposal named four pillars:

1. State and regional government portals
2. The dominant Australian enterprise ATS platforms (PageUp and Workday)
3. Direct regional employers (mining, healthcare, agribusiness)
4. A `schema.org` JobPosting crawler over employer career pages

This study tests those claims empirically rather than on paper.

## Method

Requests were low volume, read only, and made with an identifying user agent
(`WorkMapBot/0.1`) except where noted. `robots.txt` was fetched before any other
path on every host. No access control, rate limit, bot challenge or paywall was
bypassed at any point, per the constitution's source compliance rules. Where a
host blocked automated access, that fact was recorded as the finding and the
host was not probed further.

A browser user agent string was used where a site refused a bot string, purely
to characterise whether a block was user-agent based or edge based, and to read
publicly published terms pages. It was not used to obtain listing data, and no
listing data in this study was collected from behind a challenge.

Terms of use were read from each publisher's own published page, following the
site's own copyright or legal link where one existed.

## Claim by claim

| Proposal claim                                                           | Verdict                                 | Evidence                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------- |
| `iworkfornsw.gov.au` is the NSW portal                                   | **False**                               | NXDOMAIN. The real host is `iworkfor.nsw.gov.au`                                |
| `lgjobs.com.au` carries 500+ councils                                    | **False**                               | NXDOMAIN from Google Public DNS. The domain does not exist                      |
| PageUp has "standardized JSON and XML endpoints for every client tenant" | **False as a public interface**         | 8 of 8 tenants return an Imperva/Incapsula challenge                            |
| Polling 50 PageUp tenants captures "tens of thousands" of roles          | **Not supported**                       | Access blocked, and measured yield is about 88 jobs per employer                |
| Workday tenants expose usable structured data                            | **True, but barred by terms**           | 528 jobs pulled; employer terms prohibit republication                          |
| Government portals "do not block crawlers"                               | **False in general**                    | NSW is a JS shell behind Cloudflare; WA bars `/api/`; QLD's robots.txt 404s     |
| Career pages carry `JobPosting` structured data                          | **True**                                | Confirmed on Workday and WA job detail pages                                    |
| That markup yields "exact postcode, city, and state"                     | **False on Workday, partly true on WA** | Workday gave a street line and a country; WA gave region and state, no postcode |
| That markup yields `baseSalary`                                          | **False**                               | Field absent on every page inspected                                            |
| Adzuna provides "the base layer" for the product                         | **Licence-barred for the map**          | Its terms forbid aggregation                                                    |
| Direct sourcing avoids third-party restrictions                          | **False**                               | The restrictions move from the aggregator to the employer, and are stricter     |

## Pillar 1: government portals

| Portal   | Host                    | Technical                                                                          | Licence                             |
| -------- | ----------------------- | ---------------------------------------------------------------------------------- | ----------------------------------- |
| QLD      | `smartjobs.qld.gov.au`  | NGA.NET, server-rendered, session-based search, no JSON-LD, robots.txt 404s        | **CC BY. Commercial use permitted** |
| WA       | `search.jobs.wa.gov.au` | 963 jobs in sitemap, excellent JSON-LD, robots permits at 5s delay, `/api/` barred | **Non-commercial only**             |
| NSW      | `iworkfor.nsw.gov.au`   | JS shell, no SSR jobs, `/copyright` 403                                            | Unestablished                       |
| VIC      | `careers.vic.gov.au`    | Drupal, `Disallow: /search/`, no terms page found                                  | Unestablished                       |
| Councils | `lgjobs.com.au`         | **Does not exist**                                                                 | n/a                                 |

### NSW robots.txt is worth recording

It opens with a content-signal preamble stating that access is conditional on
honouring the signals, then declares:

```
User-agent: *
Content-Signal: search=yes,ai-train=no,use=reference
Allow: /
```

followed by explicit `Disallow: /` blocks for `ClaudeBot`, `GPTBot`, `CCBot`,
`Google-Extended`, `Amazonbot`, `Bytespider`, `Applebot-Extended` and
`meta-externalagent`.

Read plainly that permits building a search index and forbids AI training. Any
future classification or matching work must respect that boundary. It is moot
for now: the site serves no data without JavaScript.

## Pillar 2a: PageUp is closed

Tenant hosts resolve and serve `robots.txt`, but every listing page tested
returned an Imperva/Incapsula interstitial carrying
`<META NAME="ROBOTS" CONTENT="NOINDEX, NOFOLLOW">` and an incident ID.

| Tenant        | Sector                                     | Result  |
| ------------- | ------------------------------------------ | ------- |
| `jcu`         | James Cook University (Townsville, Cairns) | Blocked |
| `cqu`         | Central Queensland University              | Blocked |
| `csu`         | Charles Sturt University                   | Blocked |
| `uow`         | University of Wollongong                   | Blocked |
| `deakin`      | Deakin University                          | Blocked |
| `federation`  | Federation University (Ballarat)           | Blocked |
| `latrobe`     | La Trobe University                        | Blocked |
| `sydneywater` | Sydney Water                               | Blocked |

8 of 8. This is systemic platform configuration, not a per-client choice.
`careers.monash.edu` similarly redirected to a Cloudflare managed challenge.

The blocked list is exactly the regional employer set the proposal correctly
identifies as valuable. PageUp does operate feeds; they go to contracted
partners. **This is a business development problem, not an engineering one.**
No amount of crawler work solves it, and attempting to solve it with crawler
work would violate the constitution.

## Pillar 2b: Workday works, technically

Workday tenants publish sitemaps and explicitly allow their career site paths.
Telstra's is representative:

```
Sitemap: https://telstra.wd3.myworkdayjobs.com/Telstra_Careers/siteMap.xml
User-agent: *
Allow: /Telstra_Careers/
Allow: /tls-careers/
Disallow: /refreshFacet/
```

The career search endpoint is an unauthenticated JSON POST:

```
POST https://{tenant}.wd3.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}
```

It returns `total` plus a `jobPostings` array. A follow-up GET on
`/wday/cxs/{tenant}/{site}{externalPath}` returns the detail record:

| Field         | Example                | Value to us                                           |
| ------------- | ---------------------- | ----------------------------------------------------- |
| `jobReqId`    | `JR-10173006`          | Stable key. Satisfies idempotent ingestion (ADR-0005) |
| `startDate`   | `2026-08-31`           | A real date, unlike the list view's "Posted Today"    |
| `endDate`     | `2026-09-29`           | Expiry is knowable rather than inferred               |
| `externalUrl` | full URL               | Attribution and click-through target                  |
| `timeType`    | `Full time`            | Employment type                                       |
| `location`    | `Australia (Flexible)` | **Free text. See the location problem**               |

The career sites carry no terms of use link of their own. The governing terms
are each employer's own, and those are prohibitive.

### Tenant discovery is manual

Of 27 guessed Australian tenant names, 9 resolved: `riotinto`, `qantas`, `nab`,
`cba`, `agl`, `transurban`, `lendlease`, `uq`, `glencore`, plus `telstra` which
was already known. There is no directory. Tenant and site identifiers must be
curated by hand and maintained as configuration.

Site identifiers are not uniform either. `cba` runs `CommBank_Careers`,
`Bankwest_Careers` and `Private_Ad`. Several tenants expose a
`broadbean_external` site that partly duplicates the main one (UQ: 67 on the
main site, 50 on `broadbean_external`), so **cross-site deduplication is
required or counts will be inflated**.

## The measured dataset

528 listings pulled with full pagination from 7 permitted tenant sites, at 400 ms
between page requests and 600 ms between tenants. No throttling, no error, no
authentication. Total elapsed time was about one minute.

| Tenant / site                |  Pulled | Non-Australian | No location | "N Locations" |
| ---------------------------- | ------: | -------------: | ----------: | ------------: |
| `telstra/Telstra_Careers`    |     185 |              6 |           0 |            52 |
| `cba/CommBank_Careers`       |     217 |             43 |           1 |            36 |
| `cba/Bankwest_Careers`       |       6 |              0 |           0 |             2 |
| `uq/uqcareers`               |      67 |              0 |           0 |             5 |
| `lendlease/LendleaseCareers` |      31 |              0 |      **31** |             0 |
| `agl/AGL_Recruitment`        |      15 |              0 |           0 |             4 |
| `transurban/TU_AU`           |       7 |              0 |           0 |             2 |
| **Total**                    | **528** |         **49** |      **32** |       **101** |

Lendlease returned every one of its 31 listings with no location field at all.
Field availability varies per tenant, so **an adapter cannot assume a uniform
record shape** and must model absence rather than defaulting it, consistent with
the schema's existing rule that absence must not be confused with a measurement.

This dataset was collected to measure feasibility. It is not retained in the
repository and must not be published, given the terms recorded above.

## The location problem

On Workday, across all 528 listings:

| Measure                                                |                                               Of 528 |   Share |
| ------------------------------------------------------ | ---------------------------------------------------: | ------: |
| With a postcode                                        | **~0** (5 four-digit matches, mostly street numbers) |     <1% |
| With a state                                           |                                                   57 |     11% |
| With coordinates                                       |                                                **0** |      0% |
| With salary                                            |                                                **0** |      0% |
| Unplaceable from the list API (`N Locations` or empty) |                                              **133** | **25%** |
| Not Australian, must be filtered out                   |                                                   49 |      9% |
| Free-text store or site names                          |                                                  298 |     56% |
| Distinct location strings                              |                                                  171 |         |

The `schema.org` block on a Workday job page confirms the shape:

```json
{
  "@type": "JobPosting",
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "Australia",
      "addressLocality": "400 George St"
    }
  },
  "datePosted": "2026-08-31",
  "validThrough": "2026-09-29",
  "employmentType": "FULL_TIME"
}
```

`addressLocality` holds a street line. There is no `addressRegion`, no
`postalCode`, no geo coordinates, and no `baseSalary`.

Real values include `Telstra Store Roma`, `Shop 56 B, Capalaba Park Shopping
Centre, 45 Redland Bay Rd`, `WA Country` and `Australia (Flexible)`. The same
place arrives in several forms: Mackay appears as `Mackay`,
`Telstra Store Mackay` and `Mackay, QLD - Cnr Victoria & Wood Streets`.

WA's markup does not have this problem, which is the study's central irony: the
source with clean geography is the one that bars commercial use.

### Consequences

1. A gazetteer and fuzzy resolver for Australian place names is **mandatory**
   for any free-text source, and it is the hard part of the build.
2. 25% of Workday listings need a second HTTP request before they can be placed.
3. Non-Australian listings arrive mixed in and must be filtered, not assumed
   away. CommBank's feed is 20% Bangalore.
4. Salary cannot be sourced this way at all. Any salary layer needs a different
   origin.

## The thesis survives

56 of 528 listings (10.6%) are identifiably regional, and the towns are exactly
the ones a metro-weighted aggregator underserves:

Broken Hill, Mount Isa, Port Lincoln, Victor Harbor, Murray Bridge, Roma,
Emerald, Yeppoon, Gympie, Kingaroy, Gladstone, Hervey Bay, Port Macquarie,
Renmark, Bundaberg, Rockhampton, Townsville, Toowoomba, Cairns, Wagga Wagga,
Whyalla, Singleton, Tamworth, Kalgoorlie, Karratha, Mackay, Muswellbrook,
Warrnambool, Dubbo, Orange, Alice Springs.

WA's sitemap independently confirms it: 371 of its 963 jobs sit outside Perth,
across the Kimberley, Pilbara, Goldfields, Gascoyne, Wheatbelt, Mid West, Great
Southern, South West and Peel.

The gap is real. The proposal's strategic instinct is right even where its
technical and legal claims are not.

## Scale arithmetic

Measured yield is roughly **88 listings per employer** across the 6 employers
tested. The proposal's "tens of thousands of regional roles" from 50 tenants
implies about 400 per tenant, an overstatement of roughly one order of
magnitude.

| Employers with written permission | Expected listings |
| --------------------------------: | ----------------: |
|                                 6 |              ~528 |
|                                50 |            ~4,400 |
|                               150 |           ~13,200 |

Note the changed column heading. Post-terms, the constraint is not how many
tenants can be discovered but how many will grant permission.

## Licensing is the real constraint

Technical permission is not commercial permission. Three distinct layers apply,
and the proposal collapses them into one:

1. **`robots.txt`** governs crawling only. It is not a licence to republish.
   WA demonstrates the gap: permissive robots, prohibitive terms.
2. **Site terms** govern reuse, and are the binding layer for every private
   employer tested.
3. **Copyright** subsists in the advertisement text independently of both.
   Australia has no separate database right, so short factual fields carry
   materially less risk than full description text.

**The defensible shape**, where permission exists, is to republish title,
employer, location, dates and a link back to the employer's own posting, with
attribution. Reproducing full description text is where exposure begins.

### The trap in the proposed architecture

The proposal places Adzuna as the "base layer" feeding the map. Its terms, read
and recorded in [SOURCE_REGISTER.md](SOURCE_REGISTER.md) on 2026-08-29, forbid
exactly that:

> It may not be used in its original format or in aggregation (including but
> not limited to vacancy counts, average salaries etc) to deliver any ongoing
> work or research

Adzuna may show individual advertisements and may never produce the counts the
map is made of. This is already enforced in code via
`permitsDerivedAggregates: false` and `canPublishDerivedAggregates`.

This inverts the proposal's intended split. The instinct was to demote
government data to context. **Licensing forces the opposite:** CC BY government
sources (JSA IVI, and now QLD) are the only material we may compute published
statistics from. The workable division is:

- **Listings product** (search, map pins, click-through): QLD under CC BY, plus
  any employer that grants written permission.
- **Intelligence product** (counts, heatmap, trends): CC BY sources only, with
  the standing caveat that JSA IVI is an online job-advertisement indicator and
  never a count of total Australian vacancies.

## Proposed compliance status

Updated to reflect the terms actually read.

| Candidate       | Activation | Compliance                                 | Basis                                                                      |
| --------------- | ---------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `smartjobs-qld` | `PENDING`  | `VERIFIED` (pending licence-version check) | CC BY on the page footer and in `qld.gov.au/legal/copyright`               |
| `jobs-wa`       | `BLOCKED`  | `PROHIBITED`                               | "no commercial purposes whatsoever without prior written permission"       |
| `workday`       | `BLOCKED`  | `RESTRICTED`                               | Platform is open; each employer's terms govern and 4 of 4 prohibit         |
| `lendlease`     | `BLOCKED`  | `PROHIBITED`                               | Explicit anti-robot and anti-extraction clause                             |
| `telstra`       | `BLOCKED`  | `PROHIBITED`                               | No reproduction without prior written consent                              |
| `transurban`    | `BLOCKED`  | `PROHIBITED`                               | No reproduction, distribution or linking without written consent           |
| `uq`            | `BLOCKED`  | `RESTRICTED`                               | Non-commercial only; written permission route exists via Copyright Officer |
| `iworkfor-nsw`  | `BLOCKED`  | `UNVERIFIED`                               | `/copyright` returns 403; no server-rendered data regardless               |
| `careers-vic`   | `PENDING`  | `UNVERIFIED`                               | No terms page located                                                      |
| `pageup`        | `BLOCKED`  | `UNVERIFIED`                               | Access blocked; terms never reached                                        |
| `riotinto`      | `BLOCKED`  | `PROHIBITED`                               | `Disallow: /RioTinto_Careers/`                                             |
| `cba`, `agl`    | `BLOCKED`  | `UNVERIFIED`                               | Terms pages could not be located                                           |

No candidate here may reach production until its row is `VERIFIED` and its
descriptor and this register agree, per ADR-0009.

## Recommendations

1. **Build the QLD Smart Jobs ingestor first.** It is the only compliant live
   listing source found. Expect a bespoke HTML parser against a session-based
   NGA.NET search, since there is no JSON-LD and no API.
2. **Do not build the Workday adapter yet.** The code is easy and the permission
   is the blocker. Build it when the first employer says yes.
3. **Start an employer permission campaign.** UQ publishes a Copyright Officer
   contact. Employers want the traffic, so the ask is cheap. This is the highest
   value activity available and it is not engineering.
4. **Treat the geocoder as the main engineering effort** for any free-text
   source, tied into the existing ABS ASGS geography. QLD and WA style
   region-level data would reduce but not remove this need.
5. **Approach PageUp commercially**, given the regional employer concentration
   behind it.
6. **Obtain legal advice** on the facts-versus-expression question before
   commercialising any employer-sourced index. This study cannot settle it.
7. **Do not pursue** WA, Rio Tinto, or any source whose terms refuse us, without
   written permission.

## Reproduction

All findings are reproducible with `curl` and `node`. The Workday pull used:

```bash
curl -s -X POST \
  "https://telstra.wd3.myworkdayjobs.com/wday/cxs/telstra/Telstra_Careers/jobs" \
  -H "Content-Type: application/json" \
  -d '{"appliedFacets":{},"limit":20,"offset":0,"searchText":""}'
```

Paginate on `offset` until it reaches `total`. Always fetch `robots.txt` first,
honour any crawl delay, and stop at any host that answers with a challenge.

Terms pages were read by following each site's own copyright or legal footer
link, for example `wa.gov.au/copyright`, which redirects to
`wa.gov.au/terms-of-use#intellectual-property-rights`.
