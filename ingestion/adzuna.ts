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
import { sponsorshipFieldsFor } from './sponsorship';
import {
  australianStateCode,
  buildGeographyLookup,
  resolveGeographyAtLevel,
  type DimensionResolution,
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
  /** Locations that resolved to an official area this run, having not before. */
  readonly relinked: number;
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

/**
 * Ensures every company named on the page is in the cache, in three queries.
 *
 * The naive shape is one upsert per listing. That is 250 sequential round trips
 * for a full page, and sequential round trips are the whole cost of this job:
 * the first run through the deployed endpoint timed out at sixty seconds doing
 * exactly that. Reading what exists, creating only what does not, and reading
 * back the new ids is three queries whatever the page size.
 */
async function cacheCompanies(
  database: Database,
  caches: Caches,
  jobs: readonly NormalizedJob[],
): Promise<void> {
  const wanted = new Map<string, string>();
  for (const job of jobs) {
    if (!job.company) continue;
    const key = normalizeCompanyName(job.company.name);
    if (key !== '' && !caches.companies.has(key)) wanted.set(key, job.company.name);
  }
  if (wanted.size === 0) return;

  const existing = await database.company.findMany({
    where: { normalizedName: { in: [...wanted.keys()] } },
    select: { id: true, normalizedName: true },
  });
  for (const row of existing) {
    caches.companies.set(row.normalizedName, row.id);
    wanted.delete(row.normalizedName);
  }
  if (wanted.size === 0) return;

  // skipDuplicates guards the race with a concurrent run: the unique index is
  // the real defence, and losing the race must not fail the import.
  await database.company.createMany({
    data: [...wanted].map(([normalizedName, name]) => ({ name, normalizedName })),
    skipDuplicates: true,
  });

  const created = await database.company.findMany({
    where: { normalizedName: { in: [...wanted.keys()] } },
    select: { id: true, normalizedName: true },
  });
  for (const row of created) caches.companies.set(row.normalizedName, row.id);
}

/**
 * The same for locations, plus resolution to an official area.
 *
 * Adzuna states its hierarchy broadest first, so the country is index 0 and the
 * state index 1. Each is resolved at the level the provider placed it rather
 * than by searching every level, which is what made every Canberra
 * advertisement ambiguous: the ASGS registry holds two areas named "Australian
 * Capital Territory", the state and the SA4 inside it. Their finer entries are
 * Adzuna regions, not ASGS areas, and are never matched by name.
 */
async function cacheLocations(
  database: Database,
  caches: Caches,
  jobs: readonly NormalizedJob[],
): Promise<void> {
  interface Pending {
    readonly rawText: string;
    readonly stateCode: string | null;
    readonly geographyId: string | null;
    readonly latitude: number | null;
    readonly longitude: number | null;
  }

  const wanted = new Map<string, Pending>();

  for (const job of jobs) {
    if (!job.location) continue;
    const key = normalizeLocationKey(job.location.rawText);
    if (key === '' || caches.locations.has(key) || wanted.has(key)) continue;

    const countryName = job.location.area[0] ?? null;
    const stateName = job.location.area[1] ?? null;

    let resolved: DimensionResolution | null = null;
    if (stateName !== null) {
      resolved = resolveGeographyAtLevel(caches.geography, stateName, 'STATE');
    } else if (countryName !== null) {
      // A nationwide advertisement names only the country. That is a real
      // location, not a missing one, so it links to the country rather than
      // being dropped.
      resolved = resolveGeographyAtLevel(caches.geography, countryName, 'COUNTRY');
    }

    wanted.set(key, {
      rawText: job.location.rawText,
      stateCode: stateName === null ? null : australianStateCode(stateName),
      geographyId: resolved?.status === 'RESOLVED' ? resolved.id : null,
      latitude: job.location.latitude,
      longitude: job.location.longitude,
    });
  }
  if (wanted.size === 0) return;

  const existing = await database.location.findMany({
    where: { normalizedKey: { in: [...wanted.keys()] } },
    select: { id: true, normalizedKey: true },
  });
  for (const row of existing) {
    caches.locations.set(row.normalizedKey, row.id);
    wanted.delete(row.normalizedKey);
  }
  if (wanted.size === 0) return;

  await database.location.createMany({
    data: [...wanted].map(([normalizedKey, pending]) => ({ normalizedKey, ...pending })),
    skipDuplicates: true,
  });

  const created = await database.location.findMany({
    where: { normalizedKey: { in: [...wanted.keys()] } },
    select: { id: true, normalizedKey: true },
  });
  for (const row of created) caches.locations.set(row.normalizedKey, row.id);
}

interface PageCounts {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
}

function rowFor(job: NormalizedJob, caches: Caches, contentHash: string, now: Date) {
  const companyKey = job.company ? normalizeCompanyName(job.company.name) : null;
  const locationKey = job.location ? normalizeLocationKey(job.location.rawText) : null;

  return {
    title: job.title,
    description: job.description,
    descriptionFormat: job.descriptionFormat,
    descriptionIsExcerpt: job.descriptionIsExcerpt,
    // Derived here, beside the description it reads, so the finding cannot
    // drift from the text it describes. Recomputed on every write for the same
    // reason: an advertisement that is edited must not keep an old verdict.
    ...sponsorshipFieldsFor(job),
    companyId: companyKey === null ? null : (caches.companies.get(companyKey) ?? null),
    locationId: locationKey === null ? null : (caches.locations.get(locationKey) ?? null),
    sourceCategoryTag: job.category?.tag ?? null,
    sourceCategoryLabel: job.category?.label ?? null,
    employmentType: job.employmentType,
    sourceContractType: job.sourceContractType,
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
}

/**
 * Writes a page of listings, in a handful of queries rather than one per row.
 *
 * The content hash decides which of three paths each listing takes. The
 * unchanged ones, which are most of them on any re-run, collapse into a single
 * updateMany touching only the freshness columns.
 */
async function writePage(
  database: Database,
  caches: Caches,
  jobs: readonly NormalizedJob[],
): Promise<PageCounts> {
  if (jobs.length === 0) return { created: 0, updated: 0, unchanged: 0 };

  const now = new Date();
  const hashes = new Map(jobs.map((job) => [job.sourceId, contentHashOf(job)]));

  const existing = await database.job.findMany({
    where: {
      sourceKey: ADZUNA_SOURCE_KEY,
      sourceId: { in: jobs.map((job) => job.sourceId) },
    },
    select: { id: true, sourceId: true, contentHash: true },
  });
  const stored = new Map(existing.map((row) => [row.sourceId, row]));

  const unchangedIds: string[] = [];
  const changed: NormalizedJob[] = [];
  const fresh: NormalizedJob[] = [];

  for (const job of jobs) {
    const match = stored.get(job.sourceId);
    if (match === undefined) fresh.push(job);
    else if (match.contentHash === hashes.get(job.sourceId)) unchangedIds.push(match.id);
    else changed.push(job);
  }

  if (unchangedIds.length > 0) {
    await database.job.updateMany({
      where: { id: { in: unchangedIds } },
      data: { lastSeenAt: now, lastVerifiedAt: now, status: 'ACTIVE', expiredAt: null },
    });
  }

  // Only rows actually being written need their references resolved, so an
  // unchanged page costs nothing here either.
  const writing = [...changed, ...fresh];
  if (writing.length > 0) {
    await cacheCompanies(database, caches, writing);
    await cacheLocations(database, caches, writing);
  }

  if (fresh.length > 0) {
    await database.job.createMany({
      data: fresh.map((job) => ({
        sourceKey: job.sourceKey,
        sourceId: job.sourceId,
        ...rowFor(job, caches, hashes.get(job.sourceId) ?? '', now),
      })),
      skipDuplicates: true,
    });
  }

  // Revisions are individual by necessity: each row takes different values.
  // They are also rare, which is what makes that acceptable.
  for (const job of changed) {
    const match = stored.get(job.sourceId);
    if (match === undefined) continue;
    await database.job.update({
      where: { id: match.id },
      data: rowFor(job, caches, hashes.get(job.sourceId) ?? '', now),
    });
  }

  return {
    created: fresh.length,
    updated: changed.length,
    unchanged: unchangedIds.length,
  };
}

/**
 * Re-resolves locations that did not link to an official area last time.
 *
 * Runs every ingest, and matters because resolution improves independently of
 * the data: a fix to the matching rules, or a future geography load, should
 * heal existing rows without re-fetching anything from the provider. Nothing
 * re-resolves a location that already has a link, so this is a small query and
 * a handful of updates.
 *
 * The state code is used where one was derived, because it is unambiguous;
 * otherwise the raw text is tried at country level, which is what a nationwide
 * advertisement gives us.
 */
async function relinkUnresolvedLocations(
  database: Database,
  lookup: GeographyLookup,
): Promise<number> {
  const unresolved = await database.location.findMany({
    where: { geographyId: null },
    select: { id: true, rawText: true, stateCode: true },
  });

  let linked = 0;

  for (const location of unresolved) {
    const resolved =
      location.stateCode === null
        ? resolveGeographyAtLevel(lookup, location.rawText, 'COUNTRY')
        : resolveGeographyAtLevel(lookup, location.stateCode, 'STATE');

    if (resolved.status !== 'RESOLVED') continue;

    await database.location.update({
      where: { id: location.id },
      data: { geographyId: resolved.id },
    });
    linked += 1;
  }

  return linked;
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
  let relinked = 0;
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

        const counts = await writePage(database, caches, page_.jobs);
        created += counts.created;
        updated += counts.updated;
        unchanged += counts.unchanged;

        // A short page means the query is exhausted.
        if (page_.jobs.length + page_.rejected.length < resultsPerPage) break;
      }
    }

    relinked = await relinkUnresolvedLocations(database, caches.geography);
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
    relinked,
  });

  return ok({
    runId,
    requests,
    seen,
    created,
    updated,
    unchanged,
    quarantined,
    expired,
    relinked,
  });
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
