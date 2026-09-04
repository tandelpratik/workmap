import { ingestSmartJobsQld } from '@/ingestion/smartjobs-qld';

/**
 * Ingests Queensland Smart Jobs vacancies.
 *
 *   npm run qld:ingest
 *   npm run qld:ingest -- --max-requests=10 --delay-ms=3000
 *
 * This crawls a live public service that publishes no API and no rate limit.
 * The defaults are deliberately unhurried and the request budget is a hard
 * ceiling: a run stops when it is reached and leaves the rest for the next one.
 * Raising the budget is a decision about someone else's server, so it is a
 * flag rather than a constant.
 *
 * The source must be ACTIVE and VERIFIED before this does anything. It is
 * PENDING until the product owner activates it, and the gate refuses rather
 * than warns.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Variables may come from the shell or the platform.
}

const args = process.argv.slice(2);

function numberFlag(name: string): number | undefined {
  const raw = args.find((arg) => arg.startsWith(`--${name}=`));
  if (raw === undefined) return undefined;
  const value = Number(raw.slice(name.length + 3));
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`--${name} must be a positive number.`);
    process.exit(2);
  }
  return value;
}

const maxRequests = numberFlag('max-requests');
const delayMs = numberFlag('delay-ms');
const refreshAfterDays = numberFlag('refresh-after-days');

void ingestSmartJobsQld({
  triggeredBy: 'manual',
  ...(maxRequests === undefined ? {} : { maxRequests }),
  ...(delayMs === undefined ? {} : { delayMs }),
  ...(refreshAfterDays === undefined ? {} : { refreshAfterDays }),
})
  .then((result) => {
    if (!result.ok) {
      console.error(`${result.error.code}: ${result.error.message}`);
      process.exit(1);
    }
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: 'info',
        message: 'Smart Jobs ingestion complete',
        ...result.value,
      }),
    );
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
