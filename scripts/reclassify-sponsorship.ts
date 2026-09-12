import { reclassifySponsorship } from '@/ingestion/reclassify-sponsorship';

/**
 * Re-reads every stored advertisement for sponsorship wording.
 *
 *   npm run sponsorship:reclassify                counts, and writes nothing
 *   npm run sponsorship:reclassify -- --apply     rewrites the labels
 *
 * Run it once after deploying a change to the detector. Ingestion handles
 * everything collected from that point on.
 *
 * The default is the dry run because this rewrites a published label on every
 * listing in the product. The dry run prints the distribution it would produce,
 * which is the cheapest way to notice that a pattern change has quietly moved a
 * thousand listings into the wrong tier: the shape of the corpus is known, so a
 * surprise in the shape is a bug in the detector.
 *
 * Safe to repeat. A row whose reading has not changed is not written.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Variables may come from the shell or the platform.
}

const dryRun = !process.argv.includes('--apply');

void reclassifySponsorship({ dryRun })
  .then((result) => {
    if (!result.ok) {
      console.error(`${result.error.code}: ${result.error.message}`);
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          level: 'info',
          message: dryRun
            ? 'Sponsorship reclassification: dry run, nothing written'
            : 'Sponsorship reclassification complete',
          ...result.value,
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
