import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { brand } from '@/config/brand';
import { findSourceDescriptor } from '@/config/sources';
import { cachedOccupationTotals, cachedStates } from '@/app/cached-queries';
import { canPublishDerivedAggregates, ineligibilityReason } from '@/domain/source';
import { isLeafCode } from '@/domain/occupation';
import {
  datasetFilename,
  toCsv,
  toJson,
  type DatasetColumn,
  type DatasetProvenance,
} from '@/domain/dataset';
import { logger } from '@/lib/logger';

/**
 * The figures on this site, as files.
 *
 * Only what this project derived, and only from a source whose licence permits
 * both aggregation and redistribution. The gate is
 * `canPublishDerivedAggregates`, the same predicate the map and every ranking
 * consult, so a source that may not be counted can never be exported either.
 * Adzuna listings are published on this site and reserved from aggregate use;
 * nothing here touches them.
 *
 * The licence notice is written into the file rather than shown beside the
 * download link. A file that leaves without it is a file that will be quoted
 * somewhere with no route back to the publisher.
 */

export const dynamic = 'force-dynamic';

const EDITION = 'ASGS2026';
const DATASET = 'Internet Vacancy Index';
const SOURCE_KEY = 'jsa-ivi';
const TOTAL_OCCUPATION_CODE = '0';

const querySchema = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
});

