import type { Prisma } from '@/db/generated/client/client';
import { getDatabase } from '@/db/client';
import {
  candidateKeys,
  groupDuplicates,
  type DuplicateCandidate,
} from '@/domain/duplicate';
import type { Failure } from '@/lib/errors';
import { ok, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';

/**
 * Cross-source duplicate grouping (milestone 15).
 *
 * Runs over stored listings rather than during an import, because a duplicate
 * is a relationship between two sources and neither import can see the other.
 * It is idempotent and safe to run at any time: it recomputes every group from
 * the current rows, so a rule change takes effect on the next run without
 * anything needing to be undone.
 *
 * **Nothing is deleted or hidden here.** Every source record stays exactly as
 * its provider published it, keeps its own row, and keeps its provenance. A
 * group is an added relationship, not a merge, which is what makes a wrong
 * grouping recoverable: the listing behind it was never destroyed.
 *
 * The matching rules and the reasoning behind them live in
 * `domain/duplicate.ts`, which is pure and where the tests are.
 */

type Database = Prisma.TransactionClient;

export interface DeduplicateOptions {
  readonly db?: Database;
  /** Bound on rows examined, so a runaway table cannot produce a runaway job. */
  readonly maxJobs?: number;
}

export interface DeduplicateOutcome {
  /** Listings examined. */
  readonly examined: number;
  readonly groups: number;
  /** Listings that belong to a group, canonical members included. */
  readonly grouped: number;
  /** Listings whose grouping was withdrawn because it no longer holds. */
  readonly ungrouped: number;
  /** Groups by the signature type that produced them. */
  readonly byConfidence: Readonly<Record<string, number>>;
}

const DEFAULT_MAX_JOBS = 20_000;

export async function deduplicateJobs(
  options: DeduplicateOptions = {},
): Promise<Result<DeduplicateOutcome, Failure>> {
  let database: Database;
  if (options.db) {
    database = options.db;
  } else {
    const connection = getDatabase();
    if (!connection.ok) return connection;
    database = connection.value;
  }

  // Active listings only. An expired advertisement is kept on record but is
  // not something a reader is being shown twice.
  const rows = await database.job.findMany({
    where: { status: 'ACTIVE' },
    take: options.maxJobs ?? DEFAULT_MAX_JOBS,
    orderBy: { id: 'asc' },
    select: {
      id: true,
      sourceKey: true,
      title: true,
      description: true,
      applyUrl: true,
      sourceUrl: true,
      postedAt: true,
      duplicateGroupId: true,
      company: { select: { name: true } },
      location: { select: { rawText: true } },
    },
  });

  const candidates: DuplicateCandidate[] = rows.map((row) => {
    const keys = candidateKeys({
      companyName: row.company?.name ?? null,
      locationText: row.location?.rawText ?? null,
    });
    return {
      id: row.id,
      sourceKey: row.sourceKey,
      title: row.title,
      companyKey: keys.companyKey,
      locationKey: keys.locationKey,
      applyUrl: row.applyUrl,
      sourceUrl: row.sourceUrl,
      hasDescription: row.description !== null && row.description.trim() !== '',
      postedAt: row.postedAt,
    };
  });

  const groups = groupDuplicates(candidates);

  const byConfidence: Record<string, number> = {};
  const memberIds = new Set<string>();
  for (const group of groups) {
    byConfidence[group.confidence] = (byConfidence[group.confidence] ?? 0) + 1;
    for (const id of group.memberIds) memberIds.add(id);
  }

  // --- Write ---------------------------------------------------------------
  for (const group of groups) {
    // The signature is the identity, so re-running finds the same group rather
    // than creating a second one describing the same vacancy.
    const stored = await database.jobDuplicateGroup.upsert({
      where: { signature: group.signature },
      create: {
        signature: group.signature,
        canonicalJobId: group.canonicalId,
        memberCount: group.memberIds.length,
      },
      update: {
        canonicalJobId: group.canonicalId,
        memberCount: group.memberIds.length,
      },
      select: { id: true },
    });

    // The canonical row is the one search shows. The rest keep their own row,
    // their provenance and their link to the group, and step out of the
    // results so the same vacancy is not offered twice.
    await database.job.update({
      where: { id: group.canonicalId },
      data: { duplicateGroupId: stored.id, isCanonical: true },
    });

    const others = group.memberIds.filter((id) => id !== group.canonicalId);
    if (others.length > 0) {
      await database.job.updateMany({
        where: { id: { in: others } },
        data: { duplicateGroupId: stored.id, isCanonical: false },
      });
    }
  }

  /**
   * Withdraws groupings that no longer hold.
   *
   * A listing that was grouped and is not any more, because it expired, was
   * edited, or the rules changed, must be released. Without this, a grouping
   * decision would be permanent in practice however wrong it turned out to be,
   * and the search would keep hiding a listing whose reason for being hidden
   * had gone.
   */
  const stale = rows
    .filter((row) => row.duplicateGroupId !== null && !memberIds.has(row.id))
    .map((row) => row.id);

  if (stale.length > 0) {
    await database.job.updateMany({
      where: { id: { in: stale } },
      // Released, and visible again. A listing that stops being a duplicate
      // must come back to search, or a wrong grouping would be permanent in
      // effect even after the reason for it had gone.
      data: { duplicateGroupId: null, isCanonical: true },
    });
  }

  // Groups left with nothing pointing at them are removed, so the table
  // describes the present rather than accumulating every grouping ever made.
  const emptied = await database.jobDuplicateGroup.findMany({
    where: { jobs: { none: {} } },
    select: { id: true },
  });
  if (emptied.length > 0) {
    await database.jobDuplicateGroup.deleteMany({
      where: { id: { in: emptied.map((row) => row.id) } },
    });
  }

  const outcome: DeduplicateOutcome = {
    examined: rows.length,
    groups: groups.length,
    grouped: memberIds.size,
    ungrouped: stale.length,
    byConfidence,
  };

  logger.info('Duplicate grouping complete', { ...outcome });

  return ok(outcome);
}
