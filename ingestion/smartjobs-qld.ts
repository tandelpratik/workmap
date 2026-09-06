import type { Prisma } from '@/db/generated/client/client';
import { getDatabase } from '@/db/client';
import type { GeographyLevel } from '@/domain/geography';
import {
  contentHashOf,
  normalizeCompanyName,
  normalizeLocationKey,
  type NormalizedJob,
} from '@/domain/job';
import {
  SmartJobsClient,
  SmartJobsBudgetReached,
  SmartJobsRequestError,
} from '@/integrations/smartjobs-qld/client';
import { SOURCE_KEY, toNormalizedJob } from '@/integrations/smartjobs-qld/mapper';
import { SmartJobsParseError } from '@/integrations/smartjobs-qld/parser';
import { findRegion } from '@/integrations/smartjobs-qld/regions';
import type {
  SmartJobsJobDetail,
  SmartJobsSearchPage,
  SmartJobsSearchRow,
} from '@/integrations/smartjobs-qld/types';
import { failure, type Failure } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';
import { sponsorshipFieldsFor } from './sponsorship';
import { reapStaleRuns } from './stale-runs';
import {
  buildGeographyLookup,
  resolveGeographyAtLevel,
  type GeographyLookup,
} from './dimensions';

/**
 * Smart Jobs and Careers ingestion (ADR-0005, ADR-0009).
 *
 * The portal publishes no API, so a listing costs two requests: the search
 * page it appears on, and its own detail page, which is where the stable
 * reference `QLD/164089` and the dates live. Roughly two thousand vacancies are
 * advertised at a time, so fetching every detail on every run would be four
 * thousand requests against a public service that publishes no rate limit and
 * asks for nothing. That is not a budget question, it is a manners question.
 *
 * So a run does the least it can. It pages the search results, which are cheap
 * and carry the region vocabulary, and it fetches a detail page only for a
 * listing it has not already stored, or one whose stored copy has gone stale.
 * Everything else is a freshness touch and no request at all. A second run
 * minutes later costs one search page.
 *
 * The request budget is a hard ceiling rather than a target. A run stops when
 * it is reached, records what it did, and leaves the rest for the next one:
 * partial progress that accumulates is the correct shape for a crawler that is
 * a guest on someone else's server.
 */

const DEFAULT_MAX_REQUESTS = 40;
const DEFAULT_REFRESH_AFTER_DAYS = 7;
const DEFAULT_EXPIRE_AFTER_DAYS = 14;
const DEFAULT_EDITION = 'ASGS2026';
const DATASET = 'Job advertisements';

type Database = Prisma.TransactionClient;

/** Only what this module needs, so a test can supply a page and a detail. */
export interface SmartJobsSource {
  searchFirstPage(): Promise<SmartJobsSearchPage>;
  searchNextPage(form: Readonly<Record<string, string>>): Promise<SmartJobsSearchPage>;
  fetchJobDetail(detailUrl: string): Promise<SmartJobsJobDetail>;
  readonly requestsMade: number;
}

export interface SmartJobsIngestOptions {
  /** Hard ceiling on HTTP requests for this run, search and detail together. */
  readonly maxRequests?: number;
  /**
   * How many listings to write at a time. Test seam: the property worth
   * proving is that an interrupted run keeps what it had already written, and
   * demonstrating it needs a batch smaller than the fixture.
   */
  readonly writeBatchSize?: number;
  /** How old a stored listing may be before its detail page is read again. */
  readonly refreshAfterDays?: number;
  readonly expireAfterDays?: number;
  readonly edition?: string;
  readonly triggeredBy?: string;
  /** Milliseconds between requests, passed to the client when one is built. */
  readonly delayMs?: number;
  /** Injected in tests, so ingestion is exercised without a network. */
  readonly client?: SmartJobsSource;
  readonly db?: Database;
}

