import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { findSourceDescriptor } from '@/config/sources';
import { searchJobs } from '@/db/repositories/job';
import { employmentTypes } from '@/domain/job';
import { statusForFailure } from '@/lib/errors';
import { logger } from '@/lib/logger';

/**
 * Job search.
 *
 * Every parameter is validated before it reaches a query (ADR-0008). The
 * response carries the attribution each source requires, because a client
 * rendering these listings inherits the obligation to display it and cannot be
 * expected to know what it is.
 */

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  where: z.string().trim().max(120).optional(),
  category: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9-]+$/i)
    .optional(),
  type: z.enum(employmentTypes).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/**
 * Cached briefly at the edge. Advertisements change on the scale of hours, the
 * index is refreshed on a schedule, and a short shared cache keeps both the
 * database and the free tier comfortable.
 */
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_INPUT',
          message: 'One or more search parameters are not valid.',
          fields: parsed.error.issues.map((issue) => issue.path.join('.')),
        },
      },
      { status: 400 },
    );
  }

  const { q, where, category, type, page, pageSize } = parsed.data;

  const result = await searchJobs({
    ...(q ? { text: q } : {}),
    ...(where ? { location: where } : {}),
    ...(category ? { category } : {}),
    ...(type ? { employmentType: type } : {}),
    page,
    pageSize,
  });

  if (!result.ok) {
    logger.warn('Job search failed', { code: result.error.code });
    return NextResponse.json(
      { error: { code: result.error.code, message: result.error.message } },
      { status: statusForFailure(result.error.code) },
    );
  }

  const sourceKeys = [...new Set(result.value.jobs.map((job) => job.sourceKey))];
  const attribution = sourceKeys
    .map((key) => findSourceDescriptor(key))
    .filter((descriptor) => descriptor?.attributionRequired)
    .map((descriptor) => ({
      sourceKey: descriptor?.key,
      displayName: descriptor?.displayName,
      // Stored verbatim in the registry so nothing in the stack paraphrases a
      // licence condition.
      text: descriptor?.attributionText,
      url: descriptor?.homepageUrl,
    }));

  return NextResponse.json(
    {
      jobs: result.value.jobs,
      page: result.value.page,
      pageSize: result.value.pageSize,
      /**
       * The size of this result set, for paging. Not a market statistic, and
       * not to be presented as one: the Adzuna terms reserve aggregate figures
       * such as vacancy counts for a written licence.
       */
      total: result.value.total,
      attribution,
    },
    {
      status: 200,
      headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600' },
    },
  );
}
