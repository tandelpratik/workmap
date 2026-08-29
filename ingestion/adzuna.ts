import type { Prisma } from '@/db/generated/client/client';
import { getDatabase } from '@/db/client';
import { getAdzunaCredentials } from '@/config/env';
import { findSourceDescriptor } from '@/config/sources';
import type { GeographyLevel } from '@/domain/geography';
import {
  contentHashOf,
  normalizeCompanyName,
  normalizeLocationKey,
  type NormalizedJob,
} from '@/domain/job';
import {
  createAdzunaClient,
  MAX_RESULTS_PER_PAGE,
  type AdzunaClient,
  type AdzunaSearchParams,
} from '@/integrations/adzuna/client';
import { ADZUNA_SOURCE_KEY, mapSearchResponse } from '@/integrations/adzuna/mapper';
import { failure, type Failure } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';
import {
  australianStateCode,
  buildGeographyLookup,
  resolveGeography,
  type GeographyLookup,
} from './dimensions';

/**
 * Adzuna job ingestion (ADR-0005, ADR-0009).
 *
 * Fetches pages of advertisements, maps them to domain listings and upserts
 * them. Idempotent on (sourceKey, sourceId), with a content hash so an
 * unchanged advert costs one comparison and no write.
 *
 * The request budget is the important constraint. Adzuna's default allowance is
 * 250 hits a day and 2,500 a month, so a run takes a small number of pages and
 * stops. There is no crawling, no unbounded pagination and no retry storm: the
 * limits are a condition of access, not an obstacle.
 */

const DEFAULT_MAX_REQUESTS = 5;
const DEFAULT_EXPIRE_AFTER_DAYS = 14;
const DEFAULT_EDITION = 'ASGS2026';
const DATASET = 'Job advertisements';

type Database = Prisma.TransactionClient;

export interface AdzunaIngestOptions {
  /**
   * What to sweep. Defaults to one broad newest-first query, which is the
   * cheapest way to keep a general index current.
   */
  readonly queries?: readonly Omit<AdzunaSearchParams, 'page'>[];
  /** Hard ceiling on API requests for this run. */
  readonly maxRequests?: number;
  readonly resultsPerPage?: number;
  readonly triggeredBy?: string;
  readonly expireAfterDays?: number;
  readonly edition?: string;
  /** Injected in tests, so ingestion is exercised without a network. */
  readonly client?: AdzunaClient;
  readonly db?: Database;
}

export interface AdzunaIngestOutcome {
  readonly runId: string;
  readonly requests: number;
  readonly seen: number;
  readonly created: number;
  readonly updated: number;
  /** Unchanged since the last run: only lastSeenAt was touched. */
  readonly unchanged: number;
  readonly quarantined: number;
  readonly expired: number;
}

interface Caches {
  readonly companies: Map<string, string>;
  readonly locations: Map<string, string>;
  readonly geography: GeographyLookup;
}

async function loadGeographyLookup(
  database: Database,
  edition: string,
): Promise<GeographyLookup> {
  const rows = await database.geography.findMany({
    where: { asgsEdition: edition },
    select: { id: true, code: true, name: true, level: true },
  });

  return buildGeographyLookup(
    rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      level: row.level as GeographyLevel,
    })),
  );
}

async function resolveCompany(
  database: Database,
  caches: Caches,
  job: NormalizedJob,
): Promise<string | null> {
  if (!job.company) return null;

  const key = normalizeCompanyName(job.company.name);
  if (key === '') return null;

  const cached = caches.companies.get(key);
  if (cached !== undefined) return cached;

  const row = await database.company.upsert({
    where: { normalizedName: key },
    create: { name: job.company.name, normalizedName: key },
    update: {},
    select: { id: true },
  });

  caches.companies.set(key, row.id);
  return row.id;
}

/**
 * Finds or creates the location row, and links it to an official area when the
 * provider's own hierarchy names one.
 *
 * Adzuna states a hierarchy broadest first, so for Australia the second entry
 * is the state. Only that level is resolved: their finer entries are their own
 * regions, not ASGS areas, and matching them by name would be a guess. An
 * unresolved location keeps its raw text and stays unresolved rather than being
 * attached to a plausible parent.
 */
async function resolveLocation(
  database: Database,
  caches: Caches,
  job: NormalizedJob,
): Promise<string | null> {
  if (!job.location) return null;

  const key = normalizeLocationKey(job.location.rawText);
  if (key === '') return null;

  const cached = caches.locations.get(key);
  if (cached !== undefined) return cached;

  const stateName = job.location.area[1] ?? null;
  const resolved =
    stateName === null
      ? null
      : resolveGeography(caches.geography, { code: null, name: stateName });

  const data = {
    stateCode: stateName === null ? null : australianStateCode(stateName),
    geographyId: resolved?.status === 'RESOLVED' ? resolved.id : null,
    latitude: job.location.latitude,
    longitude: job.location.longitude,
  };

  const row = await database.location.upsert({
    where: { normalizedKey: key },
    create: { rawText: job.location.rawText, normalizedKey: key, ...data },
    update: data,
    select: { id: true },
  });

  caches.locations.set(key, row.id);
  return row.id;
}

