import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { findSourceDescriptor } from '@/config/sources';
import { searchJobs } from '@/db/repositories/job';
import { employmentTypes } from '@/domain/job';
import { sponsorshipSignals } from '@/domain/sponsorship';
import { areaFilters, defaultAreaFilter } from '@/domain/regional';
import { skillsByNormalizedName } from '@/skills/vocabulary';
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
  /*
   * Where the advertisement sits against the regional instrument.
   *
   * Defaulted rather than optional, and defaulted to the same value the search
   * page uses. This is a regional job search, so an unqualified request for
   * jobs means regional jobs, and the response echoes `filters` so a client can
   * see what was applied rather than having to know.
   *
   * It was missing entirely until now, which meant the page and its own API
   * disagreed about what the product does: the page returned regional work and
   * the API returned everything, with no way to ask for either.
   */
  area: z
    .enum(Object.keys(areaFilters) as [string, ...string[]])
    .default(defaultAreaFilter),
  /** A filter over what advertisements say, never over who may apply. */
  sponsorship: z.enum(sponsorshipSignals).optional(),
  /*
   * A skill the advertisement's own text names, by the vocabulary's stable
   * key.
   *
   * Validated against the vocabulary rather than passed through, so an
   * unrecognised value is a 400 naming the field rather than a silent empty
   * result that a client would reasonably read as "no such jobs". The
   * vocabulary is the same list the extraction pass and the search page read,
   * so the three cannot disagree about what a skill is called.
   *
   * It filters on a mention. It does not assert the skill is mandatory, and an
   * advertisement without it has not said it needs none: most listings here
   * reach us as an excerpt.
   */
  skill: z
    .string()
    .trim()
    .refine((value) => skillsByNormalizedName.has(value), {
      message: 'Not a skill this product recognises.',
    })
    .optional(),
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

  const { q, where, category, type, area, sponsorship, skill, page, pageSize } =
    parsed.data;
  const regional = areaFilters[area as keyof typeof areaFilters];

  const result = await searchJobs({
    ...(q ? { text: q } : {}),
    ...(where ? { location: where } : {}),
    ...(category ? { category } : {}),
    ...(type ? { employmentType: type } : {}),
    ...(regional === null ? {} : { regional }),
    ...(sponsorship ? { sponsorship } : {}),
    ...(skill ? { skill } : {}),
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
      /**
       * What was actually applied, including the defaults the caller did not
       * ask for. A response filtered by a default the client cannot see is a
       * response the client will eventually misread as the whole corpus.
       */
      filters: {
        area,
        ...(sponsorship === undefined ? {} : { sponsorship }),
        ...(skill === undefined ? {} : { skill }),
        ...(q === undefined ? {} : { q }),
        ...(where === undefined ? {} : { where }),
        ...(category === undefined ? {} : { category }),
        ...(type === undefined ? {} : { type }),
      },
      attribution,
    },
    {
      status: 200,
      headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600' },
    },
  );
}
