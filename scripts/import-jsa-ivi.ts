import { importJsaIvi } from '@/ingestion/jsa-ivi';

/**
 * Imports a published JSA Internet Vacancy Index workbook.
 *
 *   npm run jsa:import -- data/raw/jsa-ivi/<file>.xlsx
 *   npm run jsa:import -- <file>.xlsx --dry-run
 *   npm run jsa:import -- <file>.xlsx --force
 *
 * --dry-run parses and reports without writing, which is the safe first look at
 * a release. --force re-imports a file whose bytes have already been imported.
 *
 * The file is supplied by an operator. It is not downloaded here: the JSA site
 * does not respond to this environment, and the open-data mirror disallows
 * automated access in its robots.txt. See docs/milestones/05-jsa-importer.md
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Variables may come from the shell or the platform.
}

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--') && !arg.includes('=')));
const named = new Map(
  args
    .filter((arg) => arg.startsWith('--') && arg.includes('='))
    .map((arg) => {
      const at = arg.indexOf('=');
      return [arg.slice(2, at), arg.slice(at + 1)] as const;
    }),
);
const [filePath] = args.filter((arg) => !arg.startsWith('--'));

if (filePath === undefined) {
  console.error(
    'Usage: npm run jsa:import -- <path to IVI workbook.xlsx> [--dry-run] [--force] [--edition=ASGS2026]',
  );
  process.exit(2);
}

const edition = named.get('edition');
const dataset = named.get('dataset');
const measure = named.get('measure');
const unit = named.get('unit');

void importJsaIvi({
  filePath,
  dryRun: flags.has('--dry-run'),
  force: flags.has('--force'),
  triggeredBy: 'manual',
  ...(edition === undefined ? {} : { edition }),
  ...(dataset === undefined ? {} : { dataset }),
  ...(measure === undefined ? {} : { measure }),
  ...(unit === undefined ? {} : { unit }),
})
  .then((result) => {
    if (!result.ok) {
      console.error(`${result.error.code}: ${result.error.message}`);
      process.exit(1);
    }

    const outcome = result.value;
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          level: 'info',
          message: 'JSA IVI import',
          status: outcome.status,
          runId: outcome.runId,
          input: outcome.inputRef,
          checksum: outcome.inputChecksum.slice(0, 12),
          series: outcome.seriesSeen,
          observationsSeen: outcome.seen,
          written: outcome.written,
          unchanged: outcome.skipped,
          quarantined: outcome.quarantined,
          geography: outcome.geography,
          occupation: outcome.occupation,
          sheets: outcome.sheets,
        },
        null,
        2,
      ),
    );

    if (outcome.problems.length > 0) {
      console.error(`\n${outcome.problems.length} record(s) could not be read:`);
      for (const problem of outcome.problems.slice(0, 20)) {
        console.error(
          `  ${problem.sheet} row ${problem.row}: ${problem.kind} ${problem.message}`,
        );
      }
    }

    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
