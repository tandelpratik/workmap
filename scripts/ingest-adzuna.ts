import { ingestAdzuna } from '@/ingestion/adzuna';

/**
 * Fetches a batch of Adzuna advertisements into the index.
 *
 *   npm run adzuna:ingest
 *   npm run adzuna:ingest -- --max-requests=10 --what="registered nurse"
 *
 * The request budget is the point of the flags. Adzuna's default allowance is
 * 250 hits a day and 2,500 a month, so this takes a few pages and stops rather
 * than paginating until the data runs out.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Variables may come from the shell or the platform.
}

const args = process.argv.slice(2);
const named = new Map(
  args
    .filter((arg) => arg.startsWith('--') && arg.includes('='))
    .map((arg) => {
      const at = arg.indexOf('=');
      return [arg.slice(2, at), arg.slice(at + 1)] as const;
    }),
);

const maxRequests = Number(named.get('max-requests') ?? '5');
const what = named.get('what');
const where = named.get('where');

void ingestAdzuna({
  maxRequests: Number.isFinite(maxRequests) ? maxRequests : 5,
  triggeredBy: 'manual',
  ...(what !== undefined || where !== undefined
    ? {
        queries: [
          {
            sortBy: 'date' as const,
            ...(what === undefined ? {} : { what }),
            ...(where === undefined ? {} : { where }),
          },
        ],
      }
    : {}),
})
  .then((result) => {
    if (!result.ok) {
      console.error(`${result.error.code}: ${result.error.message}`);
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        { level: 'info', message: 'Adzuna ingest', ...result.value },
        null,
        2,
      ),
    );
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
