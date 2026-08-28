import { NextResponse } from 'next/server';
import { checkDatabase } from '@/db/client';
import { getEnv, isSyntheticAllowed } from '@/config/env';
import { logger } from '@/lib/logger';

/**
 * Health endpoint (ADR-0008).
 *
 * Reports build identity, environment and database reachability. It exposes no
 * secrets, no connection strings and no internal error detail, because it is
 * reachable without authentication.
 *
 * Never cached: a cached health check reports the past.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CheckState = 'ok' | 'not_configured' | 'unreachable';

interface HealthResponse {
  status: 'ok' | 'degraded';
  appEnv: string;
  buildId: string;
  time: string;
  checks: {
    database: { state: CheckState; latencyMs?: number };
  };
  /** Confirms the synthetic boot gate from ADR-0009 at a glance. */
  syntheticSourcesAllowed: boolean;
}

function buildId(): string {
  return (
    process.env['VERCEL_GIT_COMMIT_SHA']?.slice(0, 12) ??
    process.env['GIT_COMMIT_SHA']?.slice(0, 12) ??
    'local'
  );
}

export async function GET() {
  const env = getEnv();
  const result = await checkDatabase();

  let database: HealthResponse['checks']['database'];
  let status: HealthResponse['status'] = 'ok';

  if (result.ok) {
    database = { state: 'ok', latencyMs: result.value.latencyMs };
  } else if (result.error.code === 'NOT_CONFIGURED') {
    // Acceptable locally, where a developer may not have a database yet.
    // Not acceptable in a deployed environment, where env validation would
    // already have refused to start without DATABASE_URL.
    database = { state: 'not_configured' };
    status = env.APP_ENV === 'development' ? 'ok' : 'degraded';
  } else {
    database = { state: 'unreachable' };
    status = 'degraded';
    logger.warn('Health check could not reach the database', {
      appEnv: env.APP_ENV,
    });
  }

  const body: HealthResponse = {
    status,
    appEnv: env.APP_ENV,
    buildId: buildId(),
    time: new Date().toISOString(),
    checks: { database },
    syntheticSourcesAllowed: isSyntheticAllowed(),
  };

  return NextResponse.json(body, {
    status: status === 'ok' ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}