export interface SmartJobsIngestOutcome {
  readonly runId: string;
  readonly requests: number;
  /** The portal's own count of advertised vacancies, for context. */
  readonly reportedTotal: number;
  /** Rows read from search pages. */
  readonly seen: number;
  /** Detail pages fetched, which is the expensive part. */
  readonly detailsFetched: number;
  /** Listings already stored and recent enough to leave alone. */
  readonly skippedFresh: number;
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly quarantined: number;
  readonly expired: number;
  /** Regions the portal named that the adapter does not map. */
  readonly unknownRegions: readonly string[];
  /**
   * Whether the run stopped because it spent its request budget.
   *
   * Reported so a partial run is legible as partial. Without it, a run that
   * covered a tenth of the portal looks the same as one that covered all of
   * it, and the difference matters when reading how fresh the listings are.
   */
  readonly stoppedOnBudget: boolean;
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
 * Places a listing, using the portal's closed region vocabulary.
 *
 * This is the whole reason this source was worth building. The portal names a
 * region from a fixed list, `regions.ts` maps that name to an ABS SA4 name that
 * was checked against the imported registry, and resolution is a lookup rather
 * than a guess at free text.
 *
 * A listing naming several regions is placed at the first one that maps. That
 * is a real limitation and it is recorded rather than hidden: the raw text
 * keeps every region the portal named, so a later milestone can place a listing
 * in more than one area without refetching anything.
 *
 * An unmapped region falls back to the state, never to an approximation. The
 * constitution forbids inventing a geography mapping, and "close to Cairns" is
 * an invention.
 */
function resolveLocation(
  lookup: GeographyLookup,
  localities: readonly string[],
): { geographyId: string | null; unknown: readonly string[] } {
  const unknown: string[] = [];

  for (const locality of localities) {
    const region = findRegion(locality);
    if (region === undefined) {
      unknown.push(locality);
      continue;
    }
    if (region.sa4Name === null) continue;

    const resolved = resolveGeographyAtLevel(lookup, region.sa4Name, 'SA4');
    if (resolved.status === 'RESOLVED') {
      return { geographyId: resolved.id, unknown };
    }
  }

  // Every listing is a Queensland Government vacancy, so the state is known
  // even when the region is not. That is a fact from the source, not a guess.
  const state = resolveGeographyAtLevel(lookup, 'Queensland', 'STATE');
  return { geographyId: state.status === 'RESOLVED' ? state.id : null, unknown };
}

async function cacheLocations(
  database: Database,
  caches: Caches,
  jobs: readonly NormalizedJob[],
  unknownRegions: Set<string>,
): Promise<void> {
  interface Pending {
    readonly rawText: string;
    readonly geographyId: string | null;
  }

  const wanted = new Map<string, Pending>();

  for (const job of jobs) {
    if (!job.location) continue;
    const key = normalizeLocationKey(job.location.rawText);
    if (key === '' || caches.locations.has(key) || wanted.has(key)) continue;

    // area[0] is the state the mapper puts there; the rest are portal regions.
    const localities = job.location.area.slice(1);
    const placed = resolveLocation(caches.geography, localities);
    for (const name of placed.unknown) unknownRegions.add(name);

    wanted.set(key, { rawText: job.location.rawText, geographyId: placed.geographyId });
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
    data: [...wanted].map(([normalizedKey, pending]) => ({
      normalizedKey,
      rawText: pending.rawText,
      // Every listing on this portal is a Queensland Government vacancy, so
      // the state is a fact about the source rather than a parse of the text.
      stateCode: 'QLD',
      geographyId: pending.geographyId,
      // The portal publishes no coordinates, and a centroid would be invented.
      latitude: null,
      longitude: null,
    })),
    skipDuplicates: true,
  });

  const created = await database.location.findMany({
    where: { normalizedKey: { in: [...wanted.keys()] } },
    select: { id: true, normalizedKey: true },
  });
  for (const row of created) caches.locations.set(row.normalizedKey, row.id);
}

