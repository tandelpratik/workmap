import { execSync } from 'node:child_process';

/**
 * The Vercel build step.
 *
 * Plain JavaScript rather than TypeScript, deliberately: this runs before the
 * application is built and must not depend on a loader being installed.
 *
 * It exists to answer one question that a shell one-liner answers badly: should
 * this build apply migrations?
 *
 * **Only a production deployment migrates.** Preview deployments build against
 * the same database in the current setup, so migrating from a preview would
 * apply a feature branch's schema change to live data, from a build nobody
 * treats as a release. Preview builds therefore skip migrations entirely and
 * run against whatever schema production is on, which is also the honest test:
 * a preview whose code needs an unapplied migration should fail loudly rather
 * than quietly reshape production to suit itself.
 *
 * Migrations still never run at runtime (ADR-0006). The deploy is the trigger.
 */

// Vercel injects variables into the environment and ships no .env file, so
// this is a no-op there. It matters locally, where it makes the check below
// see exactly what prisma.config.ts will see rather than failing on a variable
// that is in fact available.
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Variables may come from the shell or the platform.
}

const vercelEnv = process.env.VERCEL_ENV ?? 'local';
const migrationUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

function run(command) {
  // Fixed strings, no interpolation, so the shell has nothing to inject into.
  execSync(command, { stdio: 'inherit' });
}

if (vercelEnv === 'production') {
  if (!migrationUrl) {
    console.error(
      [
        'Cannot apply migrations: neither DIRECT_DATABASE_URL nor DATABASE_URL is set',
        'in this build environment.',
        '',
        'Set DIRECT_DATABASE_URL on the Vercel project for the Production',
        'environment. It must be the DIRECT Neon connection string, whose host does',
        'not contain "-pooler": some DDL does not execute correctly through a',
        'connection pooler (ADR-0006).',
        '',
        'See docs/DEPLOYMENT.md for the full variable list.',
      ].join('\n'),
    );
    process.exit(1);
  }

  console.log('Production deployment: applying migrations.');
  run('prisma migrate deploy');
} else {
  console.log(
    `${vercelEnv} deployment: skipping migrations. Only a production deploy migrates.`,
  );
}

run('next build');
