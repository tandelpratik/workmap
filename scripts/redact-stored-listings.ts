import { redactStoredListings } from '@/ingestion/redact-stored';

/**
 * Strips contact details from listings collected before the filter existed.
 *
 *   npm run jobs:redact                counts, and writes nothing
 *   npm run jobs:redact -- --apply     performs the removal
 *
 * The default is the dry run because this pass is not reversible: the original
 * text is replaced and is kept nowhere, which is the point of it. Counting
 * first also tells an operator whether there is anything to do.
 *
 * Applying it is safe to repeat. A description with nothing to remove is left
 * untouched, so a second run reports zero rewrites rather than doing anything
 * twice.
 *
 * Run it once after deploying the minimisation filter. Ingestion handles
 * everything collected from that point on.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Variables may come from the shell or the platform.
}

const dryRun = !process.argv.includes('--apply');

void redactStoredListings({ dryRun })
  .then((result) => {
    if (!result.ok) {
      console.error(`${result.error.code}: ${result.error.message}`);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: 'info',
        message: dryRun
          ? 'Contact detail sweep: dry run, nothing written'
          : 'Contact detail sweep complete',
        ...result.value,
      }),
    );
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
