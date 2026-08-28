import { getEnv } from '@/config/env';

/**
 * Runs once when the server starts, before any request is handled.
 *
 * Validating the environment here makes the guarantees in ADR-0006 and
 * ADR-0009 literal rather than approximate. Without it, configuration is first
 * touched inside a route handler, so a misconfigured deployment starts
 * successfully and fails per request. A process that refuses to start is
 * unambiguous, and the synthetic-source gate depends on that: a running server
 * that serves invented job advertisements is the outcome being prevented.
 */
export function register(): void {
  const env = getEnv();

  // Logged through console rather than the logger, because this runs before
  // anything else and must be visible even if log level is misconfigured.
  // The environment object itself is never logged; it holds credentials.
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      level: 'info',
      time: new Date().toISOString(),
      message: 'Environment validated',
      appEnv: env.APP_ENV,
      databaseConfigured: Boolean(env.DATABASE_URL),
      syntheticSourcesAllowed:
        env.APP_ENV !== 'production' && env.ALLOW_SYNTHETIC_SOURCES,
    }),
  );
}
