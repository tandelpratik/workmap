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
