import type { SourceDescriptor } from '@/domain/source';

/**
 * The source registry.
 *
 * This is the single source of truth for which sources exist and what state
 * they are in. The database mirrors it via the seed, and a test asserts the two
 * agree, so an operator reading the admin view and a developer reading the code
 * cannot see different answers.
 *
 * Keep this in step with docs/compliance/SOURCE_REGISTER.md, which records the
 * evidence behind each status. This file records the status; that document
 * records why.
 */
export const sourceDescriptors: readonly SourceDescriptor[] = [
  {
    key: 'jsa-ivi',
    displayName: 'Jobs and Skills Australia',
    kind: 'MARKET_INDICATOR',
    activation: 'ACTIVE',
    complianceStatus: 'VERIFIED',
    attributionRequired: true,
    // The site requires "© Commonwealth of Australia". CC BY 4.0 additionally
    // requires a licence notice, a link, and an indication that changes were
    // made, and we aggregate and reformat. Stored verbatim: the UI renders this
    // and must not paraphrase a licence requirement.
    attributionText:
      'Based on Jobs and Skills Australia data. Internet Vacancy Index, ' +
      '© Commonwealth of Australia, licensed under CC BY 4.0. Figures have been ' +
      'aggregated and reformatted for display.',
    // No termsUrl. For this source the deed below is the whole instrument, and
    // no separate terms document was located and read. An unverified URL here
    // would be worse than none: it would look like evidence.
    homepageUrl: 'https://www.jobsandskills.gov.au/data/internet-vacancy-index',
    licence: {
      name: 'CC BY 4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
      holder: '© Commonwealth of Australia',
    },
    rights: {
      status: 'ESTABLISHED',
      commercialUse: 'PERMITTED',
      redistribution: 'PERMITTED',
      adaptation: 'PERMITTED',
      exclusions: [
        'Third-party content',
        'The Commonwealth Coat of Arms',
        'Trade marks',
        'All images and photographs',
      ],
      lastVerified: '2026-08-28',
    },
    retrieval: {
      method: 'FILE_DOWNLOAD',
      frequency: 'Monthly, on publication of the release',
    },
    // CC BY 4.0 permits adaptation, which is what aggregation is.
    permitsDerivedAggregates: true,
    notes:
      'Internet Vacancy Index. Verified 2026-08-28 as CC BY 4.0: commercial use, ' +
      'redistribution and adaptation permitted with attribution. Excluded from the ' +
      'licence and never used: third-party content, the Commonwealth Coat of Arms, ' +
      'trade marks, and all images and photographs. The site also carries a linking ' +
      'clause forbidding framing or reformatting its pages on another website; we ' +
      'read that as governing page framing rather than the CC BY data grant, and ' +
      'never frame or mirror JSA pages. Counts online job advertisements on a ' +
      'defined set of boards; never described as total Australian vacancies. JSA ' +
      'publishes no warranty as to accuracy, currency or completeness.',
  },
  {
    key: 'abs-asgs',
    displayName: 'Australian Bureau of Statistics',
    kind: 'GEOGRAPHY',
    activation: 'ACTIVE',
    complianceStatus: 'VERIFIED',
    attributionRequired: true,
    // CC BY 4.0 requires attribution, a licence notice, a link to the licence,
    // and an indication that changes were made. The product simplifies geometry
    // for display (ADR-0003), so the change indication is mandatory. Stored
    // verbatim: the UI renders this string and must not paraphrase it.
    attributionText:
      'Based on Australian Bureau of Statistics data. Australian Statistical ' +
      'Geography Standard (ASGS) Edition 4, July 2026 to June 2031. ' +
      '© Commonwealth of Australia, administered by the ABS, licensed under ' +
      'CC BY 4.0. Boundaries have been simplified for display.',
    homepageUrl:
      'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-4-july-2026-june-2031/access-and-downloads/digital-boundary-files',
    licence: {
      name: 'CC BY 4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
      holder: '© Commonwealth of Australia, administered by the ABS',
    },
    rights: {
      status: 'ESTABLISHED',
      commercialUse: 'PERMITTED',
      redistribution: 'PERMITTED',
      adaptation: 'PERMITTED',
      exclusions: ['The Commonwealth Coat of Arms', 'The ABS logo', 'Trade marks'],
      lastVerified: '2026-08-28',
    },
    retrieval: {
      method: 'FILE_DOWNLOAD',
      frequency: 'Once per ASGS edition, roughly every five years',
    },
    // CC BY 4.0, same reasoning as jsa-ivi.
    permitsDerivedAggregates: true,
    notes:
      'Australian Statistical Geography Standard boundaries. Verified 2026-08-28 ' +
      'as CC BY 4.0: commercial use, redistribution and adaptation all permitted ' +
      'with attribution. Edition 4 Main Structure (SA4, State, Australia) was ' +
      'released 22 July 2026 on the GDA2020 datum. The Coat of Arms, ABS logo and ' +
      'trade marks are excluded from the licence and are never used. Which ASGS ' +
      'edition JSA IVI reports against is still open; see the source register.',
  },
  {
    key: 'legislation-regional-areas',
    displayName: 'Federal Register of Legislation',
    // It classifies postcodes into published categories. It is not a boundary
    // set, supplies no geometry, and populates no row in the geography
    // registry, which is why this is a CLASSIFICATION rather than a GEOGRAPHY.
    kind: 'CLASSIFICATION',
    activation: 'ACTIVE',
    complianceStatus: 'VERIFIED',
    attributionRequired: true,
    /*
     * The register mandates one of two sentences and specifies which applies.
     * This is the "modified" form, because the product parses the instrument's
     * ranges into a lookup table rather than reproducing the document, and the
     * date is the date of download as the wording requires. Stored verbatim:
     * the UI renders this and must not paraphrase a licence requirement.
     */
    attributionText:
      'Based on content from the Federal Register of Legislation at ' +
      '10 September 2026. For the latest information on Australian Government ' +
      'legislation please go to https://www.legislation.gov.au.',
    termsUrl: 'https://www.legislation.gov.au/terms-of-use',
    homepageUrl: 'https://www.legislation.gov.au/F2022L00231/latest/text',
    licence: {
      name: 'CC BY 4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
      holder: '© Commonwealth of Australia',
    },
    rights: {
      status: 'ESTABLISHED',
      commercialUse: 'PERMITTED',
      redistribution: 'PERMITTED',
      adaptation: 'PERMITTED',
      exclusions: [
        'The Commonwealth Coat of Arms',
        'Material identified on the register as third-party copyright',
      ],
      lastVerified: '2026-09-10',
    },
    retrieval: {
      method: 'FILE_DOWNLOAD',
      frequency: 'Once per instrument, re-checked when the register records an amendment',
    },
    // CC BY 4.0 permits adaptation. Nothing aggregates a postcode table in
    // practice, but the flag records what the licence says rather than what
    // this product happens to do with it.
    permitsDerivedAggregates: true,
    notes:
      'Migration (Designated regional areas for certain skilled and temporary ' +
      'graduate visas) Instrument (LIN 22/022) 2022, F2022L00231. The definition ' +
      'of a designated regional area, expressed entirely in postcodes. Verified ' +
      '2026-09-10 against legislation.gov.au/terms-of-use: all content except the ' +
      'Commonwealth Coat of Arms is CC BY 4.0, which permits commercial use, ' +
      'redistribution and adaptation with the mandated attribution sentence above. ' +
      'The register was checked the same day and shows one version, in force since ' +
      '5 March 2022, unamended, with no amendments pending. The tables are ' +
      'transcribed in config/regional-areas.ts, which carries a SHA-256 of the ' +
      'document as downloaded so a re-publication under the same identifier is ' +
      'detectable. Used as a geographic definition only: it answers which ' +
      'postcodes are regional and is never used to say anything about a visa, a ' +
      'subclass, an application or a person. The immi.homeaffairs.gov.au summary ' +
      'of the same list returns 403 to automated requests and was not used; the ' +
      'instrument itself is the authority in any case.',
  },
  {
    key: 'anzsco',
    displayName: 'Australian Bureau of Statistics',
    kind: 'CLASSIFICATION',
    activation: 'PENDING',
    complianceStatus: 'UNVERIFIED',
    attributionRequired: true,
    // No licence block: nothing has been read, so there is nothing to record.
    // An empty rights block would be a claim in itself, and the claim would be
    // false.
    rights: {
      status: 'NEEDS_VERIFICATION',
      commercialUse: 'UNVERIFIED',
      redistribution: 'UNVERIFIED',
      adaptation: 'UNVERIFIED',
      exclusions: [],
      lastVerified: null,
    },
    retrieval: { method: 'NONE', frequency: 'Not retrieved' },
    // Unverified, so the aggregate gate is closed regardless of this value.
    permitsDerivedAggregates: false,
    notes:
      'ANZSCO occupation classification. Version to standardise on is not yet ' +
      'decided. Occupation mappings are never invented; an unmapped listing stays ' +
      'unmapped.',
  },
  {
    key: 'adzuna',
    displayName: 'Adzuna',
    kind: 'JOB_LISTING',
    activation: 'ACTIVE',
    complianceStatus: 'VERIFIED',
    attributionRequired: true,
    // The terms mandate a specific label, not a paraphrase: each displayed
    // advert carries "Jobs by Adzuna" at no less than 116x23 pixels, with the
    // word "Jobs" and the Adzuna logo each linked to the local Adzuna domain.
    // This string is the accessible text of that label; the visual treatment
    // and the links live in the attribution component, which renders it.
    attributionText: 'Jobs by Adzuna',
    termsUrl: 'https://developer.adzuna.com/docs/terms_of_service',
    homepageUrl: 'https://www.adzuna.com.au/',
    // Not a public licence. The grant is a contract, and naming it as one keeps
    // an attribution line from implying this material is openly licensed the
    // way the two government datasets are.
    licence: {
      name: 'Adzuna API terms of service',
      url: 'https://developer.adzuna.com/docs/terms_of_service',
      holder: 'Adzuna',
    },
    rights: {
      status: 'ESTABLISHED',
      // Permitted, but only for the closed list of uses their terms enumerate.
      commercialUse: 'PERMITTED',
      // Publishing the ad listings is the permitted use, subject to the label.
      redistribution: 'PERMITTED',
      // Aggregation is named and refused without written consent, and every
      // other use falls outside the enumerated list.
      adaptation: 'PROHIBITED',
      exclusions: [
        'Aggregate figures of any kind, including vacancy counts and average salaries',
        'The Adzuna name and logo, usable only as the mandatory advert label requires',
        'Advertisement text beyond the excerpt the API returns',
      ],
      lastVerified: '2026-08-29',
    },
    retrieval: { method: 'API', frequency: 'Daily' },
    /*
     * What may be reproduced from one of their adverts.
     *
     * The permitted use is publishing the ad listing, which is the factual
     * metadata plus the excerpt their API returns, so those are marked
     * permitted and nothing else is. The three withheld entries are decisions
     * rather than open questions: an employer logo is that employer's trade
     * mark and not Adzuna's to sublicense, a named contact is personal
     * information this product has no reason to republish, and application
     * instructions are unnecessary when every listing links to the advert.
     */
    jobContentRights: {
      title: 'PERMITTED',
      employer: 'PERMITTED',
      location: 'PERMITTED',
      salary: 'PERMITTED',
      employmentType: 'PERMITTED',
      postedAt: 'PERMITTED',
      description: 'PERMITTED',
      contactDetails: 'WITHHELD',
      logo: 'WITHHELD',
      applicationInstructions: 'WITHHELD',
    },
    // The documented default allowance. The tightest of the four bounds is the
    // per-minute one, and it is what the client's limiter enforces; the daily,
    // weekly and monthly budgets are enforced by how often ingestion runs.
    rateLimit: { requests: 25, perSeconds: 60 },
    // Verified 2026-08-29. Their terms permit publishing ad listings, and in
    // the same document forbid aggregation without written consent.
    permitsDerivedAggregates: false,
    notes:
      'Job advertisement listings. Verified 2026-08-29 against the API terms of ' +
      'service. Permissible use is a closed list: publishing Adzuna ad listings, ' +
      'publishing Jobsworth salary estimates, and personal research. Publishing ' +
      'listings is permitted subject to the mandatory "Jobs by Adzuna" label and ' +
      'logo link on every advert shown. Any other use by a commercial organisation, ' +
      'expressly including use "in aggregation (including but not limited to ' +
      'vacancy counts, average salaries etc)", requires written consent after a ' +
      '14 day trial, so no counts, averages or trends derived from Adzuna may be ' +
      'published: the market intelligence layer stays on JSA. Salary figures ' +
      'flagged salary_is_predicted are Adzuna Jobsworth estimates and carry their ' +
      'own labelling obligation. On termination all Adzuna data must be removed ' +
      'from the site, which npm run adzuna:purge exists to do.',
  },
  {
    key: 'smartjobs-qld',
    displayName: 'Smart Jobs and Careers',
    kind: 'JOB_LISTING',
    // Activated 2026-09-01 by the product owner. The licence was verified on
    // 2026-08-31 (CC BY 3.0 AU, declared in the pages' own AGLS metadata), the
    // adapter and ingestion path were built and tested first, and the crawler
    // paces itself because the portal publishes no rate limit. This is the
    // only live listing source the product is licensed to both republish and
    // aggregate.
    activation: 'ACTIVE',
    complianceStatus: 'VERIFIED',
    attributionRequired: true,
    // CC BY requires attribution, a licence notice, a link and an indication
    // that changes were made. Stored verbatim, as with the other CC BY sources.
    // The version is 3.0 AU because that is what the pages themselves declare;
    // see the note below.
    attributionText:
      'Based on Smart Jobs and Careers data. © The State of Queensland, ' +
      'licensed under CC BY 3.0 AU. Listings have been reformatted for display.',
    homepageUrl: 'https://smartjobs.qld.gov.au/',
    licence: {
      name: 'CC BY 3.0 AU',
      url: 'https://creativecommons.org/licenses/by/3.0/au/',
      holder: '© The State of Queensland',
    },
    rights: {
      status: 'ESTABLISHED',
      commercialUse: 'PERMITTED',
      redistribution: 'PERMITTED',
      adaptation: 'PERMITTED',
      exclusions: [
        'Material within an individual advertisement noted as carrying third-party rights',
        'Queensland Government logos and trade marks',
      ],
      lastVerified: '2026-08-31',
    },
    retrieval: { method: 'CRAWL', frequency: 'Daily, paced at 1.5 seconds a request' },
    /*
     * The licence is declared by each page in its own AGLS metadata and covers
     * the advertisement, so the factual fields and the description are all
     * within the grant.
     *
     * The withheld three are not licence questions. Queensland advertisements
     * routinely name a contact officer with a direct telephone number, which is
     * personal information the product has no reason to republish, and the
     * "unless otherwise noted" clause is exactly the kind of caveat that would
     * cover an embedded logo. Applying is done on the portal, so instructions
     * reproduced here would go stale while the original stays correct.
     */
    jobContentRights: {
      title: 'PERMITTED',
      employer: 'PERMITTED',
      location: 'PERMITTED',
      salary: 'PERMITTED',
      employmentType: 'PERMITTED',
      postedAt: 'PERMITTED',
      closingDate: 'PERMITTED',
      description: 'PERMITTED',
      contactDetails: 'WITHHELD',
      logo: 'WITHHELD',
      applicationInstructions: 'WITHHELD',
    },
    // CC BY permits adaptation, which is what aggregation is.
    permitsDerivedAggregates: true,
    notes:
      'Queensland Government job listings. Verified 2026-08-31, and the licence ' +
      'version resolved the same day. The pages carry AGLS metadata declaring ' +
      'DCTERMS.license as http://creativecommons.org/licenses/by/3.0/au/ with ' +
      'DCTERMS.creator "The State of Queensland", and the footer links the same ' +
      '3.0 AU deed. qld.gov.au/legal/copyright states CC BY 4.0 "unless otherwise ' +
      'noted", and these pages do note otherwise, so 3.0 AU governs here. Both ' +
      'permit commercial use, redistribution and adaptation with attribution, ' +
      'which makes this the only live listing source found that permits both ' +
      'republication and aggregation. The declared licence is asserted by a test ' +
      'against a captured page, so a silent change is caught. Remaining caveat: ' +
      '"unless otherwise noted" means an individual advertisement carrying third ' +
      'party material may fall outside the grant. Runs on NGA.NET; the search is ' +
      'a form POST paged by replaying server-supplied hidden fields, listing ' +
      'pages carry no JSON-LD while detail pages do, and robots.txt returns 404 ' +
      'so no crawl policy is published and the client paces itself.',
  },
  {
    key: 'jobs-wa',
    displayName: 'WA Government Jobs',
    kind: 'JOB_LISTING',
    activation: 'BLOCKED',
    complianceStatus: 'PROHIBITED',
    attributionRequired: true,
    termsUrl: 'https://www.wa.gov.au/terms-of-use',
    homepageUrl: 'https://search.jobs.wa.gov.au/',
    // A completed verification with a negative answer, which is why every
    // permission is PROHIBITED rather than UNVERIFIED. The terms were read.
    rights: {
      status: 'REFUSED',
      commercialUse: 'PROHIBITED',
      redistribution: 'PROHIBITED',
      adaptation: 'PROHIBITED',
      exclusions: ['The entire site, absent written permission from the State'],
      lastVerified: '2026-08-31',
    },
    retrieval: { method: 'NONE', frequency: 'Not retrieved' },
    permitsDerivedAggregates: false,
    notes:
      'Prohibited for this product. Read 2026-08-31: wa.gov.au/copyright redirects ' +
      'to the terms of use, which permit copying only "for your own personal use, ' +
      'for non-commercial educational purposes or for non-commercial use within ' +
      'your organisation", forbid commercially exploiting the site, and state that ' +
      '"no part may be reproduced or re-used for any commercial purposes whatsoever ' +
      'without prior written permission of the State of Western Australia". This ' +
      'product is commercial, so it is closed absent that permission. Recorded ' +
      'because it ' +
      'is otherwise the most attractive source found: 963 live jobs in a permitted ' +
      'sitemap, and JSON-LD carrying real WA planning regions and addressRegion. ' +
      'Technical quality is not the question; the licence is.',
  },
  {
    key: 'workday',
    displayName: 'Workday career sites',
    kind: 'JOB_LISTING',
    activation: 'BLOCKED',
    // Restricted rather than prohibited: the platform is open and the barrier
    // is each employer's own terms, which differ and can be negotiated.
    complianceStatus: 'RESTRICTED',
    attributionRequired: true,
    homepageUrl: 'https://www.myworkdayjobs.com/',
    // Every set of employer terms that could be located refuses republication,
    // so those two are PROHIBITED on evidence. Adaptation was never separately
    // addressed by any of them, so it stays an open question rather than being
    // inferred from the refusal beside it.
    rights: {
      status: 'NEEDS_VERIFICATION',
      commercialUse: 'PROHIBITED',
      redistribution: 'PROHIBITED',
      adaptation: 'UNVERIFIED',
      exclusions: ['Every tenant, until that employer gives written permission'],
      lastVerified: '2026-08-31',
    },
    retrieval: { method: 'NONE', frequency: 'Not retrieved' },
    permitsDerivedAggregates: false,
    notes:
      'Employer-hosted listings, one tenant per employer. Technically proven ' +
      '2026-08-31: an unauthenticated JSON endpoint returned 528 live listings ' +
      'across six Australian employers in about a minute, robots.txt allows the ' +
      'career paths, and records carry a stable jobReqId plus real start and end ' +
      'dates. The barrier is legal, not technical. The career sites carry no terms ' +
      "of their own, so each employer's site terms govern, and all four that could " +
      'be located prohibit republication without prior written consent: Lendlease ' +
      'bars any "robot, spider, other automatic device" from extracting content, ' +
      'Transurban bars reproduction and even linking, Telstra bars reproduction, ' +
      'and UQ permits personal non-commercial use only. Rio Tinto additionally ' +
      'sets Disallow on its careers path and must never be ingested. This source ' +
      'may move to ACTIVE only per employer, and only on written permission. ' +
      'CommBank and AGL terms could not be located and remain unread.',
  },
  {
    key: 'pageup',
    displayName: 'PageUp career sites',
    kind: 'JOB_LISTING',
    activation: 'BLOCKED',
    complianceStatus: 'UNVERIFIED',
    attributionRequired: true,
    homepageUrl: 'https://www.pageuppeople.com/',
    // lastVerified is null because the terms were never reached, not because
    // nobody looked. The date of the attempt is in the notes; this field means
    // "when was the position established", and it has not been.
    rights: {
      status: 'NEEDS_VERIFICATION',
      commercialUse: 'UNVERIFIED',
      redistribution: 'UNVERIFIED',
      adaptation: 'UNVERIFIED',
      exclusions: [],
      lastVerified: null,
    },
    retrieval: { method: 'NONE', frequency: 'Not retrieved' },
    permitsDerivedAggregates: false,
    notes:
      'Blocked at the platform edge. Checked 2026-08-31: eight of eight Australian ' +
      'tenants (JCU, CQU, Charles Sturt, Wollongong, Deakin, Federation, La Trobe, ' +
      'Sydney Water) return an Imperva/Incapsula challenge marked NOINDEX, NOFOLLOW. ' +
      'There is no public JSON or XML endpoint, contrary to the claim that started ' +
      'this investigation. Terms were never reached, so compliance is unverified ' +
      'rather than prohibited. PageUp operates feeds for contracted partners, so ' +
      'the route here is a commercial agreement. This matters because the blocked ' +
      'tenants are concentrated in exactly the regional universities and utilities ' +
      'the product most wants. Never attempt to defeat the challenge.',
  },
  {
    key: 'iworkfor-nsw',
    displayName: 'I Work for NSW',
    kind: 'JOB_LISTING',
    activation: 'BLOCKED',
    complianceStatus: 'UNVERIFIED',
    attributionRequired: true,
    homepageUrl: 'https://iworkfor.nsw.gov.au/',
    // nsw.gov.au material is CC BY 4.0. That statement covers nsw.gov.au and
    // not this host, so nothing is recorded as permitted here. Inheriting a
    // publisher's general policy onto a specific site is the exact assumption
    // this register exists to prevent.
    rights: {
      status: 'NEEDS_VERIFICATION',
      commercialUse: 'UNVERIFIED',
      redistribution: 'UNVERIFIED',
      adaptation: 'UNVERIFIED',
      exclusions: [],
      lastVerified: null,
    },
    retrieval: { method: 'NONE', frequency: 'Not retrieved' },
    permitsDerivedAggregates: false,
    notes:
      'Checked 2026-08-31. Serves no data without JavaScript: the homepage is a ' +
      'client-rendered shell with no server-rendered listings and no JSON-LD, and ' +
      'the copyright page returns 403, so the licence position is unestablished. ' +
      'nsw.gov.au material is CC BY 4.0, but that statement covers nsw.gov.au and ' +
      'not this host, and must not be assumed to extend here. Its robots.txt is ' +
      'worth honouring if this is ever revisited: it carries ' +
      'Content-Signal: search=yes,ai-train=no,use=reference, which permits building ' +
      'a search index and forbids training on the content, and it names ClaudeBot, ' +
      'GPTBot, CCBot and Google-Extended as disallowed. Note that the proposal that ' +
      'prompted this study cited iworkfornsw.gov.au, which does not exist.',
  },
  {
    key: 'careers-vic',
    displayName: 'Careers.vic',
    kind: 'JOB_LISTING',
    activation: 'PENDING',
    complianceStatus: 'UNVERIFIED',
    attributionRequired: true,
    homepageUrl: 'https://www.careers.vic.gov.au/',
    rights: {
      status: 'NEEDS_VERIFICATION',
      commercialUse: 'UNVERIFIED',
      redistribution: 'UNVERIFIED',
      adaptation: 'UNVERIFIED',
      exclusions: [],
      lastVerified: null,
    },
    retrieval: { method: 'NONE', frequency: 'Not retrieved' },
    permitsDerivedAggregates: false,
    notes:
      'Not yet mapped. Checked 2026-08-31: a Drupal site whose robots.txt disallows ' +
      '/search/ and /search?, which is where listings are likely to be reached, and ' +
      'no copyright or terms page could be found at the standard paths. Neither the ' +
      'listing structure nor the licence is established, so this is an open question ' +
      'rather than a negative finding.',
  },
  {
    key: 'synthetic',
    displayName: 'Development fixtures',
    kind: 'JOB_LISTING',
    activation: 'DEVELOPMENT_ONLY',
    complianceStatus: 'UNVERIFIED',
    attributionRequired: false,
    // This project generated the fixtures, so it holds the rights outright.
    // That is not a route into production: every other gate still refuses this
    // source there, and these permissions exist so development behaves the same
    // way production would rather than falling into a special case.
    rights: {
      status: 'ESTABLISHED',
      commercialUse: 'PERMITTED',
      redistribution: 'PERMITTED',
      adaptation: 'PERMITTED',
      exclusions: [],
      lastVerified: null,
    },
    retrieval: { method: 'NONE', frequency: 'Generated on demand' },
    jobContentRights: {
      title: 'PERMITTED',
      employer: 'PERMITTED',
      location: 'PERMITTED',
      salary: 'PERMITTED',
      employmentType: 'PERMITTED',
      postedAt: 'PERMITTED',
      description: 'PERMITTED',
      contactDetails: 'WITHHELD',
      logo: 'WITHHELD',
      applicationInstructions: 'WITHHELD',
    },
    // Never eligible in production, so never a basis for a published figure.
    permitsDerivedAggregates: false,
    notes:
      'Generated by this project. Describes no real employer, vacancy, salary or ' +
      'person. Never in production: the process refuses to start if it is enabled ' +
      'there. Never labelled as a real provider.',
  },
];

export function findSourceDescriptor(key: string): SourceDescriptor | undefined {
  return sourceDescriptors.find((descriptor) => descriptor.key === key);
}
