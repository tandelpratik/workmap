import { importGeography } from '@/ingestion/geography';

/**
 * Loads the committed geography registry into the database.
 *
 * Run with: npm run geo:import
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Variables may come from the shell or the platform.
}

const EDITION = process.argv[2] ?? 'ASGS2026';

importGeography(EDITION)
  .then((outcome) => {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({ level: 'info', message: 'Import complete', ...outcome }),
    );
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