type WriteOutcome = 'created' | 'updated' | 'unchanged';

async function writeJob(
  database: Database,
  caches: Caches,
  job: NormalizedJob,
): Promise<WriteOutcome> {
  const contentHash = contentHashOf(job);
  const now = new Date();

  const existing = await database.job.findUnique({
    where: { sourceKey_sourceId: { sourceKey: job.sourceKey, sourceId: job.sourceId } },
    select: { id: true, contentHash: true },
  });

  if (existing && existing.contentHash === contentHash) {
    // Unchanged. Touching only the freshness columns keeps a daily re-run cheap,
    // which matters on both the API budget and the database row budget.
    await database.job.update({
      where: { id: existing.id },
      data: { lastSeenAt: now, lastVerifiedAt: now, status: 'ACTIVE', expiredAt: null },
    });
    return 'unchanged';
  }

  const companyId = await resolveCompany(database, caches, job);
  const locationId = await resolveLocation(database, caches, job);

  const data = {
    title: job.title,
    description: job.description,
    descriptionFormat: job.descriptionFormat,
    descriptionIsExcerpt: job.descriptionIsExcerpt,
    companyId,
    locationId,
    sourceCategoryTag: job.category?.tag ?? null,
    sourceCategoryLabel: job.category?.label ?? null,
    employmentType: job.employmentType,
    remoteType: job.remoteType,
    salaryMin: job.salary?.min ?? null,
    salaryMax: job.salary?.max ?? null,
    salaryCurrency: job.salary?.currency ?? null,
    salaryPeriod: job.salary?.period ?? null,
    salaryBasis: job.salary?.basis ?? null,
    applyUrl: job.applyUrl,
    sourceUrl: job.sourceUrl,
    postedAt: job.postedAt,
    contentHash,
    // Real provider data. The synthetic flag exists so fixtures can never be
    // served in production, and this is not a fixture (ADR-0009).
    isSynthetic: false,
    lastSeenAt: now,
    lastVerifiedAt: now,
    retrievedAt: now,
    status: 'ACTIVE' as const,
    expiredAt: null,
  };

  if (existing) {
    await database.job.update({ where: { id: existing.id }, data });
    return 'updated';
  }

  await database.job.create({
    data: { sourceKey: job.sourceKey, sourceId: job.sourceId, ...data },
  });
  return 'created';
}

/**
 * Marks listings we have stopped seeing as expired.
 *
 * They are not deleted. An expired advert leaves search but stays on record,
 * because deleting it would destroy the first-seen history that any later trend
 * work depends on (ADR-0005).
 */
async function expireStale(database: Database, expireAfterDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - expireAfterDays * 24 * 60 * 60 * 1000);

  const result = await database.job.updateMany({
    where: { sourceKey: ADZUNA_SOURCE_KEY, status: 'ACTIVE', lastSeenAt: { lt: cutoff } },
    data: { status: 'EXPIRED', expiredAt: new Date() },
  });

  return result.count;
}

