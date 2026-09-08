import type { PrismaClient } from '@/db/generated/client/client';
import { getDatabase } from '@/db/client';
import { lifecycle } from '@/config/lifecycle';
import { sourceDescriptors, findSourceDescriptor } from '@/config/sources';
import { isProductionEligible } from '@/domain/source';
import type { Failure } from '@/lib/errors';
import { ok, type Result } from '@/lib/result';

/**
 * Whether the sources are still working.
 *
 * Ingestion has recorded runs, cursors, counters and quarantined records since
 * milestone 05, and nothing has ever read them back. Two crawlers run on
 * schedules nobody watches: Adzuna nightly on Vercel Cron, Queensland at two in
 * the morning on GitHub Actions. If either stopped, the first symptom would be a
 * reader noticing the listings had gone stale, and the second would be nobody
 * noticing at all.
 *
 * This is the read side of that. It answers, per source: when did it last
 * succeed, when did it last fail, how much did it bring back, how much is
 * quarantined, and how old is what it holds.
 *
 * Deliberately not a public page. Run counts and error rates are operational
 * facts about this project rather than labour market information, and a couple
 * of them are close enough to the aggregate figures the Adzuna terms reserve
 * that publishing them would be an argument nobody needs to have. It is a
 * command, and its output is for whoever runs the thing.
 */

export type Health = 'HEALTHY' | 'STALE' | 'FAILING' | 'SILENT' | 'NOT_RUN';

export interface SourceHealth {
  readonly sourceKey: string;
  readonly displayName: string;
  readonly health: Health;
  /** Why it is not healthy, in one line. Null when it is. */
  readonly reason: string | null;
  /**
   * Whether silence from this source is a fault. False for a monthly file
   * import, which is supposed to sit still between releases.
   */
  readonly scheduled: boolean;

  readonly lastSuccessAt: Date | null;
  readonly lastFailureAt: Date | null;
  readonly lastFailureMessage: string | null;
  /** A run that claimed the source and never finished. */
  readonly runningSince: Date | null;

  /** Listings currently held and served. */
  readonly activeListings: number;
  /** Oldest verification among them: how stale the corpus is at worst. */
  readonly oldestVerifiedAt: Date | null;
  /** Records the last run could not parse, which is how a source change shows. */
  readonly quarantinedRecently: number;

  readonly recordsWritten: number;
  readonly recordsSeen: number;
}

export interface HealthReport {
  readonly sources: readonly SourceHealth[];
  readonly ok: boolean;
  readonly checkedAt: Date;
}

/**
 * How long a scheduled source may go without a successful run before it is
 * silent.
 *
 * The crawlers run daily, so a day and a half is one missed run plus slack.
 */
const STALE_AFTER_HOURS = 36;

/**
 * Whether a source is expected to run on a schedule at all.
 *
 * The first run of this check reported Jobs and Skills Australia as silent for
 * 190 hours, which was true and was not a fault: it is a monthly workbook an
 * operator downloads and imports, and it is *supposed* to sit still between
 * releases. A monitor that reports a healthy source as broken every day but one
 * a month is a monitor everybody learns to ignore, which is worse than not
 * having one.
 *
 * So the expectation comes from the registry's own retrieval method rather than
 * from one global constant. An API or a crawl is scheduled and its silence is a
 * fact worth acting on; a file download or a manual import is not, and for those
 * the last run is reported without a verdict attached to its age.
 */
function isScheduled(sourceKey: string): boolean {
  const method = findSourceDescriptor(sourceKey)?.retrieval?.method;
  return method === 'API' || method === 'CRAWL';
}

/** How far back to look for quarantined records. */
const QUARANTINE_WINDOW_HOURS = 48;

const HOUR_MS = 60 * 60 * 1000;

function hoursSince(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / HOUR_MS;
}

/**
 * The verdict, from the facts.
 *
 * Order matters, and it is the order of what an operator should act on first. A
 * source that is failing needs attention whatever else is true of it; one that
 * has never run is a configuration problem rather than an incident; and a source
 * holding listings nothing has confirmed for longer than they survive is on its
 * way to emptying itself.
 */
