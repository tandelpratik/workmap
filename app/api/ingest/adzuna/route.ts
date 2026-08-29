import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getEnv } from '@/config/env';
import { ingestAdzuna } from '@/ingestion/adzuna';
import { statusForFailure } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { bearerToken, secretsMatch } from '@/lib/secret';

/**
 * Scheduled job ingestion (ADR-0005, ADR-0006).
 *
 * The deployed application has no long-running process, so ingestion is an
 * HTTP endpoint that a scheduler calls. Vercel Cron sends
 * `Authorization: Bearer <secret>`, and the same call works from a terminal for
 * a manual run, which is why there is no Vercel-specific header check here: the
 * trigger is replaceable, the pipeline is not.
 *
 * The endpoint fails closed. With no OPERATIONS_SECRET configured it refuses
 * every request rather than defaulting to open, because an unauthenticated
 * ingestion endpoint lets anyone burn the daily API allowance.
 */

export const dynamic = 'force-dynamic';

/**
 * Ingestion is several provider requests plus a few hundred upserts, which does
 * not fit the default function budget. Sixty seconds is the ceiling on Vercel's
 * lowest tier and is ample in-region, where each database round trip is a few
 * milliseconds rather than the few hundred it costs from a laptop.
 */
export const maxDuration = 60;

const querySchema = z.object({
  /**
   * Provider requests this run may spend. Bounded here as well as by the
   * caller: the daily allowance is 250, and a scheduler misconfigured to fire
   * every minute must not be able to exhaust it.
   */
  maxRequests: z.coerce.number().int().min(1).max(10).default(5),
});

async function handle(request: NextRequest) {
  const env = getEnv();

  if (!env.OPERATIONS_SECRET) {
    logger.error('Ingestion endpoint called with no OPERATIONS_SECRET configured');
    return NextResponse.json(
      {
        error: {
          code: 'NOT_CONFIGURED',
          message: 'This endpoint is not configured.',
        },
      },
      { status: 503 },
    );
  }

  const presented = bearerToken(request.headers.get('authorization'));
  if (presented === null || !secretsMatch(presented, env.OPERATIONS_SECRET)) {
    // Deliberately terse and identical for a missing and a wrong credential.
    logger.warn('Rejected an unauthenticated ingestion request');
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Not authorised.' } },
      { status: 403 },
    );
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'maxRequests must be 1 to 10.' } },
      { status: 400 },
    );
  }

  const result = await ingestAdzuna({
    maxRequests: parsed.data.maxRequests,
    triggeredBy: 'cron',
  });

  if (!result.ok) {
    logger.error('Scheduled ingestion failed', { code: result.error.code });
    return NextResponse.json(
      { error: { code: result.error.code, message: result.error.message } },
      { status: statusForFailure(result.error.code) },
    );
  }

  return NextResponse.json(result.value, {
    status: 200,
    headers: { 'cache-control': 'no-store' },
  });
}

/** Vercel Cron issues a GET. */
export async function GET(request: NextRequest) {
  return handle(request);
}

/** POST is accepted so a manual trigger reads as the action it is. */
export async function POST(request: NextRequest) {
  return handle(request);
}