function rowFor(job: NormalizedJob, caches: Caches, contentHash: string, now: Date) {
  const companyKey = job.company ? normalizeCompanyName(job.company.name) : '';
  const locationKey = job.location ? normalizeLocationKey(job.location.rawText) : '';

  return {
    title: job.title,
    description: job.description,
    descriptionFormat: job.descriptionFormat,
    descriptionIsExcerpt: job.descriptionIsExcerpt,
    // Derived here, beside the description it reads, so the finding cannot
    // drift from the text it describes. Recomputed on every write for the same
    // reason: an advertisement that is edited must not keep an old verdict.
    ...sponsorshipFieldsFor(job),
    companyId: companyKey === '' ? null : (caches.companies.get(companyKey) ?? null),
    locationId: locationKey === '' ? null : (caches.locations.get(locationKey) ?? null),
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
    // Real published data, not a fixture (ADR-0009).
    isSynthetic: false,
    lastSeenAt: now,
    lastVerifiedAt: now,
    retrievedAt: now,
    status: 'ACTIVE' as const,
    expiredAt: null,
  };
}

interface WriteCounts {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
}

async function writeJobs(
  database: Database,
  caches: Caches,
  jobs: readonly NormalizedJob[],
  unknownRegions: Set<string>,
): Promise<WriteCounts> {
  if (jobs.length === 0) return { created: 0, updated: 0, unchanged: 0 };

  const now = new Date();
  const hashes = new Map(jobs.map((job) => [job.sourceId, contentHashOf(job)]));

  const existing = await database.job.findMany({
    where: { sourceKey: SOURCE_KEY, sourceId: { in: jobs.map((job) => job.sourceId) } },
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

  const writing = [...changed, ...fresh];
  if (writing.length > 0) {
    await cacheCompanies(database, caches, writing);
    await cacheLocations(database, caches, writing, unknownRegions);
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
 * Marks listings we have stopped seeing as expired.
 *
 * They are not deleted. An expired advert leaves search but stays on record,
 * because deleting it destroys the first-seen history any later trend work
 * needs (ADR-0005).
 */
async function expireStale(database: Database, expireAfterDays: number): Promise<number> {
  const cutoff = new Date(Date.now() - expireAfterDays * 24 * 60 * 60 * 1000);

  const result = await database.job.updateMany({
    where: { sourceKey: SOURCE_KEY, status: 'ACTIVE', lastSeenAt: { lt: cutoff } },
    data: { status: 'EXPIRED', expiredAt: new Date() },
  });

  return result.count;
}

/**
 * How many listings are written at a time.
 *
 * Small enough that a dropped connection costs at most this many fetches, and
 * large enough that the write is not a round trip per listing. The database is
 * in another region, so each flush is worth several hundred milliseconds.
 */
const WRITE_BATCH_SIZE = 25;

export async function ingestSmartJobsQld(
  options: SmartJobsIngestOptions = {},
): Promise<Result<SmartJobsIngestOutcome, Failure>> {
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const refreshAfterDays = options.refreshAfterDays ?? DEFAULT_REFRESH_AFTER_DAYS;
  const expireAfterDays = options.expireAfterDays ?? DEFAULT_EXPIRE_AFTER_DAYS;
  const edition = options.edition ?? DEFAULT_EDITION;

  let database: Database;
  if (options.db) {
    database = options.db;
  } else {
    const connection = getDatabase();
    if (!connection.ok) return connection;
    database = connection.value;
  }

  // --- Gates ---------------------------------------------------------------
  const source = await database.source.findUnique({ where: { key: SOURCE_KEY } });
  if (!source) {
    return err(
      failure(
        'NOT_CONFIGURED',
        `Source "${SOURCE_KEY}" is not registered. Run the seed before ingesting.`,
      ),
    );
  }
  if (source.activation !== 'ACTIVE' || source.complianceStatus !== 'VERIFIED') {
    return err(
      failure(
        'FORBIDDEN',
        `Source "${SOURCE_KEY}" is ${source.activation} / ${source.complianceStatus}. ` +
          'Both must permit use before ingesting. See docs/compliance/SOURCE_REGISTER.md',
      ),
    );
  }

  const client: SmartJobsSource =
    options.client ??
    new SmartJobsClient({
      maxRequests,
      ...(options.delayMs === undefined ? {} : { delayMs: options.delayMs }),
    });

  // --- Run -----------------------------------------------------------------
  let runId: string;
  try {
    // A run that died without recording it holds the single-active-run lock
    // forever. Released here rather than requiring someone to clear a row by
    // hand, because the failure that causes it is a dropped connection, which
    // is routine on a database that suspends when idle.
    await reapStaleRuns(database, { sourceKey: SOURCE_KEY, dataset: DATASET });

    const run = await database.ingestionRun.create({
      data: {
        sourceKey: SOURCE_KEY,
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
        'A Smart Jobs ingestion run is already in progress. Wait for it to finish, or clear the stalled run.',
      ),
    );
  }

  let requests = 0;
  let reportedTotal = 0;
  let seen = 0;
  let detailsFetched = 0;
  let skippedFresh = 0;
  let quarantined = 0;
  /** Whether the run ended because it spent its budget rather than finished. */
  let stoppedOnBudget = false;
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let expired = 0;
  const unknownRegions = new Set<string>();

  const quarantine = async (message: string, sourceId: string | null): Promise<void> => {
    quarantined += 1;
    await database.ingestionError.create({
      data: {
        runId,
        sourceKey: SOURCE_KEY,
        sourceId,
        kind: 'VALIDATION',
        message,
      },
    });
  };

  try {
    const caches: Caches = {
      companies: new Map(),
      locations: new Map(),
      geography: await loadGeographyLookup(database, edition),
    };

    // --- Search pages ------------------------------------------------------
    const rows: SmartJobsSearchRow[] = [];
    let page: SmartJobsSearchPage | null = null;

    try {
      page = await client.searchFirstPage();
      requests += 1;
      reportedTotal = page.total;
      rows.push(...page.rows);

      while (page.nextPageForm !== null && requests < maxRequests) {
        page = await client.searchNextPage(page.nextPageForm);
        requests += 1;
        rows.push(...page.rows);
      }
      // Pages remain but the budget does not. Same event as the client's own
      // ceiling, so it is recorded the same way: the run is partial, and says
      // so, rather than looking like a complete crawl of a small portal.
      if (page.nextPageForm !== null) stoppedOnBudget = true;
    } catch (error) {
      // Reaching our own ceiling is how a bounded run is meant to end. It
      // leaves the remaining pages for the next run and is not a fault of the
      // source, so it is not recorded as one: a quarantine record has to mean
      // "this data was wrong", or the number stops being worth watching.
      if (error instanceof SmartJobsBudgetReached) {
        stoppedOnBudget = true;
      } else {
        // A transport or parse failure part way through does not discard the
        // pages that succeeded. The run records it and works with what it has.
        await database.ingestionError.create({
          data: {
            runId,
            sourceKey: SOURCE_KEY,
            kind: error instanceof SmartJobsParseError ? 'VALIDATION' : 'TRANSPORT',
            message: error instanceof Error ? error.message : String(error),
          },
        });
        quarantined += 1;
      }
    }

    seen = rows.length;

    // --- Which listings need their detail page reading ---------------------
    //
    // The search row cannot produce a listing on its own: the stable reference
    // lives on the detail page. What the row does carry is the URL, which is
    // already stored on everything imported before, so a listing seen recently
    // needs no request at all.
    const urls = rows.map((row) => row.detailUrl);
    const known =
      urls.length === 0
        ? []
        : await database.job.findMany({
            where: { sourceKey: SOURCE_KEY, sourceUrl: { in: urls } },
            select: { id: true, sourceUrl: true, lastVerifiedAt: true },
          });

    const staleAfter = new Date(Date.now() - refreshAfterDays * 24 * 60 * 60 * 1000);
    const freshById = new Map<string, string>();
    for (const row of known) {
      // Never verified means never fetched, so it is not fresh.
      if (
        row.sourceUrl !== null &&
        row.lastVerifiedAt !== null &&
        row.lastVerifiedAt > staleAfter
      ) {
        freshById.set(row.sourceUrl, row.id);
      }
    }

    const touchIds: string[] = [];
    const toFetch: SmartJobsSearchRow[] = [];
    for (const row of rows) {
      const fresh = freshById.get(row.detailUrl);
      if (fresh !== undefined) {
        touchIds.push(fresh);
        skippedFresh += 1;
      } else {
        toFetch.push(row);
      }
    }

    // Still advertised, so still current, and it cost no request to know.
    if (touchIds.length > 0) {
      const now = new Date();
      await database.job.updateMany({
        where: { id: { in: touchIds } },
        data: { lastSeenAt: now, status: 'ACTIVE', expiredAt: null },
      });
    }

    // --- Detail pages, within the budget -----------------------------------
    //
    // Written in batches as they are fetched, not accumulated and written at
    // the end. A run that held everything in memory lost all of it when the
    // connection dropped, which happened twice: an hour of polite crawling
    // produced nothing, and the next run had to fetch the same pages again.
    // Committing as it goes means an interrupted run still leaves its work
    // behind, and the next run skips what is already stored.
    const pending: NormalizedJob[] = [];

    const batchSize = Math.max(1, options.writeBatchSize ?? WRITE_BATCH_SIZE);

    const flush = async (): Promise<void> => {
      if (pending.length === 0) return;
      const counts = await writeJobs(database, caches, pending, unknownRegions);
      created += counts.created;
      updated += counts.updated;
      unchanged += counts.unchanged;
      pending.length = 0;
    };

    for (const row of toFetch) {
      if (requests >= maxRequests) {
        stoppedOnBudget = true;
        break;
      }

      try {
        const detail = await client.fetchJobDetail(row.detailUrl);
        requests += 1;
        detailsFetched += 1;
        pending.push(toNormalizedJob(row, detail));
        if (pending.length >= batchSize) await flush();
      } catch (error) {
        // No request was made, so it does not count against the budget, and
        // there is nothing left to spend: stop rather than walk the remaining
        // rows only to fail on each one.
        if (error instanceof SmartJobsBudgetReached) {
          stoppedOnBudget = true;
          break;
        }
        requests += 1;
        if (
          error instanceof SmartJobsRequestError ||
          error instanceof SmartJobsParseError
        ) {
          await quarantine(`${row.detailUrl}: ${error.message}`, row.rowRef);
          continue;
        }
        throw error;
      }
    }

    // Whatever the loop ended on, budget or exhaustion, the remainder is kept.
    await flush();

    expired = await expireStale(database, expireAfterDays);

    await database.ingestionRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        recordsSeen: seen,
        recordsWritten: created + updated,
        recordsSkipped: unchanged + skippedFresh,
        recordsQuarantined: quarantined,
      },
    });
  } catch (error) {
    // Recording the failure needs the database, and the most likely reason a
    // long run fails is that the database went away. When that happens this
    // update throws too, and its error replaces the real one: the operator is
    // told the connection dropped while trying to write, and never told what
    // the run was actually doing.
    //
    // So the bookkeeping is allowed to fail quietly and the original error is
    // always the one that propagates. The row is left RUNNING, which the stale
    // run reaper releases on the next attempt.
    try {
      await database.ingestionRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          recordsSeen: seen,
          recordsWritten: created + updated,
          recordsSkipped: unchanged + skippedFresh,
          recordsQuarantined: quarantined,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    } catch (bookkeeping) {
      logger.warn('Could not record the failure of this run', {
        runId,
        // Both are reported: which one is the cause matters when reading this
        // later, and the second is usually the same outage as the first.
        cause: error instanceof Error ? error.message : String(error),
        while_recording:
          bookkeeping instanceof Error ? bookkeeping.message : String(bookkeeping),
      });
    }
    throw error;
  }

  const outcome: SmartJobsIngestOutcome = {
    runId,
    requests,
    reportedTotal,
    seen,
    detailsFetched,
    skippedFresh,
    created,
    updated,
    unchanged,
    quarantined,
    expired,
    unknownRegions: [...unknownRegions].sort(),
    stoppedOnBudget,
  };

  logger.info('Smart Jobs ingestion complete', {
    runId,
    requests,
    reportedTotal,
    seen,
    detailsFetched,
    skippedFresh,
    created,
    updated,
    quarantined,
    unknownRegions: outcome.unknownRegions.length,
    stoppedOnBudget,
  });

  return ok(outcome);
}
