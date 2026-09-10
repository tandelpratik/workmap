import { resolveStoredPostcodes, POSTCODE_REFERENCE } from '@/ingestion/postcodes';

/**
 * Gives stored locations a postcode, by placing their coordinates inside an
 * official postal area.
 *
 *   npm run postcodes:resolve                counts, and writes nothing
 *   npm run postcodes:resolve -- --apply     writes the postcodes
 *
 * Downloads the ABS boundary archive on first run, about 56 MB, and verifies it
 * against a recorded checksum before using it. The archive and its unpacked
 * copy live under the gitignored data directories and are kept, so later runs
 * do no network work at all.
 *
 * Run `npm run regional:classify -- --apply` afterwards. A postcode arriving on
 * a location that was previously settled by state, or not settled at all, makes
 * that location eligible for classification again.
 *
 * A location that already carries a postcode is never touched. A postcode the
 * source published outranks one derived from coordinates.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Variables may come from the shell or the platform.
}

const apply = process.argv.includes('--apply');

void resolveStoredPostcodes({ dryRun: !apply })
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
          message: apply
            ? 'Postcodes written'
            : 'Postcode resolution: dry run, nothing written',
          reference: POSTCODE_REFERENCE,
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
