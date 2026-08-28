import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client/client';
import { getEnv } from '@/config/env';
import { failure, type Failure } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';

/**
 * Database access (ADR-0006).
 *
 * The application connects through the pooled connection string. Serverless
 * functions open a connection per invocation, and a direct connection limit is
 * exhausted quickly under any real traffic. Migrations use the direct string
 * instead, configured in prisma.config.ts.
 *
 * The client is created lazily. The database is optional in development, so
 * importing this module must not fail when DATABASE_URL is absent; only using
 * it should.
 */

declare global {
  // Reused across hot reloads in development, so a saved file does not leak a
  // new connection pool each time.
  var __prisma: PrismaClient | undefined;
}

let client: PrismaClient | undefined;

export function isDatabaseConfigured(): boolean {
  return Boolean(getEnv().DATABASE_URL);
}

/**
 * Returns the Prisma client, or a NOT_CONFIGURED failure when no database is
 * configured. Callers must handle the failure rather than assume a connection,
 * which is what keeps the health endpoint honest in a local environment with
 * no database.
 */
export function getDatabase(): Result<PrismaClient, Failure> {
  const env = getEnv();

  if (!env.DATABASE_URL) {
    return err(
      failure('NOT_CONFIGURED', 'No database is configured for this environment.'),
    );
  }

  if (!client) {
    // Prisma 7 connects through a driver adapter rather than an inline URL.
    // The node-postgres adapter keeps the database portable to any managed
    // PostgreSQL, which is the exit path recorded in ADR-0006. A Neon-specific
    // adapter can replace this if serverless connection latency demands it.
    client =
      globalThis.__prisma ??
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
        log: env.LOG_LEVEL === 'debug' ? ['warn', 'error'] : ['error'],
      });

    if (env.APP_ENV === 'development') {
      globalThis.__prisma = client;
    }
  }

  return ok(client);
}

/**
 * Cheap reachability probe for the health endpoint. Returns a failure rather
 * than throwing, because an unreachable database is an expected operational
 * state, not a programmer error (ADR-0008).
 */
export async function checkDatabase(): Promise<Result<{ latencyMs: number }, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const startedAt = Date.now();
  try {
    await database.value.$queryRaw`SELECT 1`;
    return ok({ latencyMs: Date.now() - startedAt });
  } catch {
    // The underlying error may contain the connection string. It is logged by
    // the caller through the redacting logger, never returned to a client.
    return err(failure('SOURCE_UNAVAILABLE', 'The database could not be reached.'));
  }
}
