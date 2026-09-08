import { checkSourceHealth, type SourceHealth } from '@/analytics/source-health';

/**
 * Reports whether each live source is still working.
 *
 *   npm run source:health
 *
 * Read only, safe against production at any time. Exits non-zero when any
 * watched source is not healthy, so it can run on a schedule and say something
 * only when there is something to say.
 *
 * This is the read side of records ingestion has been writing since milestone
 * 05 and nobody has ever looked at. Two crawlers run unattended; without this,
 * the first sign of either stopping is a reader noticing the listings have gone
 * stale.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. The check will report the database as unavailable.
}

const dateFormat = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Australia/Sydney',
});

const when = (date: Date | null): string =>
  date === null ? 'never' : dateFormat.format(date);

function report(source: SourceHealth): string[] {
  const lines = [
    `  ${source.health === 'HEALTHY' ? 'ok  ' : source.health.padEnd(4)}  ${source.displayName} (${source.sourceKey})`,
  ];
  if (source.reason !== null) lines.push(`        ${source.reason}`);
  if (!source.scheduled) {
    lines.push('        imported on publication, not on a schedule');
  }
  lines.push(
    `        last success ${when(source.lastSuccessAt)}` +
      (source.recordsSeen > 0
        ? `, ${String(source.recordsSeen)} seen, ${String(source.recordsWritten)} written`
        : ''),
  );
  if (source.lastFailureAt !== null) {
    lines.push(`        last failure ${when(source.lastFailureAt)}`);
    if (source.lastFailureMessage !== null) {
      lines.push(`        ${source.lastFailureMessage}`);
    }
  }
  if (source.runningSince !== null) {
    lines.push(`        a run has been claimed since ${when(source.runningSince)}`);
  }
  lines.push(
    `        ${String(source.activeListings)} listings held, oldest confirmed ${when(
      source.oldestVerifiedAt,
    )}`,
  );
  if (source.quarantinedRecently > 0) {
    lines.push(
      `        ${String(source.quarantinedRecently)} records quarantined in the last 48 hours`,
    );
  }
  return lines;
}

void checkSourceHealth()
  .then((result) => {
    if (!result.ok) {
      console.error(`${result.error.code}: ${result.error.message}`);
      process.exit(1);
    }

    /* eslint-disable no-console */
    console.log('');
    for (const source of result.value.sources) {
      for (const line of report(source)) console.log(line);
      console.log('');
    }
    const unhealthy = result.value.sources.filter((s) => s.health !== 'HEALTHY').length;
    console.log(
      unhealthy === 0
        ? `  all ${String(result.value.sources.length)} sources healthy`
        : `  ${String(unhealthy)} of ${String(result.value.sources.length)} sources need attention`,
    );
    console.log('');
    /* eslint-enable no-console */

    process.exit(result.value.ok ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
