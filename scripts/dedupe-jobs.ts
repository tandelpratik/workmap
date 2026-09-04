import { deduplicateJobs } from '@/ingestion/deduplicate';

/**
 * Groups listings that describe the same vacancy.
 *
 *   npm run jobs:dedupe
 *
 * Safe to run at any time and as often as you like. Every group is recomputed
 * from the current rows, so a change to the matching rules takes effect on the
 * next run and nothing needs undoing. Nothing is deleted: a duplicate keeps its
 * own row and its provenance, and only steps out of search results.
 *
 * Run it after an ingest. A duplicate is a relationship between two sources,
 * so neither import can see one on its own.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Variables may come from the shell or the platform.
}

void deduplicateJobs()
  .then((result) => {
    if (!result.ok) {
      console.error(`${result.error.code}: ${result.error.message}`);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Duplicate grouping complete',
        ...result.value,
      }),
    );
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
