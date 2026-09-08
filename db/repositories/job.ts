import { getDatabase } from '../client';
import { isSyntheticAllowed } from '@/config/env';
import { findSourceDescriptor } from '@/config/sources';
import { mayRepublishField } from '@/domain/source';
import { isStateAbbreviation } from '@/domain/geography';
import type { Failure } from '@/lib/errors';
import { ok, type Result } from '@/lib/result';
import type {
  EmploymentType,
  JobListing,
  JobStatus,
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
  /**
   * Restrict to one source.
   *
   * A provenance filter, not a quality one. The two live sources are not
   * interchangeable: one is an aggregator's index of advertisements and the
   * other is a state government's own board, and a reader deciding how much
   * weight to give a listing may reasonably want only one of them.
   */
  readonly source?: string;
  /**
   * Restrict to advertisements posted within this many days.
   *
   * Measured from the employer's posting date, which every stored listing
   * carries, and never from when this site discovered it. A crawl backfilling a
   * corpus would otherwise make the whole of it look freshly posted.
   */
  readonly postedWithinDays?: number;
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
  lastVerifiedAt: Date | null;
  firstSeenAt: Date;
  status: string;
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

/**
 * Whether this source's rights matrix permits reproducing advertisement text.
 *
 * Decided here rather than in a component, for the same reason the synthetic
 * and expiry rules are decided here: a rule enforced at one boundary is a rule,
 * and a rule enforced at each call site is a habit. An unknown source key
 * yields no descriptor and therefore no permission, which is the direction that
 * fails safely.
 */
function mayShowDescription(sourceKey: string): boolean {
  const descriptor = findSourceDescriptor(sourceKey);
  return descriptor !== undefined && mayRepublishField(descriptor, 'description');
}

function toDomain(row: JobRow): JobListing {
  const descriptionPermitted = mayShowDescription(row.sourceKey);

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
    description: descriptionPermitted ? row.description : null,
    descriptionIsExcerpt: row.descriptionIsExcerpt,
    // Only withheld when there was something to withhold. A source we may not
    // quote and an advertisement with no text produce the same empty space, and
    // saying "withheld" over the second would be a claim about a listing that
    // never had a description.
    descriptionWithheld: !descriptionPermitted && row.description !== null,
    employmentType: row.employmentType as EmploymentType | null,
    contractTypeLabel: contractLabel(row.sourceContractType),
    salary: toSalary(row),
    categoryLabel: row.sourceCategoryLabel,
    applyUrl: row.applyUrl,
    postedAt: row.postedAt,
    lastVerifiedAt: row.lastVerifiedAt,
    firstSeenAt: row.firstSeenAt,
    status: row.status as JobStatus,
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
  lastVerifiedAt: true,
  firstSeenAt: true,
  status: true,
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
    ...(query.source ? { sourceKey: query.source } : {}),
    ...(query.postedWithinDays === undefined
      ? {}
      : {
          postedAt: {
            gte: new Date(Date.now() - query.postedWithinDays * 24 * 60 * 60 * 1000),
          },
        }),
    /*
     * A location term is one of two questions, and answering the wrong one is
     * how "NT" came to return Queensland listings.
     *
     * A state abbreviation is matched against the resolved state and nothing
     * else. Two letters are a substring of a great many Australian place
     * names: "NT" sits inside Central, Mount and Sunshine, so a text match
     * for the Northern Territory returned Central West Qld. Anything else is a
     * place name, which is exactly what a substring match is for, and it keeps
     * matching the state code as well so "Queensland" still works.
     */
    ...(location
      ? isStateAbbreviation(location)
        ? { location: { is: { stateCode: { equals: location.trim().toUpperCase() } } } }
        : {
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
export interface JobCategory {
  readonly tag: string;
  readonly label: string;
}
/**
 * Which sources currently hold listings.
 *
 * Deliberately without counts, for the same reason the category list is: a list
 * of sources is a filter vocabulary, and a list of sources with a number beside
 * each is a statistic about advertisement volumes by provider, which the Adzuna
 * terms do not permit us to publish.
 *
 * Read so the source filter can offer only what is actually there. A control
 * listing a source holding nothing is a control with a setting that always
 * returns nothing.
 */
export async function listIndexedSources(): Promise<Result<string[], Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  /*
   * groupBy rather than findMany with distinct.
   *
   * Prisma applies `distinct` in the application, so the findMany form asks the
   * database for every matching row's source key and throws almost all of them
   * away locally: 2,713 strings across the wire to learn that there are two
   * sources. groupBy compiles to a real GROUP BY and returns the two.
   *
   * The queries themselves are around a millisecond either way, so this is not
   * about time. It is about not paying to transfer a thousandfold more rows
   * than the answer needs, on a free tier that meters exactly that.
   */
  const rows = await database.value.job.groupBy({
    by: ['sourceKey'],
    where: {
      status: 'ACTIVE',
      isCanonical: true,
      ...(isSyntheticAllowed() ? {} : { isSynthetic: false }),
    },
  });

  return ok(
    rows
      .map((row) => row.sourceKey)
      .sort((a, b) =>
        (findSourceDescriptor(a)?.displayName ?? a).localeCompare(
          findSourceDescriptor(b)?.displayName ?? b,
        ),
      ),
  );
}

/**
 * When each source last confirmed its listings were still live.
 *
 * Keyed by source rather than reduced to one figure, because one figure was the
 * bug. The jobs page took Adzuna's most recent retrieval and printed it above a
 * page that might be showing Queensland listings crawled a week apart, which
 * told a reader something about freshness that was not true of what they were
 * looking at.
 *
 * `lastVerifiedAt` rather than `retrievedAt`: verified means the source
 * confirmed the advertisement, retrieved means this record was written. Only
 * the first is a statement about the job (ADR-0002).
 */
export async function lastVerifiedBySource(
  sourceKeys: readonly string[],
): Promise<Result<ReadonlyMap<string, Date>, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;
  if (sourceKeys.length === 0) return ok(new Map());

  const rows = await database.value.job.groupBy({
    by: ['sourceKey'],
    where: {
      sourceKey: { in: [...sourceKeys] },
      status: 'ACTIVE',
      ...(isSyntheticAllowed() ? {} : { isSynthetic: false }),
    },
    _max: { lastVerifiedAt: true },
  });

  const freshness = new Map<string, Date>();
  for (const row of rows) {
    const verified = row._max.lastVerifiedAt;
    if (verified !== null) freshness.set(row.sourceKey, verified);
  }

  return ok(freshness);
}
