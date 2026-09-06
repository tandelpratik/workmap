import { getDatabase } from '../client';
import { isSyntheticAllowed } from '@/config/env';
import { failure, type Failure } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
import type {
  EmploymentType,
  JobListing,
  Salary,
  SalaryBasis,
  SalaryPeriod,
} from '@/domain/job';
import type { SponsorshipEvidence, SponsorshipSignal } from '@/domain/sponsorship';

/**
 * Job repository.
 *
 * Returns domain listings, never Prisma rows (ADR-0001). Two rules are enforced
 * here rather than trusted to callers:
 *
 *   - synthetic records are excluded unless this process explicitly permits
 *     them, so a fixture cannot reach a public response (ADR-0009);
 *   - expired listings are excluded from search, because sending an applicant
 *     to a filled advert is the worst thing a job board can do.
 *
 * There are deliberately no aggregate queries here. Counts by region, by
 * employer or by category would be exactly the "aggregation (including but not
 * limited to vacancy counts, average salaries etc)" that the Adzuna terms
 * reserve for a written licence. The one count returned is the size of a
 * result set, which is part of paginating a search rather than a published
 * statistic.
 */

export interface JobSearchQuery {
  readonly text?: string;
  readonly location?: string;
  readonly category?: string;
  readonly employmentType?: EmploymentType;
  /**
   * Restrict to advertisements carrying a particular sponsorship finding.
   *
   * A filter over what advertisements say, not over who may apply. Filtering
   * to MENTIONED narrows the list to advertisements that mention sponsorship;
   * it does not assert that anyone is eligible for anything.
   */
  readonly sponsorship?: SponsorshipSignal;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface JobSearchResult {
  readonly jobs: readonly JobListing[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

interface JobRow {
  id: string;
  title: string;
  sponsorshipSignal: string;
  /** JSON, so its shape is checked on the way out. See parseEvidence. */
  sponsorshipEvidence: unknown;
  description: string | null;
  descriptionIsExcerpt: boolean;
  employmentType: string | null;
  sourceContractType: string | null;
  salaryMin: { toString(): string } | null;
  salaryMax: { toString(): string } | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryBasis: string | null;
  sourceCategoryLabel: string | null;
  applyUrl: string;
  postedAt: Date | null;
  retrievedAt: Date;
  sourceKey: string;
  company: { name: string } | null;
  location: { rawText: string; stateCode: string | null } | null;
}

function toSalary(row: JobRow): Salary | null {
  if (row.salaryMin === null && row.salaryMax === null) return null;
  if (
    row.salaryCurrency === null ||
    row.salaryPeriod === null ||
    row.salaryBasis === null
  ) {
    // A figure without its currency, period or basis cannot be shown honestly,
    // so it is not shown at all (ADR-0002).
    return null;
  }

  return {
    min: row.salaryMin === null ? null : Number(row.salaryMin.toString()),
    max: row.salaryMax === null ? null : Number(row.salaryMax.toString()),
    currency: row.salaryCurrency,
    period: row.salaryPeriod as SalaryPeriod,
    basis: row.salaryBasis as SalaryBasis,
  };
}

/**
 * The provider's contract word, in sentence case for display.
 *
 * Only presented when it adds something: "permanent" alongside a full-time
 * schedule is the default assumption and saying it twice is noise, whereas
 * "contract" changes what someone is applying for.
 */
function contractLabel(value: string | null): string | null {
  if (value === null) return null;
  const normalised = value.trim().toLowerCase();
  if (normalised === '' || normalised === 'permanent') return null;
  return normalised.charAt(0).toUpperCase() + normalised.slice(1);
}

/**
 * Reads stored evidence back, defensively.
 *
 * The column is JSON, so its shape is not guaranteed by the database. Anything
 * unexpected yields an empty list rather than a partial quotation: showing a
 * mangled excerpt as an employer's words is worse than showing none.
 */
function parseEvidence(value: unknown): readonly SponsorshipEvidence[] {
  if (!Array.isArray(value)) return [];
  const out: SponsorshipEvidence[] = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const phrase = record['phrase'];
    const context = record['context'];
    if (typeof phrase !== 'string' || typeof context !== 'string') continue;
    out.push({ phrase, context });
  }
  return out;
}

function toDomain(row: JobRow): JobListing {
  return {
    id: row.id,
    title: row.title,
    sponsorship: {
      signal: row.sponsorshipSignal as SponsorshipSignal,
      // Stored as JSON, so it is validated on the way out rather than trusted.
      // A malformed value yields no evidence, which shows the label without a
      // quotation instead of rendering something we cannot vouch for.
      evidence: parseEvidence(row.sponsorshipEvidence),
    },
    companyName: row.company?.name ?? null,
    locationLabel: row.location?.rawText ?? null,
    stateCode: row.location?.stateCode ?? null,
    description: row.description,
    descriptionIsExcerpt: row.descriptionIsExcerpt,
    employmentType: row.employmentType as EmploymentType | null,
    contractTypeLabel: contractLabel(row.sourceContractType),
    salary: toSalary(row),
    categoryLabel: row.sourceCategoryLabel,
    applyUrl: row.applyUrl,
    postedAt: row.postedAt,
    sourceKey: row.sourceKey,
    retrievedAt: row.retrievedAt,
  };
}

const jobSelect = {
  id: true,
  sponsorshipSignal: true,
  sponsorshipEvidence: true,
  title: true,
  description: true,
  descriptionIsExcerpt: true,
  employmentType: true,
  sourceContractType: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  salaryPeriod: true,
  salaryBasis: true,
  sourceCategoryLabel: true,
  applyUrl: true,
  postedAt: true,
  retrievedAt: true,
  sourceKey: true,
  company: { select: { name: true } },
  location: { select: { rawText: true, stateCode: true } },
} as const;

export async function searchJobs(
  query: JobSearchQuery = {},
): Promise<Result<JobSearchResult, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const pageSize = Math.min(
    Math.max(1, Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE)),
    MAX_PAGE_SIZE,
  );

