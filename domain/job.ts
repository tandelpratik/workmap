import { createHash } from 'node:crypto';

/**
 * Job listing contracts (ADR-0001).
 *
 * The domain does not know that Adzuna exists. An adapter turns a provider
 * payload into a NormalizedJob, ingestion stores it, and the repository hands
 * back a JobListing. Provider vocabulary stops at the adapter boundary.
 *
 * The unions mirror Prisma's generated enums rather than importing them, for
 * the reason given in domain/source.ts. A test asserts they agree.
 */

export const employmentTypes = [
  'FULL_TIME',
  'PART_TIME',
  'CASUAL',
  'CONTRACT',
  'TEMPORARY',
  'INTERNSHIP',
  'APPRENTICESHIP',
] as const;
export type EmploymentType = (typeof employmentTypes)[number];

export const remoteTypes = ['ONSITE', 'HYBRID', 'REMOTE'] as const;
export type RemoteType = (typeof remoteTypes)[number];

export const salaryPeriods = ['HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'] as const;
export type SalaryPeriod = (typeof salaryPeriods)[number];

/**
 * Whether the employer stated a figure or the provider estimated it.
 *
 * These must never be presented identically (ADR-0002). Adzuna's estimates are
 * a branded product, Jobsworth, and carry their own labelling obligation.
 */
export const salaryBases = ['REPORTED', 'SOURCE_ESTIMATED'] as const;
export type SalaryBasis = (typeof salaryBases)[number];

export const jobStatuses = ['ACTIVE', 'EXPIRED', 'WITHDRAWN'] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const descriptionFormats = ['HTML', 'TEXT'] as const;
export type DescriptionFormat = (typeof descriptionFormats)[number];

export interface Salary {
  readonly min: number | null;
  readonly max: number | null;
  /** ISO 4217. */
  readonly currency: string;
  readonly period: SalaryPeriod;
  readonly basis: SalaryBasis;
}

export interface JobCompany {
  readonly name: string;
}

export interface JobLocation {
  /** Exactly what the source said, kept for provenance and re-resolution. */
  readonly rawText: string;
  /** The provider's own hierarchy, broadest first. May be empty. */
  readonly area: readonly string[];
  readonly latitude: number | null;
  readonly longitude: number | null;
}

/** The provider's own taxonomy, preserved rather than mapped to a guess. */
export interface SourceCategory {
  readonly tag: string;
  readonly label: string;
}

/**
 * What an adapter produces: one listing, in domain terms, before persistence.
 */
export interface NormalizedJob {
  readonly sourceKey: string;
  /** The provider's identifier. Opaque to us, and the idempotency key. */
  readonly sourceId: string;
  readonly title: string;
  readonly description: string | null;
  readonly descriptionFormat: DescriptionFormat | null;
  /**
   * Whether the description is a fragment rather than the whole advert.
   *
   * Adzuna returns a snippet, never the full text. Storing that without
   * recording it would let the UI present a truncated advert as complete,
   * which misrepresents someone's job listing.
   */
  readonly descriptionIsExcerpt: boolean;
  readonly company: JobCompany | null;
  readonly location: JobLocation | null;
  readonly employmentType: EmploymentType | null;
  /**
   * The contract relationship as the source worded it, for example
   * "permanent" or "contract".
   *
   * Kept beside employmentType rather than folded into it. Providers state the
   * relationship and the schedule independently, and a part-time contract role
   * is both: choosing one would misdescribe the job to an applicant.
   */
  readonly sourceContractType: string | null;
  readonly remoteType: RemoteType | null;
  readonly salary: Salary | null;
  /** Where an applicant is sent. A listing without one has no product value. */
  readonly applyUrl: string;
  readonly sourceUrl: string | null;
  readonly postedAt: Date | null;
  readonly category: SourceCategory | null;
}

/**
 * A listing as the product presents it, with the provenance a reader needs to
 * judge it (ADR-0002).
 */
export interface JobListing {
  readonly id: string;
  readonly title: string;
  readonly companyName: string | null;
  readonly locationLabel: string | null;
  readonly stateCode: string | null;
  readonly description: string | null;
  readonly descriptionIsExcerpt: boolean;
  readonly employmentType: EmploymentType | null;
  readonly contractTypeLabel: string | null;
  readonly salary: Salary | null;
  readonly categoryLabel: string | null;
  readonly applyUrl: string;
  readonly postedAt: Date | null;
  readonly sourceKey: string;
  readonly retrievedAt: Date;
}

/**
 * Case-folded, punctuation-stripped employer name.
 *
 * A deliberate simplification, recorded in the schema: two distinct employers
 * sharing a normalised name will merge into one row. Worth revisiting when it
 * is observed rather than assumed.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Stable key for a location, so repeated imports reuse one row. */
export function normalizeLocationKey(rawText: string): string {
  return rawText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Hash of everything that would change what a reader sees.
 *
 * Compared against the stored hash so an unchanged listing skips the write and
 * only touches lastSeenAt (ADR-0005). Timestamps we assign are excluded on
 * purpose: including retrievedAt would make every record look changed on every
 * run, which would defeat the whole mechanism.
 */
export function contentHashOf(job: NormalizedJob): string {
  const canonical = JSON.stringify([
    job.sourceKey,
    job.sourceId,
    job.title,
    job.description,
    job.descriptionFormat,
    job.descriptionIsExcerpt,
    job.company?.name ?? null,
    job.location?.rawText ?? null,
    job.location?.latitude ?? null,
    job.location?.longitude ?? null,
    job.employmentType,
    job.sourceContractType,
    job.remoteType,
    job.salary?.min ?? null,
    job.salary?.max ?? null,
    job.salary?.currency ?? null,
    job.salary?.period ?? null,
    job.salary?.basis ?? null,
    job.applyUrl,
    job.sourceUrl,
    job.postedAt?.toISOString() ?? null,
    job.category?.tag ?? null,
  ]);

  return createHash('sha256').update(canonical).digest('hex');
}

/** Whether a salary figure was estimated by the provider rather than stated. */
export function salaryIsEstimated(salary: Salary | null): boolean {
  return salary?.basis === 'SOURCE_ESTIMATED';
}
