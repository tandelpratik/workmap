import { getDatabase } from '@/db/client';
import { redactPersonalInformation } from '@/domain/personal-information';
import type { Failure } from '@/lib/errors';
import { ok, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';

/**
 * Removes contact details from listings stored before the filter existed.
 *
 * Ingestion now strips them on the way in, which protects everything collected
 * from that point on and nothing collected before it. This is the one-off pass
 * over the back catalogue, and it is written to be safe to run repeatedly: a
 * description with nothing to remove is not rewritten at all.
 *
 * `contentHash` is deliberately left alone. It was computed over the original
 * text, so it will not match the hash the next ingestion run computes over the
 * redacted text, and that listing will take the "changed" path and be rewritten
 * once with a correct hash. That is the outcome wanted. Recomputing the hash
 * here would need the whole normalised record, which no longer exists, and
 * inventing one from the stored columns would produce a hash that matched
 * nothing on either side.
 *
 * Expired listings are included. They are no longer displayed, but they are
 * still held, and minimisation is about what is kept rather than about what is
 * currently on screen.
 */

/** Rows per pass. Bounded so a large catalogue does not arrive in one query. */
const BATCH_SIZE = 500;

export interface RedactionSweep {
  readonly examined: number;
  /** Rows changed. On a dry run, rows that would have been changed. */
  readonly rewritten: number;
  readonly removals: number;
  readonly dryRun: boolean;
}

export interface SweepOptions {
  /**
   * Count without writing.
   *
   * This pass is not reversible: the original text is replaced and is not kept
   * anywhere, which is the entire point of it. So the default is to look first,
   * and an operator has to ask for the write.
   */
  readonly dryRun?: boolean;
}

export async function redactStoredListings(
  options: SweepOptions = {},
): Promise<Result<RedactionSweep, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const dryRun = options.dryRun ?? false;

  let examined = 0;
  let rewritten = 0;
  let removals = 0;
  let cursor: string | undefined;

  for (;;) {
    const rows = await database.value.job.findMany({
      where: { description: { not: null } },
      select: { id: true, description: true, sourceKey: true },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    });

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.id;

    for (const row of rows) {
      examined += 1;
      if (row.description === null) continue;

      const result = redactPersonalInformation(row.description);
      if (result.redactions.length === 0) continue;

      if (!dryRun) {
        await database.value.job.update({
          where: { id: row.id },
          data: { description: result.text },
        });
      }
      rewritten += 1;
      removals += result.redactions.length;
    }

    if (rows.length < BATCH_SIZE) break;
  }

  // The listing identifiers are not logged. Which advertisements carried a
  // contact detail is exactly the information this sweep exists to stop
  // retaining, and writing it into a log would move it rather than remove it.
  logger.info('Contact detail sweep complete', { examined, rewritten, removals, dryRun });

  return ok({ examined, rewritten, removals, dryRun });
}
