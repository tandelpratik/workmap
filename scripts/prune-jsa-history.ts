import { retention } from '@/config/retention';
import { pruneLabourMarketHistory } from '@/db/repositories/labour-market';

/**
 * Drops JSA IVI history outside the retention window.
 *
 *   npm run jsa:prune -- --confirm
 *   npm run jsa:prune -- --confirm --keep=6
 *
 * Imports apply the same window on the way in, so this is for data already
 * stored: the first prune after the policy was introduced, or a deliberate
 * narrowing later.
 *
 * Deleted figures are recoverable. The published workbook is the record, and
 * re-importing with --force restores whatever a wider window admits. That is
 * what makes deleting acceptable here and nowhere else in the system.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Variables may come from the shell or the platform.
}

const args = process.argv.slice(2);
const keepArg = args.find((arg) => arg.startsWith('--keep='));
const keep =
  keepArg === undefined ? retention.labourMarketPeriods : Number(keepArg.slice(7));

if (!Number.isInteger(keep) || keep < 1) {
  console.error(`--keep must be a whole number of periods, at least 1. Got "${keep}".`);
  process.exit(2);
}

if (!args.includes('--confirm')) {
  console.error(
    `This permanently deletes every JSA IVI period except the most recent ${String(keep)}.\n` +
      'The workbook can be re-imported, but nothing here can be undone in place.\n' +
      'Re-run with --confirm if that is what you intend:\n' +
      '  npm run jsa:prune -- --confirm',
  );
  process.exit(2);
}

void pruneLabourMarketHistory({
  sourceKey: 'jsa-ivi',
  dataset: 'Internet Vacancy Index',
  retainPeriods: keep,
})
  .then((result) => {
    if (!result.ok) {
      console.error(`${result.error.code}: ${result.error.message}`);
      process.exit(1);
    }
    const asDates = (periods: readonly Date[]): string[] =>
      periods.map((period) => period.toISOString().slice(0, 10));
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: 'warn',
        message: 'JSA IVI history pruned',
        deleted: result.value.deleted,
        retained: asDates(result.value.retained),
        removedPeriods: result.value.removed.length,
        oldestRemoved: asDates(result.value.removed)[0] ?? null,
      }),
    );
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