  const text = query.text?.trim();
  const location = query.location?.trim();

  const where = {
    status: 'ACTIVE' as const,
    // One row per vacancy. A listing grouped as a duplicate keeps its record
    // and its provenance and stops competing with the row that represents it
    // (milestone 15). Everything ungrouped is canonical by default, so this
    // filter is inert until a duplicate is actually found.
    isCanonical: true,
    // Fixtures never reach a response unless this process is explicitly a
    // development one (ADR-0009).
    ...(isSyntheticAllowed() ? {} : { isSynthetic: false }),
    ...(query.category ? { sourceCategoryTag: query.category } : {}),
    ...(query.employmentType ? { employmentType: query.employmentType } : {}),
    ...(query.sponsorship ? { sponsorshipSignal: query.sponsorship } : {}),
    ...(location
      ? {
          location: {
            is: {
              OR: [
                { rawText: { contains: location, mode: 'insensitive' as const } },
                { stateCode: { equals: location.toUpperCase() } },
              ],
            },
          },
        }
      : {}),
    ...(text
      ? {
          OR: [
            { title: { contains: text, mode: 'insensitive' as const } },
            { description: { contains: text, mode: 'insensitive' as const } },
            {
              company: { is: { name: { contains: text, mode: 'insensitive' as const } } },
            },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    database.value.job.findMany({
      where,
      select: jobSelect,
      // Newest first, with undated adverts last rather than sorted as if they
      // were ancient.
      orderBy: [{ postedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    database.value.job.count({ where }),
  ]);

  return ok({ jobs: rows.map(toDomain), total, page, pageSize });
}

export async function findJobById(id: string): Promise<Result<JobListing, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const row = await database.value.job.findFirst({
    where: {
      id,
      ...(isSyntheticAllowed() ? {} : { isSynthetic: false }),
    },
    select: jobSelect,
  });

  if (!row) return err(failure('NOT_FOUND', 'No such listing.'));
  return ok(toDomain(row));
}

export interface JobCategory {
  readonly tag: string;
  readonly label: string;
}

/**
 * The category vocabulary present in the index, for the filter control.
 *
 * Deliberately without counts. A list of categories is a filter; a list of
 * categories with a number beside each is a statistic about advertisement
 * volumes, which the Adzuna terms do not permit us to publish.
 */
export async function listJobCategories(): Promise<Result<JobCategory[], Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const rows = await database.value.job.findMany({
    where: {
      status: 'ACTIVE',
      sourceCategoryTag: { not: null },
      ...(isSyntheticAllowed() ? {} : { isSynthetic: false }),
    },
    select: { sourceCategoryTag: true, sourceCategoryLabel: true },
    distinct: ['sourceCategoryTag'],
  });

  return ok(
    rows
      .filter(
        (row): row is { sourceCategoryTag: string; sourceCategoryLabel: string | null } =>
          Boolean(row.sourceCategoryTag),
      )
      .map((row) => ({
        tag: row.sourceCategoryTag,
        label: row.sourceCategoryLabel ?? row.sourceCategoryTag,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  );
}

/** Most recent retrieval, so the UI can state how fresh the index is. */
export async function lastRetrievedAt(
  sourceKey: string,
): Promise<Result<Date | null, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const row = await database.value.job.findFirst({
    where: { sourceKey, status: 'ACTIVE' },
    select: { retrievedAt: true },
    orderBy: { retrievedAt: 'desc' },
  });

  return ok(row?.retrievedAt ?? null);
}
