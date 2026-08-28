# Source Compliance Register

The constitution requires every source to have a documented compliance status
before production use. This register is that document.

**Status of this register: incomplete by design.** It is created at milestone 01
so that no source can quietly reach production unverified. Every entry is
currently `UNVERIFIED`. Milestone 30 completes the verification; milestones that
touch a specific source must verify that source first.

## Status meanings

| Status | Meaning |
| --- | --- |
| `VERIFIED` | Terms read, permissions confirmed, evidence recorded below |
| `UNVERIFIED` | Not yet confirmed. **Must not be used in production.** |
| `RESTRICTED` | Permitted for some uses only; restrictions recorded |
| `PROHIBITED` | Not permitted. Do not integrate. |

`complianceStatus` on a source descriptor (ADR-0001) must match this table.

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

### Adzuna API

- **Key:** `adzuna`
- **Kind:** Individual job listings
- **Status:** `UNVERIFIED`
- **Needed by:** Milestone 12 (adapter), 13 (ingestion)
- **Requires from product owner:** API credentials (`ADZUNA_APP_ID`,
  `ADZUNA_APP_KEY`) obtained under an account whose terms permit this use.
- **Open questions:** commercial use on a free tier; permitted description
  storage and display length; caching duration; attribution wording; whether
  applications must be directed to the source listing; request quotas.
- **Note:** Credentials must never reach the browser (ADR-0006). Requests are
  server-side only.

### Jobs and Skills Australia: Internet Vacancy Index

- **Key:** `jsa-ivi`
- **Kind:** Labour-market indicator
- **Status:** `UNVERIFIED`
- **Needed by:** Milestone 05 (importer), 06 (history)
- **Open questions:** licence terms of the published data files; required
  attribution wording; permitted derived/aggregated publication; redistribution
  of the underlying series.
- **Semantic constraint (already binding):** IVI counts online job
  advertisements on a defined set of boards. It is **never** described as total
  Australian vacancies (ADR-0002).

### ABS: Australian Statistical Geography Standard boundaries

- **Key:** `abs-asgs`
- **Kind:** Geography
- **Status:** `UNVERIFIED`
- **Needed by:** Milestone 04 (geography)
- **Open questions:** licence covering the specific boundary release; required
  attribution wording; whether simplified derivatives may be redistributed as
  static assets; edition to standardise on.
- **Note:** ABS material is commonly published under a Creative Commons
  Attribution licence, which would permit use with attribution. This has **not**
  been confirmed for the release the product will use and must not be assumed.
  No boundary file is committed before confirmation (ADR-0003).

### ANZSCO occupation classification

- **Key:** `anzsco`
- **Kind:** Classification
- **Status:** `UNVERIFIED`
- **Needed by:** Milestone 11 (occupation intelligence)
- **Open questions:** licence and attribution for the classification structure;
  the version to standardise on, and how version changes are handled in
  historical series.
- **Note:** Occupation mappings are never invented. An unmapped listing is
  recorded as unmapped rather than guessed into a plausible code.

## Standing prohibitions

Independent of any source's terms, and not subject to trade-off:

- No bypassing access controls, authentication, rate limits or paywalls.
- No scraping where the intended use is not authorised.
- No ignoring robots directives or terms of use.
- No presenting an estimate as an official statistic.
- No claiming complete Australian coverage without evidence.

## Change log

| Date | Change |
| --- | --- |
| 2026-08-28 | Register created at milestone 01. All sources `UNVERIFIED`. |