const monthFormat = new Intl.DateTimeFormat('en-AU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

interface StateRow {
  readonly code: string;
  readonly name: string;
  readonly total: number | null;
  readonly previousTotal: number | null;
  readonly regionsReporting: number;
}

interface OccupationRow {
  readonly code: string;
  readonly name: string | null;
  readonly total: number | null;
  readonly previousTotal: number | null;
  readonly isFinestGrain: boolean;
}

const stateColumns: readonly DatasetColumn<StateRow>[] = [
  { key: 'stateCode', heading: 'ASGS state code', value: (row) => row.code },
  { key: 'stateName', heading: 'State or territory', value: (row) => row.name },
  { key: 'advertisements', heading: 'Advertisements', value: (row) => row.total },
  {
    key: 'previousAdvertisements',
    heading: 'Advertisements, previous period',
    value: (row) => row.previousTotal,
  },
  {
    key: 'regionsReporting',
    heading: 'Regions reporting',
    value: (row) => row.regionsReporting,
  },
];

const occupationColumns: readonly DatasetColumn<OccupationRow>[] = [
  { key: 'occupationCode', heading: 'Publisher code', value: (row) => row.code },
  { key: 'occupationName', heading: 'Occupation group', value: (row) => row.name },
  { key: 'advertisements', heading: 'Advertisements', value: (row) => row.total },
  {
    key: 'previousAdvertisements',
    heading: 'Advertisements, previous period',
    value: (row) => row.previousTotal,
  },
  {
    key: 'isFinestGrain',
    // Carried because it decides whether rows may be added together, and a file
    // separated from this site has no other way to know.
    heading: 'Finest grain (do not sum parents with children)',
    value: (row) => (row.isFinestGrain ? 'true' : 'false'),
  },
];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;

  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: 'INVALID_INPUT', message: 'format must be csv or json.' } },
      { status: 400 },
    );
  }

  const descriptor = findSourceDescriptor(SOURCE_KEY);
  if (descriptor === undefined) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No such source.' } },
      { status: 404 },
    );
  }

  /*
   * The gate, before any work. A source whose licence reserves aggregate use
   * may not be exported, and this refuses rather than emitting a file whose
   * header would have to claim a permission that does not exist.
   */
  if (!canPublishDerivedAggregates(descriptor)) {
    logger.warn('Refused a dataset export for a source that may not be aggregated', {
      sourceKey: SOURCE_KEY,
    });
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            ineligibilityReason(descriptor) ??
            'This source may not be used for published aggregate figures.',
        },
      },
      { status: 403 },
    );
  }

  const national = await cachedOccupationTotals({
    sourceKey: SOURCE_KEY,
    dataset: DATASET,
    edition: EDITION,
    levels: ['GCCSA', 'SA4'],
  });

  if (!national.ok) {
    return NextResponse.json(
      { error: { code: national.error.code, message: national.error.message } },
      { status: 503 },
    );
  }

  const period = national.value.period;
  const periodLabel = period === null ? null : monthFormat.format(period);

  const provenance: DatasetProvenance = {
    title: '',
    publisher: descriptor.displayName,
    dataset: DATASET,
    referencePeriod: periodLabel,
    licence: descriptor.licence?.name ?? 'See the publisher',
    licenceUrl: descriptor.licence?.url ?? descriptor.homepageUrl ?? '',
    attribution: descriptor.attributionText ?? descriptor.displayName,
    derivation: '',
    source: new URL(request.url).origin + '/data-and-licensing',
    retrievedAt: new Date(),
  };

  if (slug === 'advertisements-by-state') {
    const states = await cachedStates(EDITION, 'STATE');
    const areas = states.ok ? states.value : [];

    const scoped = await Promise.all(
      areas.map(async (area) => ({
        area,
        result: await cachedOccupationTotals({
          sourceKey: SOURCE_KEY,
          dataset: DATASET,
          edition: EDITION,
          levels: ['GCCSA', 'SA4'],
          stateCode: area.code,
        }),
      })),
    );

    const rows: StateRow[] = scoped.flatMap(({ area, result }) => {
      if (!result.ok || result.value.regionsInScope === 0) return [];
      const all = result.value.occupations.find(
        (entry) => entry.code === TOTAL_OCCUPATION_CODE,
      );
      if (all === undefined) return [];
      return [
        {
          code: area.code,
          name: area.name,
          total: all.total,
          previousTotal: all.previousTotal,
          regionsReporting: all.regionsReporting,
        },
      ];
    });
    rows.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

    return respond(
      slug,
      rows,
      stateColumns,
      {
        ...provenance,
        title: 'Online job advertisements by Australian state and territory',
        derivation:
          `Summed by ${brand.productName} from the regions the publisher reports on ` +
          'within each state. The publisher releases this index by region, not by ' +
          `state, so these state figures are ${brand.productName} arithmetic and not ` +
          'figures the publisher released.',
      },
      parsed.data.format,
      periodLabel,
    );
  }

  if (slug === 'advertisements-by-occupation') {
    const codes = national.value.occupations.map((entry) => entry.code);
    const rows: OccupationRow[] = national.value.occupations
      .filter((entry) => entry.code !== TOTAL_OCCUPATION_CODE)
      .map((entry) => ({
        code: entry.code,
        name: entry.name,
        total: entry.total,
        previousTotal: entry.previousTotal,
        isFinestGrain: isLeafCode(entry.code, codes),
      }));

    return respond(
      slug,
      rows,
      occupationColumns,
      {
        ...provenance,
        title: 'Online job advertisements by occupation group, Australia',
        derivation:
          `Summed by ${brand.productName} across every region the publisher reports ` +
          'on. Occupation ' +
          'groups nest: a parent group contains the finer groups beneath it, so rows ' +
          'must not be added together. The finest grain column marks which rows are ' +
          'leaves.',
      },
      parsed.data.format,
      periodLabel,
    );
  }

  return NextResponse.json(
    {
      error: {
        code: 'NOT_FOUND',
        message: 'No such dataset.',
        available: ['advertisements-by-state', 'advertisements-by-occupation'],
      },
    },
    { status: 404 },
  );
}

function respond<T>(
  slug: string,
  rows: readonly T[],
  columns: readonly DatasetColumn<T>[],
  provenance: DatasetProvenance,
  format: 'csv' | 'json',
  periodLabel: string | null,
): NextResponse {
  const body =
    format === 'csv'
      ? toCsv(rows, columns, provenance)
      : toJson(rows, columns, provenance);

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type':
        format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${datasetFilename(slug, periodLabel, format)}"`,
      // A published release does not change between imports, and the figures are
      // the same for every caller.
      'cache-control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