function verdict(
  facts: Omit<
    SourceHealth,
    'health' | 'reason' | 'sourceKey' | 'displayName' | 'scheduled'
  >,
  options: { readonly scheduled: boolean },
  now: Date,
): { health: Health; reason: string | null } {
  const { lastSuccessAt, lastFailureAt, oldestVerifiedAt, quarantinedRecently } = facts;

  if (lastSuccessAt === null && lastFailureAt === null) {
    return { health: 'NOT_RUN', reason: 'No ingestion run has ever been recorded.' };
  }

  // A failure since the last success, or no success at all.
  if (
    lastFailureAt !== null &&
    (lastSuccessAt === null || lastFailureAt > lastSuccessAt)
  ) {
    return {
      health: 'FAILING',
      reason: 'The most recent run failed.',
    };
  }

  if (lastSuccessAt === null) {
    return { health: 'NOT_RUN', reason: 'No run has ever succeeded.' };
  }

  const hours = hoursSince(lastSuccessAt, now);
  if (options.scheduled && hours > STALE_AFTER_HOURS) {
    return {
      health: 'SILENT',
      reason: `No successful run for ${String(Math.floor(hours))} hours.`,
    };
  }

  if (
    options.scheduled &&
    oldestVerifiedAt !== null &&
    hoursSince(oldestVerifiedAt, now) > lifecycle.expireAfterDays * 24
  ) {
    return {
      health: 'STALE',
      reason:
        'Listings are held that no run has confirmed within the expiry window, so ' +
        'they are being retired rather than refreshed.',
    };
  }

  if (quarantinedRecently > 0) {
    return {
      health: 'STALE',
      reason:
        `${String(quarantinedRecently)} records could not be parsed recently, which ` +
        'is usually how a source changing its shape first appears.',
    };
  }

  return { health: 'HEALTHY', reason: null };
}

async function healthOf(
  db: PrismaClient,
  sourceKey: string,
  now: Date,
): Promise<SourceHealth> {
  const descriptor = findSourceDescriptor(sourceKey);

  const [lastSuccess, lastFailure, running, listings, oldest, quarantined] =
    await Promise.all([
      db.ingestionRun.findFirst({
        where: { sourceKey, status: 'COMPLETED' },
        orderBy: { finishedAt: 'desc' },
        select: { finishedAt: true, recordsWritten: true, recordsSeen: true },
      }),
      db.ingestionRun.findFirst({
        where: { sourceKey, status: 'FAILED' },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true, finishedAt: true, error: true },
      }),
      db.ingestionRun.findFirst({
        where: { sourceKey, status: 'RUNNING' },
        orderBy: { startedAt: 'asc' },
        select: { startedAt: true },
      }),
      db.job.count({ where: { sourceKey, status: 'ACTIVE' } }),
      db.job.findFirst({
        where: { sourceKey, status: 'ACTIVE', lastVerifiedAt: { not: null } },
        orderBy: { lastVerifiedAt: 'asc' },
        select: { lastVerifiedAt: true },
      }),
      db.ingestionError.count({
        where: {
          sourceKey,
          occurredAt: {
            gte: new Date(now.getTime() - QUARANTINE_WINDOW_HOURS * HOUR_MS),
          },
        },
      }),
    ]);

  const facts = {
    lastSuccessAt: lastSuccess?.finishedAt ?? null,
    lastFailureAt: lastFailure?.finishedAt ?? lastFailure?.startedAt ?? null,
    // Stored redacted by the ingestion layer, which is where that guarantee
    // belongs; nothing here needs to re-redact it.
    lastFailureMessage: lastFailure?.error ?? null,
    runningSince: running?.startedAt ?? null,
    activeListings: listings,
    oldestVerifiedAt: oldest?.lastVerifiedAt ?? null,
    quarantinedRecently: quarantined,
    recordsWritten: lastSuccess?.recordsWritten ?? 0,
    recordsSeen: lastSuccess?.recordsSeen ?? 0,
  };

  return {
    sourceKey,
    displayName: descriptor?.displayName ?? sourceKey,
    scheduled: isScheduled(sourceKey),
    ...facts,
    ...verdict(facts, { scheduled: isScheduled(sourceKey) }, now),
  };
}

/**
 * Health for every source that is supposed to be running.
 *
 * Blocked and pending sources are skipped rather than reported as never having
 * run, which is true of them and is not a problem: they are switched off on
 * purpose, and listing eight permanent warnings is how a report gets ignored.
 */
export async function checkSourceHealth(): Promise<Result<HealthReport, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const now = new Date();
  const watched = sourceDescriptors.filter(
    (descriptor) =>
      isProductionEligible(descriptor) &&
      (descriptor.kind === 'JOB_LISTING' || descriptor.kind === 'MARKET_INDICATOR'),
  );

  const sources = await Promise.all(
    watched.map((descriptor) => healthOf(database.value, descriptor.key, now)),
  );

  return ok({
    sources,
    ok: sources.every((source) => source.health === 'HEALTHY'),
    checkedAt: now,
  });
}

/** Exported for tests, so the verdict rules are verifiable without a database. */
export const __testing = { verdict, STALE_AFTER_HOURS };
