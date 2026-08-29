import { z } from 'zod';

/**
 * Environment validation.
 *
 * Every variable is validated once, at startup. A missing or malformed value
 * stops the process immediately rather than surfacing as a confusing failure
 * later (ADR-0006).
 *
 * This module also holds the synthetic-source boot gate required by ADR-0009.
 * The gate fails closed: a production process configured to serve synthetic
 * job records refuses to start. A server that boots and serves invented job
 * advertisements is a worse outcome than a server that does not boot.
 */

const booleanFromString = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const baseSchema = z.object({
  /**
   * Deployment environment. Deliberately separate from NODE_ENV, which is set
   * by tooling and cannot distinguish a preview deployment from production.
   */
  APP_ENV: z.enum(['development', 'preview', 'production']).default('development'),

  /**
   * Pooled connection string, used by the application. Serverless functions
   * open a connection per invocation and exhaust a direct connection limit
   * (ADR-0006).
   */
  DATABASE_URL: z.url().optional(),

  /**
   * Direct connection string, used by migrations only. Some DDL does not
   * execute correctly through a pooler.
   */
  DIRECT_DATABASE_URL: z.url().optional(),

  /**
   * Enables the development-only synthetic job source. Never true in
   * production; see the boot gate below.
   */
  ALLOW_SYNTHETIC_SOURCES: booleanFromString.default(false),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  /**
   * Shared secret protecting manual ingestion triggers and admin routes
   * (ADR-0005). Required once those routes exist.
   */
  OPERATIONS_SECRET: z.string().min(32).optional(),

  /**
   * Adzuna API credentials.
   *
   * Server-side only. These are never referenced from a client component and
   * never prefixed NEXT_PUBLIC_, because that prefix inlines a value into the
   * browser bundle and would publish the key.
   *
   * Optional, so the application runs without them: search then reports that
   * no provider is configured rather than failing to boot.
   */
  ADZUNA_APP_ID: z.string().min(1).optional(),
  ADZUNA_APP_KEY: z.string().min(1).optional(),

  /** ISO country the Adzuna adapter queries. Their API is per-country. */
  ADZUNA_COUNTRY: z.string().length(2).default('au'),
});

export type Env = z.infer<typeof baseSchema>;

const schema = baseSchema.superRefine((value, ctx) => {
  const isDeployed = value.APP_ENV === 'production' || value.APP_ENV === 'preview';

  if (isDeployed && !value.DATABASE_URL) {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_URL'],
      message: `DATABASE_URL is required when APP_ENV is "${value.APP_ENV}".`,
    });
  }

  // The boot gate (ADR-0009). Synthetic records must never be reachable in
  // production, and a misconfiguration here would publish fabricated job
  // advertisements. Refuse to start.
  if (value.APP_ENV === 'production' && value.ALLOW_SYNTHETIC_SOURCES) {
    ctx.addIssue({
      code: 'custom',
      path: ['ALLOW_SYNTHETIC_SOURCES'],
      message:
        'ALLOW_SYNTHETIC_SOURCES must be false when APP_ENV is "production". ' +
        'Synthetic job records are development fixtures and must never be served ' +
        'to the public. See docs/adr/0009-source-activation-and-synthetic-containment.md',
    });
  }
});

export class EnvironmentError extends Error {
  override readonly name = 'EnvironmentError';

  constructor(readonly issues: readonly string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`,
    );
  }
}

/**
 * Pure parser, so the rules above can be tested without mutating the real
 * process environment.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);

  if (!result.success) {
    // Only field names and messages are surfaced. Values are never included,
    // because several of them are credentials (ADR-0008).
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new EnvironmentError(issues);
  }

  return result.data;
}

let cached: Env | undefined;

/**
 * The validated environment. Throws on first access if configuration is
 * invalid, which is what makes the failure loud and early.
 */
export function getEnv(): Env {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}

/** Test seam. Not for application use. */
export function resetEnvCache(): void {
  cached = undefined;
}

/**
 * Whether synthetic sources may be used in this process.
 *
 * Call this rather than reading the flag directly, so the production guarantee
 * lives in one place.
 */
export function isSyntheticAllowed(): boolean {
  const env = getEnv();
  return env.APP_ENV !== 'production' && env.ALLOW_SYNTHETIC_SOURCES;
}

export interface AdzunaCredentials {
  readonly appId: string;
  readonly appKey: string;
  readonly country: string;
}

/**
 * Adzuna credentials, or null when the provider is not configured.
 *
 * Returning null rather than throwing is deliberate: an unconfigured provider
 * is an expected state that the UI renders as "not available", not a crash
 * (ADR-0008, ADR-0009).
 */
export function getAdzunaCredentials(): AdzunaCredentials | null {
  const env = getEnv();
  if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) return null;
  return {
    appId: env.ADZUNA_APP_ID,
    appKey: env.ADZUNA_APP_KEY,
    country: env.ADZUNA_COUNTRY.toLowerCase(),
  };
}
