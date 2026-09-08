import type { EmploymentType, NormalizedJob } from '@/domain/job';
import type { SmartJobsJobDetail, SmartJobsSearchRow } from './types';

/**
 * Smart Jobs to domain (ADR-0001).
 *
 * Provider vocabulary stops here. Anything the portal states that the domain
 * has no field for is dropped rather than forced into an approximate one.
 */

export const SOURCE_KEY = 'smartjobs-qld';

/**
 * schema.org tokens the portal emits, mapped to the domain's own union.
 *
 * Only exact tokens are mapped. An unfamiliar token yields null, because a
 * wrong employment type misinforms an applicant about the job they are
 * applying for.
 */
const employmentTypeByToken: Readonly<Record<string, EmploymentType>> = {
  FULL_TIME: 'FULL_TIME',
  PART_TIME: 'PART_TIME',
  CONTRACTOR: 'CONTRACT',
  TEMPORARY: 'TEMPORARY',
  INTERN: 'INTERNSHIP',
  OTHER: 'CASUAL',
};

export function toEmploymentType(tokens: readonly string[]): EmploymentType | null {
  for (const token of tokens) {
    const mapped = employmentTypeByToken[token.trim().toUpperCase()];
    // A listing that is both full-time and part-time is common here. The first
    // recognised token wins, and the portal's own wording is preserved
    // separately in sourceContractType so nothing is lost.
    if (mapped) return mapped;
  }
  return null;
}

/** Dates arrive as ISO strings. An unparseable one is absent, never today. */
export function toDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Builds the location the domain stores.
 *
 * `rawText` keeps exactly what the portal said, so a listing can be re-placed
 * later without refetching. `area` is broadest first: the state, then each
 * region the portal named. Coordinates are null because the portal publishes
 * none, and inventing a centroid here would be a fabricated coordinate.
 */
function toLocation(localities: readonly string[]): NormalizedJob['location'] {
  if (localities.length === 0) return null;
  return {
    rawText: localities.join(', '),
    area: ['Queensland', ...localities],
    latitude: null,
    longitude: null,
  };
}

/**
 * Combines a search row with its detail page.
 *
 * Both are required. The detail page holds the stable reference and the dates;
 * the row holds the regions, because the portal's JSON-LD publishes an empty
 * `jobLocation`. Neither alone produces a complete listing.
 */
export function toNormalizedJob(
  row: SmartJobsSearchRow,
  detail: SmartJobsJobDetail,
): NormalizedJob {
  // The detail page's own field is preferred; the row is the fallback, since
  // the two are rendered from the same record and the row is never richer.
  const localities = detail.localities.length > 0 ? detail.localities : row.localities;

  return {
    sourceKey: SOURCE_KEY,
    // The portal's published reference, not the row counter. The counter
    // addresses a position in a result set and would duplicate on reordering.
    sourceId: detail.reference,
    title: detail.title,
    description: detail.description,
    descriptionFormat: detail.description ? 'TEXT' : null,
    // The JSON-LD description is the advertisement's own text as published,
    // not a truncation of it.
    descriptionIsExcerpt: false,
    company: detail.employer ? { name: detail.employer } : null,
    location: toLocation(localities),
    employmentType: toEmploymentType(detail.employmentTypes),
    // The portal's exact phrasing, for example "Fixed Term Temporary
    // Full-time,Part-time". Kept whole rather than parsed into a guess.
    sourceContractType: row.employmentText,
    // The portal publishes no remote indicator. "Flexible" appears as a
    // location, and reading it as remote work would be an assumption.
    remoteType: null,
    // Salary is rendered on the detail page as free text across several
    // fields (yearly, fortnightly, total remuneration). Parsing it is a
    // separate piece of work; a wrong salary is worse than no salary.
    salary: null,
    applyUrl: row.detailUrl,
    sourceUrl: row.detailUrl,
    postedAt: toDate(detail.datePosted),
    category: null,
  };
}
