import type { Prisma } from '@/db/generated/client/client';
import { logger } from '@/lib/logger';

/**
 * Recovering from a run that died without saying so.
 *
 * Only one RUNNING run is allowed per source and dataset, which is what stops
 * an overlapping cron from importing twice (ADR-0005). The constraint is
 * right, but on its own it has no way back: a process that is killed, or that
 * loses the database mid-run, leaves a row saying RUNNING forever, and every
 * later run is refused by a lock held by something that no longer exists.
 *
 * That is not hypothetical. A crawl here died when the database became briefly
 * unreachable, and the handler that would have marked it FAILED needed the
 * same database, so it could not. The source was then permanently
 * un-ingestible until the row was cleared by hand. On a free tier that
 * suspends an idle database, this is a matter of when.
 *
 * So a run older than the threshold is treated as abandoned and marked FAILED,
 * releasing the lock. The threshold is deliberately generous: finishing late
 * is normal, and killing a healthy long run would be a worse failure than
 * waiting. Nothing is deleted, and the abandoned row keeps its own record.
 */

/**
 * How long a run may go without finishing before it is presumed dead.
 *
 * Two hours. The longest real run measured here was 53 minutes, so this leaves
 * more than double that before anything is touched.
 */
export const STALE_RUN_AFTER_MS = 2 * 60 * 60 * 1000;

export interface ReapedRun {
  readonly id: string;
  readonly startedAt: Date;
}

/**
 * Marks abandoned runs FAILED so a new run can start.
 *
 * Returns what it reaped, so the caller can report it rather than silently
 * stepping over someone else's wreckage: a run being abandoned is worth
 * knowing about even when the recovery works.
 */
export async function reapStaleRuns(
  database: Prisma.TransactionClient,
  options: {
    readonly sourceKey: string;
    readonly dataset: string;
    readonly staleAfterMs?: number;
    /** Injected in tests so the clock is not a source of flakiness. */
    readonly now?: Date;
  },
): Promise<readonly ReapedRun[]> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - (options.staleAfterMs ?? STALE_RUN_AFTER_MS));

  const abandoned = await database.ingestionRun.findMany({
    where: {
      sourceKey: options.sourceKey,
      dataset: options.dataset,
      status: 'RUNNING',
      startedAt: { lt: cutoff },
    },
    select: { id: true, startedAt: true },
  });

  if (abandoned.length === 0) return [];

  await database.ingestionRun.updateMany({
    where: { id: { in: abandoned.map((run) => run.id) } },
    data: {
      status: 'FAILED',
      finishedAt: now,
      error:
        'Abandoned: no completion was recorded before the staleness threshold. ' +
        'The process was most likely killed or lost the database mid-run.',
    },
  });

  logger.warn('Released the lock held by an abandoned ingestion run', {
    sourceKey: options.sourceKey,
    dataset: options.dataset,
    reaped: abandoned.map((run) => ({
      runId: run.id,
      startedAt: run.startedAt.toISOString(),
    })),
  });

  return abandoned;
}
