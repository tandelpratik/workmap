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
    termsUrl: 'https://creativecommons.org/licenses/by/4.0/',
    homepageUrl: 'https://www.jobsandskills.gov.au/data/internet-vacancy-index',
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
    termsUrl: 'https://creativecommons.org/licenses/by/4.0/',
    homepageUrl:
      'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-4-july-2026-june-2031/access-and-downloads/digital-boundary-files',
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
    key: 'anzsco',
    displayName: 'Australian Bureau of Statistics',
    kind: 'CLASSIFICATION',
    activation: 'PENDING',
    complianceStatus: 'UNVERIFIED',
    attributionRequired: true,
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
    // Permitted, and the adapter is built, but nothing ingests it yet: there
    // is no ingestion module and no route into the database.
    activation: 'PENDING',
    complianceStatus: 'VERIFIED',
    attributionRequired: true,
    // CC BY requires attribution, a licence notice, a link and an indication
    // that changes were made. Stored verbatim, as with the other CC BY sources.
    // The version is 3.0 AU because that is what the pages themselves declare;
    // see the note below.
    attributionText:
      'Based on Smart Jobs and Careers data. © The State of Queensland, ' +
      'licensed under CC BY 3.0 AU. Listings have been reformatted for display.',
    termsUrl: 'https://creativecommons.org/licenses/by/3.0/au/',
    homepageUrl: 'https://smartjobs.qld.gov.au/',
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