export async function ingestAdzuna(
  options: AdzunaIngestOptions = {},
): Promise<Result<AdzunaIngestOutcome, Failure>> {
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const expireAfterDays = options.expireAfterDays ?? DEFAULT_EXPIRE_AFTER_DAYS;
  const edition = options.edition ?? DEFAULT_EDITION;
  const resultsPerPage = options.resultsPerPage ?? MAX_RESULTS_PER_PAGE;

  let database: Database;
  if (options.db) {
    database = options.db;
  } else {
    const connection = getDatabase();
    if (!connection.ok) return connection;
    database = connection.value;
  }

  // --- Gates ---------------------------------------------------------------
  const source = await database.source.findUnique({ where: { key: ADZUNA_SOURCE_KEY } });
  if (!source) {
    return err(
      failure(
        'NOT_CONFIGURED',
        `Source "${ADZUNA_SOURCE_KEY}" is not registered. Run the seed before ingesting.`,
      ),
    );
  }
  if (source.activation !== 'ACTIVE' || source.complianceStatus !== 'VERIFIED') {
    return err(
      failure(
        'FORBIDDEN',
        `Source "${ADZUNA_SOURCE_KEY}" is ${source.activation} / ${source.complianceStatus}. ` +
          'Both must permit use before ingesting. See docs/compliance/SOURCE_REGISTER.md',
      ),
    );
  }

  const credentials = getAdzunaCredentials();
  if (!credentials && !options.client) {
    return err(
      failure(
        'NOT_CONFIGURED',
        'No Adzuna credentials are configured. Set ADZUNA_APP_ID and ADZUNA_APP_KEY.',
      ),
    );
  }

  const descriptor = findSourceDescriptor(ADZUNA_SOURCE_KEY);
  const client =
    options.client ??
    createAdzunaClient({
      // Unreachable when credentials are absent: the guard above returns first.
      credentials: credentials ?? { appId: '', appKey: '', country: 'au' },
      ...(descriptor?.rateLimit
        ? {
            requestsPerWindow: descriptor.rateLimit.requests,
            windowMs: descriptor.rateLimit.perSeconds * 1000,
          }
        : {}),
    });

  const country = credentials?.country ?? 'au';
  // One broad, newest-first sweep by default. A general index is best served by
  // the most recent advertisements, and it costs one request per page.
  const queries = options.queries ?? [{ sortBy: 'date' as const }];

  // --- Run -----------------------------------------------------------------
  let runId: string;
  try {
    const run = await database.ingestionRun.create({
      data: {
        sourceKey: ADZUNA_SOURCE_KEY,
        dataset: DATASET,
        status: 'RUNNING',
        triggeredBy: options.triggeredBy ?? 'manual',
      },
      select: { id: true },
    });
    runId = run.id;
  } catch {
    return err(
      failure(
        'SOURCE_UNAVAILABLE',
        'An Adzuna ingestion run is already in progress. Wait for it to finish, or clear the stalled run.',
      ),
    );
  }

  let seen = 0;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let quarantined = 0;
  let expired = 0;
  let requests = 0;

  try {
    const caches: Caches = {
      companies: new Map(),
      locations: new Map(),
      geography: await loadGeographyLookup(database, edition),
    };

    outer: for (const query of queries) {
      for (let page = 1; ; page += 1) {
        if (requests >= maxRequests) break outer;

        const response = await client.search({ ...query, page, resultsPerPage });
        requests += 1;

        if (!response.ok) {
          // A provider failure part-way through is not a reason to discard the
          // pages that succeeded. The run records what happened and stops.
          await database.ingestionError.create({
            data: {
              runId,
              sourceKey: ADZUNA_SOURCE_KEY,
              kind: 'TRANSPORT',
              message: `${response.error.code}: ${response.error.message}`,
            },
          });
          quarantined += 1;
          break outer;
        }

        const page_ = mapSearchResponse(response.value, country);
        seen += page_.jobs.length + page_.rejected.length;

        for (const rejected of page_.rejected) {
          await database.ingestionError.create({
            data: {
              runId,
              sourceKey: ADZUNA_SOURCE_KEY,
              sourceId: rejected.sourceId,
              kind: 'VALIDATION',
              message: rejected.reason,
              rawPayload: rejected.raw as Prisma.InputJsonValue,
            },
          });
          quarantined += 1;
        }

        for (const job of page_.jobs) {
          const outcome = await writeJob(database, caches, job);
          if (outcome === 'created') created += 1;
          else if (outcome === 'updated') updated += 1;
          else unchanged += 1;
        }

        // A short page means the query is exhausted.
        if (page_.jobs.length + page_.rejected.length < resultsPerPage) break;
      }
    }

    expired = await expireStale(database, expireAfterDays);

    await database.ingestionRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        recordsSeen: seen,
        recordsWritten: created + updated,
        recordsSkipped: unchanged,
        recordsQuarantined: quarantined,
      },
    });
  } catch (error) {
    await database.ingestionRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        recordsSeen: seen,
        recordsWritten: created + updated,
        recordsSkipped: unchanged,
        recordsQuarantined: quarantined,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }

  logger.info('Adzuna ingestion complete', {
    runId,
    requests,
    seen,
    created,
    updated,
    unchanged,
    quarantined,
    expired,
  });

  return ok({ runId, requests, seen, created, updated, unchanged, quarantined, expired });
}

/**
 * Removes every Adzuna record from the database.
 *
 * Their terms require it: "Upon termination of this agreement, for any reason
 * and by either party, an API user shall immediately remove all insertion codes
 * and data acquired from Adzuna from all pages of its web sites." This is the
 * mechanism that makes that a one-command operation rather than a scramble.
 */
export async function purgeAdzuna(
  db?: Database,
): Promise<Result<{ deleted: number }, Failure>> {
  let database: Database;
  if (db) {
    database = db;
  } else {
    const connection = getDatabase();
    if (!connection.ok) return connection;
    database = connection.value;
  }

  const result = await database.job.deleteMany({
    where: { sourceKey: ADZUNA_SOURCE_KEY },
  });
  logger.warn('Adzuna data purged', { deleted: result.count });
  return ok({ deleted: result.count });
}
