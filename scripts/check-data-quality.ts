import { runQualityChecks, type CheckResult } from '@/analytics/quality';

/**
 * Runs every data quality check and reports.
 *
 *   npm run data:check
 *
 * Read only. Nothing here writes, so it is safe against production at any time.
 *
 * Exits non-zero if any check fails, so it works as a deployment gate as well
 * as a thing to run by hand. A check that fails is a deployment that should not
 * proceed: the alternative is finding out from a reader that a figure is wrong.
 *
 * Checks that need no database still run without one, so a machine with nothing
 * configured verifies the registry and the thresholds rather than reporting
 * success it has not earned.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. The stored-data checks will report as skipped.
}

function line(check: CheckResult): string {
  const mark =
    check.status === 'PASS' ? 'pass' : check.status === 'FAIL' ? 'FAIL' : 'skip';
  const count = check.failures === 0 ? '' : `  ${String(check.failures)} failing`;
  return `  ${mark}  ${check.name}${count}`;
}

void runQualityChecks()
  .then((result) => {
    if (!result.ok) {
      console.error(`${result.error.code}: ${result.error.message}`);
      process.exit(1);
    }

    const report = result.value;
    /* eslint-disable no-console */
    console.log('');
    for (const check of report.checks) {
      console.log(line(check));
      if (check.status === 'FAIL') {
        console.log(`        asserts: ${check.asserts}`);
        if (check.examples.length > 0) {
          console.log(`        examples: ${check.examples.join(', ')}`);
        }
        if (check.detail !== undefined) console.log(`        ${check.detail}`);
      }
    }
    console.log('');
    console.log(
      `  ${String(report.passed)} passed, ${String(report.failed)} failed, ${String(
        report.skipped,
      )} skipped`,
    );
    console.log('');
    /* eslint-enable no-console */

    process.exit(report.ok ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
