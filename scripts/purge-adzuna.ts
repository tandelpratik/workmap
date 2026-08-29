import { purgeAdzuna } from '@/ingestion/adzuna';

/**
 * Removes every Adzuna listing from the database.
 *
 *   npm run adzuna:purge -- --confirm
 *
 * This exists because their terms require it: on termination of the agreement,
 * by either party and for any reason, all data acquired from Adzuna must be
 * removed from the site immediately. Discovering how to do that under time
 * pressure is not a plan, so it is one command.
 *
 * It deletes rather than expires, which is the one place in the system where
 * that is the correct behaviour: a licence obligation to remove data is not
 * satisfied by hiding it.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Variables may come from the shell or the platform.
}

if (!process.argv.includes('--confirm')) {
  console.error(
    'This permanently deletes every Adzuna listing and cannot be undone.\n' +
      'Re-run with --confirm if that is what you intend:\n' +
      '  npm run adzuna:purge -- --confirm',
  );
  process.exit(2);
}

void purgeAdzuna()
  .then((result) => {
    if (!result.ok) {
      console.error(`${result.error.code}: ${result.error.message}`);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({ level: 'warn', message: 'Adzuna data purged', ...result.value }),
    );
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
