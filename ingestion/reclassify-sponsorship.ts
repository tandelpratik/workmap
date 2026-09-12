import { Prisma } from '@/db/generated/client/client';
import { getDatabase } from '@/db/client';
import { sponsorshipFieldsFor } from '@/ingestion/sponsorship';
import type { SponsorshipSignal } from '@/domain/sponsorship';
import type { Failure } from '@/lib/errors';
import { ok, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';

/**
 * Re-reads every stored advertisement for sponsorship wording.
 *
 * The detector now distinguishes three strengths of offer where it once
 * reported one, and recognises a refusal stated plainly rather than only one
 * implied by negating an offer. Both changes alter what a stored row should
 * say, and neither can be applied by a migration: the answer comes from the
 * advertisement's own text, which is already in the database, so the migration
 * parks every old affirmative row on the weakest reading and this pass works
 * out what each one actually says.
 *
 * Idempotent, and cheap when there is nothing to do. A row whose signal and
 * evidence are unchanged is not written, so a second run reports zero updates
 * rather than touching every listing again.
 *
 * `contentHash` is left alone, for the reason the redaction sweep leaves it
 * alone: it is a hash of the provider's payload, not of our reading of it, and
 * the provider's payload has not changed. Sponsorship is derived from the
 * description, so the next ingestion run recomputes it anyway if the
 * description ever does change.
 *
 * Expired and withdrawn listings are included. They are no longer shown, but
 * they are still held and still queried by the data quality checks, and a
 * corpus where the retired half disagrees with the live half about what a
 * label means is a corpus nobody can reason about.
 */

/** Rows per pass. Bounded so a large catalogue does not arrive in one query. */
const BATCH_SIZE = 500;

export interface ReclassificationSweep {
  readonly examined: number;
  /** Rows changed. On a dry run, rows that would have been changed. */
  readonly updated: number;
  /** How the corpus reads afterwards, by signal. */
  readonly bySignal: Readonly<Record<string, number>>;
  readonly dryRun: boolean;
}

export interface SweepOptions {
  /**
   * Count without writing.
   *
   * The default, because this pass rewrites a published label on every listing
   * in the product. Seeing the distribution it would produce before committing
   * to it is the cheapest way to catch a detector change that went wrong.
   */
  readonly dryRun?: boolean;
}

export async function reclassifySponsorship(
  options: SweepOptions = {},
): Promise<Result<ReclassificationSweep, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;
  const prisma = database.value;

  const dryRun = options.dryRun ?? false;

  let examined = 0;
  let updated = 0;
  const bySignal = new Map<SponsorshipSignal, number>();

  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.job.findMany({
      select: {
        id: true,
        description: true,
        descriptionIsExcerpt: true,
        sponsorshipSignal: true,
        sponsorshipEvidence: true,
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    });

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.id;

    for (const row of rows) {
      examined += 1;
      const fields = sponsorshipFieldsFor(row);
      bySignal.set(
        fields.sponsorshipSignal,
        (bySignal.get(fields.sponsorshipSignal) ?? 0) + 1,
      );

      /*
       * Compared before writing, so an unchanged row costs nothing.
       *
       * The absence of evidence needs its own arm of the comparison, and the
       * first draft did not have one. `sponsorshipFieldsFor` returns
       * `Prisma.DbNull` to write a SQL NULL, which is a sentinel object rather
       * than `null`, so serialising it and comparing against the `null` that
       * comes back from the database matched nothing: the dry run reported all
       * 2,713 rows as changed, including the 2,698 whose reading was identical.
       * A pass built to write only what moved was about to rewrite the corpus.
       *
       * Evidence that does exist is compared as JSON. It is a small array of
       * two-string objects written by this same code path, so the serialised
       * forms are directly comparable, and the alternative is a deep-equality
       * helper existing only to serve this one comparison.
       */
      const signalUnchanged = row.sponsorshipSignal === fields.sponsorshipSignal;
      const next = fields.sponsorshipEvidence;
      const evidenceUnchanged =
        next === Prisma.DbNull
          ? row.sponsorshipEvidence === null
          : row.sponsorshipEvidence !== null &&
            JSON.stringify(row.sponsorshipEvidence) === JSON.stringify(next);

      if (signalUnchanged && evidenceUnchanged) continue;

      updated += 1;
      if (dryRun) continue;

      await prisma.job.update({ where: { id: row.id }, data: fields });
    }
  }

  logger.info(
    dryRun ? 'Sponsorship reclassification: dry run' : 'Sponsorship reclassification',
    { examined, updated, dryRun },
  );

  return ok({
    examined,
    updated,
    bySignal: Object.fromEntries(bySignal),
    dryRun,
  });
}
