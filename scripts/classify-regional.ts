import { classifyStoredLocations } from '@/ingestion/regional';
import { regionalAreas } from '@/config/regional-areas';

/**
 * Places every stored location against the designated regional area
 * instrument.
 *
 *   npm run regional:classify                counts, and writes nothing
 *   npm run regional:classify -- --apply     writes the classifications
 *   npm run regional:classify -- --apply --force   reclassifies every row
 *
 * The default is the dry run, so an operator sees what the instrument makes of
 * the corpus before anything is written. Applying it is safe to repeat: a
 * location already decided under the instrument now in force is skipped.
 *
 * `--force` is for the case where the transcription is corrected rather than
 * the instrument amended. Nothing looks stale then, because the identifier has
 * not changed, and every answer still needs taking again.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Variables may come from the shell or the platform.
}

const apply = process.argv.includes('--apply');
const force = process.argv.includes('--force');

void classifyStoredLocations({ dryRun: !apply, force })
  .then((result) => {
    if (!result.ok) {
      console.error(`${result.error.code}: ${result.error.message}`);
      process.exit(1);
    }

    const { considered, classified, skipped, byStatus } = result.value;

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          level: 'info',
          message: apply
            ? 'Regional classification written'
            : 'Regional classification: dry run, nothing written',
          instrument: regionalAreas.instrument.id,
          considered,
          classified,
          skipped,
          byStatus,
        },
        null,
        2,
      ),
    );
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
