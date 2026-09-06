import { describe, expect, it } from 'vitest';
import type { Prisma } from '@/db/generated/client/client';
import { getDatabase } from '@/db/client';
import { STALE_RUN_AFTER_MS, reapStaleRuns } from '@/ingestion/stale-runs';

/**
 * Recovering the single-active-run lock.
 *
 * Written after a live crawl died when the database became briefly
 * unreachable. The handler that would have marked the run FAILED needed the
 * same database, so the row stayed RUNNING and the source could not be
 * ingested again until it was cleared by hand.
 *
 * Every case runs inside a rolled-back transaction, so a real run in progress
 * is never touched.
 */

// Environment loading is explicit here rather than global, so the unit tests
// stay pure, matching how the other database tests do it.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file. Variables may still come from the shell or the platform.
}

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const withDatabase = describe.skipIf(!hasDatabase);

class Rollback extends Error {}

const SOURCE = 'smartjobs-qld';
/**
 * A dataset name no real ingestion uses.
 *
 * The lock these tests exercise is per source **and** dataset, so borrowing the
 * real dataset name meant a live crawl and the test suite competed for the same
 * lock: running the tests while an ingestion was in progress failed both. The
 * logic under test does not care what the string is, and isolation does.
 */
const DATASET = 'test-only: stale run recovery';

withDatabase('reaping abandoned ingestion runs', () => {
  async function inTransaction<T>(
    body: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const database = getDatabase();
    if (!database.ok) throw new Error('no database');
    let captured: T | undefined;
    try {
      await database.value.$transaction(
        async (tx) => {
          captured = await body(tx);
          throw new Rollback();
        },
        { timeout: 60_000, maxWait: 30_000 },
      );
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }
    return captured as T;
  }

  it('releases the lock held by a run that never finished', async () => {
    const result = await inTransaction(async (tx) => {
      const started = new Date(Date.now() - STALE_RUN_AFTER_MS - 60_000);
      const abandoned = await tx.ingestionRun.create({
        data: {
          sourceKey: SOURCE,
          dataset: DATASET,
          status: 'RUNNING',
          triggeredBy: 'test',
          startedAt: started,
        },
        select: { id: true },
      });

      const reaped = await reapStaleRuns(tx, { sourceKey: SOURCE, dataset: DATASET });
      const after = await tx.ingestionRun.findUnique({
        where: { id: abandoned.id },
        select: { status: true, finishedAt: true, error: true },
      });

      // The lock is free, so a new run can now be created. This is the whole
      // point: without it the source is permanently un-ingestible.
      const replacement = await tx.ingestionRun.create({
        data: {
          sourceKey: SOURCE,
          dataset: DATASET,
          status: 'RUNNING',
          triggeredBy: 'test',
        },
        select: { id: true },
      });

      return { reaped, after, replacement };
    });

    expect(result.reaped).toHaveLength(1);
    expect(result.after?.status).toBe('FAILED');
    expect(result.after?.finishedAt).not.toBeNull();
    // The row keeps its own record rather than being deleted, and says why.
    expect(result.after?.error).toMatch(/abandoned/i);
    expect(result.replacement.id).toBeTruthy();
  });

  it('leaves a healthy long-running run alone', async () => {
    // Finishing late is normal. The JSA import takes about 53 minutes, and
    // killing a run that is still working would be a worse failure than
    // waiting for it.
    const result = await inTransaction(async (tx) => {
      const recent = await tx.ingestionRun.create({
        data: {
          sourceKey: SOURCE,
          dataset: DATASET,
          status: 'RUNNING',
          triggeredBy: 'test',
          startedAt: new Date(Date.now() - 60_000),
        },
        select: { id: true },
      });

      const reaped = await reapStaleRuns(tx, { sourceKey: SOURCE, dataset: DATASET });
      const after = await tx.ingestionRun.findUnique({
        where: { id: recent.id },
        select: { status: true },
      });
      return { reaped, after };
    });

    expect(result.reaped).toEqual([]);
    expect(result.after?.status).toBe('RUNNING');
  });

  it('does not touch another source holding its own lock', async () => {
    // The lock is per source and dataset. Reaping across sources would let one
    // pipeline's recovery kill another pipeline's healthy run.
    const result = await inTransaction(async (tx) => {
      const other = await tx.ingestionRun.create({
        data: {
          sourceKey: 'adzuna',
          dataset: 'Job listings',
          status: 'RUNNING',
          triggeredBy: 'test',
          startedAt: new Date(Date.now() - STALE_RUN_AFTER_MS - 60_000),
        },
        select: { id: true },
      });

      const reaped = await reapStaleRuns(tx, { sourceKey: SOURCE, dataset: DATASET });
      const after = await tx.ingestionRun.findUnique({
        where: { id: other.id },
        select: { status: true },
      });
      return { reaped, after };
    });

    expect(result.reaped).toEqual([]);
    expect(result.after?.status).toBe('RUNNING');
  });

  it('does nothing when there is nothing to reap', async () => {
    const reaped = await inTransaction((tx) =>
      reapStaleRuns(tx, { sourceKey: SOURCE, dataset: 'a dataset with no runs' }),
    );
    expect(reaped).toEqual([]);
  });
});
