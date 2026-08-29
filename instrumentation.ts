import { inspectEnv } from '@/config/env';

/**
 * Runs once when the server starts, before any request is handled.
 *
 * Configuration is checked here rather than inside the first route handler, so
 * a misconfigured deployment says so at boot instead of failing per request.
 *
 * What it does about a problem depends on the problem, and the distinction
 * matters more than it looks:
 *
 *   - **Fatal**, meaning synthetic job advertisements enabled in production.
 *     The process refuses to start. There is no degraded mode in which
 *     publishing invented vacancies is acceptable (ADR-0009).
 *   - **Anything else**, such as a missing database URL or a mistyped country
 *     code. The server starts and reports the fault. Refusing to boot took the
 *     whole deployment down with an opaque 500 on every route, including the
 *     health endpoint whose entire purpose is answering "what is wrong", which
 *     made the one useful diagnostic unavailable exactly when it was needed.
 *     The product already models "not configured" honestly, so it degrades
 *     into that instead.
 *
 * Logged through console rather than the logger: this runs before anything
 * else and must be visible even if the log level is itself misconfigured.
 * Variable names are logged, never values, because several are credentials.
 */
export function register(): void {
  const inspection = inspectEnv(process.env);

  if (inspection.ok) {
    const env = inspection.env;
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        level: 'info',
        time: new Date().toISOString(),
        message: 'Environment validated',
        appEnv: env.APP_ENV,
        databaseConfigured: Boolean(env.DATABASE_URL),
        adzunaConfigured: Boolean(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY),
        syntheticSourcesAllowed:
          env.APP_ENV !== 'production' && env.ALLOW_SYNTHETIC_SOURCES,
      }),
    );
    return;
  }

  console.error(
    JSON.stringify({
      level: 'error',
      time: new Date().toISOString(),
      message: inspection.fatal
        ? 'Refusing to start: unsafe environment configuration'
        : 'Environment configuration is invalid. Starting in a degraded state; see /api/health',
      invalidVariables: inspection.fields,
      issues: inspection.issues,
    }),
  );

  if (inspection.fatal) {
    throw new Error(
      'Refusing to start with synthetic sources enabled in production. ' +
        'See docs/adr/0009-source-activation-and-synthetic-containment.md',
    );
  }
}
