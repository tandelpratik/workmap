import { getDatabase } from '@/db/client';
import { regionalAreas } from '@/config/regional-areas';
import { classifyPlace } from '@/domain/regional';
import type { RegionalClassification } from '@/domain/regional';
import {
  buildRegionLookup,
  classifyByRegions,
  loadRegionArtefact,
  type RegionLookup,
} from './region-inheritance';
import type { Failure } from '@/lib/errors';
import { ok, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';

/**
 * Places every stored location against the designated regional area
 * instrument.
 *
 * Runs over locations rather than jobs, and the difference is not incidental:
 * 2,713 advertisements share 375 places between them, so classifying the place
 * once is seven times less work and, more importantly, cannot produce two
 * listings in the same suburb with different answers.
 *
 * Idempotent, and cheap to repeat. A location already decided under the current
 * instrument is skipped, so the ordinary run touches only what is new. Two
 * things make a row eligible again: a postcode arriving where there was none,
 * and the instrument being amended, which changes the identifier stored on the
 * row and makes every row decided under the old one visibly stale.
 *
 * That second case is why the instrument identifier is a column rather than an
 * assumption. An amended instrument must not leave rows silently claiming to
 * have been decided under a version that no longer exists.
 */

export interface ClassificationOutcome {
  readonly considered: number;
  readonly classified: number;
  readonly skipped: number;
  readonly byStatus: Readonly<Record<string, number>>;
}

/**
 * Which rows still need an answer under the instrument now in force.
 *
 * Two things make a row eligible. The obvious one is never having been decided
 * under this instrument. The second is a postcode arriving after the fact: a
 * location settled by its state, or not settled at all, carries an answer taken
 * without the one piece of information the instrument actually asks for, and a
 * postcode resolution run leaves a great many rows in exactly that position.
 * Checking only the instrument identifier would leave every one of them holding
 * a weaker answer than the data now supports.
 */
function needsClassification(row: {
  readonly regionalInstrument: string | null;
  readonly postcode: string | null;
  readonly regionalBasis: string;
}): boolean {
  if (row.regionalInstrument !== regionalAreas.instrument.id) return true;
  // Never settled at all. Re-asking costs one lookup and can only improve on
  // "we could not place this", whether because data arrived or because a rule
  // did. A row holding no answer is the one row always worth asking again.
  if (row.regionalBasis === 'NONE') return true;
  return row.postcode !== null && row.regionalBasis !== 'POSTCODE';
}

/**
 * The region rule, applied only where the postcode rule found nothing.
 *
 * Order matters and is one way. A postcode is the instrument's own unit and a
 * region is a inference from the postcodes inside it, so a location that has
 * both is settled by the postcode. Nothing here ever overrides an answer the
 * stronger rule already gave.
 */
function regionVerdict(
  lookup: RegionLookup | null,
  rawText: string,
): RegionalClassification | null {
  if (lookup === null) return null;

  const status = classifyByRegions(lookup, rawText);
  if (status === null || status === 'UNKNOWN') return null;

  return {
    status,
    // No category. A region is settled by agreement among its postcodes, and
    // those postcodes can sit in different categories while agreeing that all
    // of them are regional. Naming one would be picking a statute section that
    // only some of the area answers to.
    category: null,
    basis: 'REGION',
    reason:
      `Every postcode in the region this listing names falls the same side of ` +
      `${regionalAreas.instrument.id}, so the region settles it. Regions holding ` +
      'postcodes on both sides settle nothing.',
  };
}

/**
 * Classifies stored locations.
 *
 * `force` reclassifies every row rather than only the stale ones. It exists for
 * the case where the transcription itself is corrected: the instrument
 * identifier has not changed, so nothing looks stale, and yet every answer
 * needs taking again.
 */
export async function classifyStoredLocations(
  options: { readonly force?: boolean; readonly dryRun?: boolean } = {},
): Promise<Result<ClassificationOutcome, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;
  const prisma = database.value;

  const rows = await prisma.location.findMany({
    select: {
      id: true,
      rawText: true,
      postcode: true,
      stateCode: true,
      regionalInstrument: true,
      regionalBasis: true,
    },
  });

  /*
   * The region artefact, loaded once and treated as optional.
   *
   * A deployment that has not built it should still be able to classify by
   * postcode and by state rather than refusing to run, so its absence is
   * reported and the weaker rules carry on. Making it mandatory would mean a
   * missing build artefact silently unclassified the whole corpus.
   */
  let regions: RegionLookup | null = null;
  try {
    const artefact = await loadRegionArtefact();
    const registryAreas = await prisma.geography.findMany({
      where: { level: 'SA4' },
      select: { code: true, name: true },
    });
    regions = buildRegionLookup(artefact, registryAreas);
  } catch (error) {
    logger.warn('Region artefact unavailable, classifying without it', {
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  const byStatus: Record<string, number> = {};
  let classified = 0;
  let skipped = 0;

  for (const row of rows) {
    if (options.force !== true && !needsClassification(row)) {
      skipped += 1;
      continue;
    }

    const byInstrument = classifyPlace(regionalAreas, {
      postcode: row.postcode,
      jurisdiction: row.stateCode,
    });

    /*
     * The region rule sits between the postcode and the state.
     *
     * It is consulted only where the instrument could not settle the place on
     * its own, which means the location has no postcode. Where it can answer it
     * is better than the state rule, because a region is a smaller thing than a
     * state; where it cannot, the state answer stands.
     */
    const result: RegionalClassification =
      byInstrument.status === 'UNKNOWN'
        ? (regionVerdict(regions, row.rawText) ?? byInstrument)
        : byInstrument;

    const key = `${result.status}/${result.basis}`;
    byStatus[key] = (byStatus[key] ?? 0) + 1;

    if (options.dryRun === true) {
      classified += 1;
      continue;
    }

    await prisma.location.update({
      where: { id: row.id },
      data: {
        regionalStatus: result.status,
        regionalCategory: result.category,
        regionalBasis: result.basis,
        /*
         * Stamped even on an UNKNOWN answer. "We asked the instrument and it
         * could not place this" is a decision that was taken, and recording it
         * is what stops the next run asking the same unanswerable question of
         * the same row for ever.
         */
        regionalInstrument: regionalAreas.instrument.id,
        regionalClassifiedAt: new Date(),
      },
    });
    classified += 1;
  }

  logger.info('Regional classification complete', {
    instrument: regionalAreas.instrument.id,
    considered: rows.length,
    classified,
    skipped,
    dryRun: options.dryRun === true,
  });

  return ok({ considered: rows.length, classified, skipped, byStatus });
}
