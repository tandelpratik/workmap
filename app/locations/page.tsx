import type { Metadata } from 'next';
import Link from 'next/link';
import { cachedOccupationTotals, cachedStates } from '@/app/cached-queries';
import { toAreaSlug } from '@/domain/geography';
import { Masthead } from '@/components/layout/masthead';
import { Colophon } from '@/components/layout/colophon';
import {
  Dateline,
  Lede,
  Note,
  Notes,
  PageBody,
  PageTitle,
} from '@/components/layout/plate';
import { FigureFrame } from '@/components/layout/figure-frame';
import { ReleaseStrip, type ReleaseField } from '@/components/data/release-strip';
import { RankedTable } from '@/components/ui/ranked-table';
import { Label } from '@/components/ui/label';
import { link } from '@/components/ui/link';

/**
 * WHERE, at the coarsest useful grain: every state and territory, ranked.
 *
 * The map already answers "where" as a picture. This answers it as a list, and
 * it is the way into the state pages, which are the thing the map could not
 * give a reader: a place with an overview rather than a shaded shape with a
 * figure attached.
 *
 * Only areas the index actually reports on appear. Other Territories and
 * Outside Australia are real ASGS areas that JSA publishes nothing for, and a
 * page for either would be a page with no data on it, which the brief forbids
 * and which would be worse than the absence.
 */

export const dynamic = 'force-dynamic';

const EDITION = 'ASGS2026';
const DATASET = 'Internet Vacancy Index';
const SOURCE_KEY = 'jsa-ivi';
const TOTAL_OCCUPATION_CODE = '0';
const TABLE_ID = 'advertisements-by-state';

export const metadata: Metadata = {
  title: 'States and territories',
  description:
    'Online job advertisements by Australian state and territory, from the Jobs and Skills Australia Internet Vacancy Index.',
};

const numberFormat = new Intl.NumberFormat('en-AU');
const signedFormat = new Intl.NumberFormat('en-AU', { signDisplay: 'always' });
const percentFormat = new Intl.NumberFormat('en-AU', {
  signDisplay: 'always',
  maximumFractionDigits: 1,
});
const monthFormat = new Intl.DateTimeFormat('en-AU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

interface StateRow {
  readonly code: string;
  readonly name: string;
  readonly slug: string;
  /** Summed from the regions the index reports. Null when none reported. */
  readonly total: number | null;
  readonly previousTotal: number | null;
  readonly regionsReporting: number;
  readonly regionsInScope: number;
}

export default async function LocationsPage() {
  const [states, national] = await Promise.all([
    cachedStates(EDITION, 'STATE'),
    cachedOccupationTotals({
      sourceKey: SOURCE_KEY,
      dataset: DATASET,
      edition: EDITION,
      levels: ['GCCSA', 'SA4'],
    }),
  ]);

  const areas = states.ok ? states.value : [];

  /*
   * One scoped read per state, run together rather than in sequence.
   *
   * Nine round trips is more than one, and the alternative is a second query
   * shape returning per-state sums that nothing else needs. These are cached
   * for an hour like every other published figure, so the cost is paid once a
   * release rather than once a request.
   */
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

  const period = national.ok ? national.value.period : null;
  const previousPeriod = national.ok ? national.value.previousPeriod : null;
  const periodLabel = period === null ? null : monthFormat.format(period);

  const rows: StateRow[] = scoped.flatMap(({ area, result }) => {
    if (!result.ok) return [];
    const all = result.value.occupations.find(
      (entry) => entry.code === TOTAL_OCCUPATION_CODE,
    );
    // An area the index reports nothing for is left out entirely rather than
    // listed with an empty figure. It is not a gap in the month; it is outside
    // what this dataset covers.
    if (all === undefined || result.value.regionsInScope === 0) return [];
    return [
      {
        code: area.code,
        name: area.name,
        slug: toAreaSlug(area.name),
        total: all.total,
        previousTotal: all.previousTotal,
        regionsReporting: all.regionsReporting,
        regionsInScope: result.value.regionsInScope,
      },
    ];
  });

  rows.sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

  const nationalTotal = national.ok
    ? (national.value.occupations.find((entry) => entry.code === TOTAL_OCCUPATION_CODE)
        ?.total ?? null)
    : null;

  const fields: ReleaseField[] = [
    ...(periodLabel === null ? [] : [{ label: 'Reference period', value: periodLabel }]),
    ...(nationalTotal === null
      ? []
      : [{ label: 'Advertisements', value: numberFormat.format(nationalTotal) }]),
    { label: 'Areas reporting', value: String(rows.length) },
    {
      label: 'Regions',
      value: String(rows.reduce((sum, row) => sum + row.regionsInScope, 0)),
    },
  ];

  function changeOf(row: StateRow): { label: string; percent: string } | null {
    if (row.total === null || row.previousTotal === null) return null;
    const change = row.total - row.previousTotal;
    const percent = row.previousTotal === 0 ? null : (change / row.previousTotal) * 100;
    return {
      label: signedFormat.format(change),
      percent: percent === null ? '' : `${percentFormat.format(percent)}%`,
    };
  }

  return (
    <>
      <Masthead
        current="locations"
        release={periodLabel === null ? null : `IVI · ${periodLabel}`}
      />

      <PageBody>
        <header>
          <Dateline>
            Jobs and Skills Australia · Internet Vacancy Index
            {periodLabel === null ? '' : ` · ${periodLabel}`}
          </Dateline>
          <PageTitle>States and territories</PageTitle>
          <Lede>
            Where online job advertising is concentrated, by state and territory, and the
            way into each one&rsquo;s regions and occupations.
          </Lede>
          <ReleaseStrip fields={fields} />
        </header>

        {rows.length === 0 ? (
          <section className="border-rule-strong mt-12 border-t pt-6">
            <h2 className="text-ink font-serif text-2xl font-semibold">
              No figures loaded yet
            </h2>
            <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
              No Internet Vacancy Index release has been imported. This is an empty
              database, not a month with no advertisements.
            </p>
          </section>
        ) : (
          <section className="mt-12">
            <FigureFrame
              title="Advertisements by state and territory"
              subtitle={`${
                periodLabel ?? 'Reference period not stated'
              }. Summed from the regions the index reports on. Counts of advertisements, not of vacancies.`}
            >
              <RankedTable
                id={TABLE_ID}
                captionHidden
                caption={`Online job advertisements by state and territory${
                  periodLabel === null ? '' : `, ${periodLabel}`
                }, ordered by number of advertisements.`}
                rows={rows}
                rowKey={(row) => row.code}
                heading="State or territory"
                rank="compact"
                name={(row) => ({
                  label: row.name,
                  href: `/locations/${row.slug}`,
                })}
                figure={(row) => ({
                  value: row.total,
                  absence: 'Not reported',
                })}
                after={[
                  {
                    heading:
                      previousPeriod === null
                        ? 'Change'
                        : `On ${monthFormat.format(previousPeriod)}`,
                    align: 'right',
                    compact: true,
                    render: (row) => {
                      const change = changeOf(row);
                      // No prior period held is not a change of zero, and the
                      // table says which it is (ADR-0002).
                      if (change === null) {
                        return <span className="text-ink-faint">No comparison</span>;
                      }
                      return (
                        <span>
                          {change.label}
                          <span className="text-ink-faint"> {change.percent}</span>
                        </span>
                      );
                    },
                  },
                  {
                    heading: 'Regions',
                    align: 'right',
                    compact: true,
                    render: (row) =>
                      row.regionsReporting === row.regionsInScope
                        ? String(row.regionsInScope)
                        : `${String(row.regionsReporting)} of ${String(row.regionsInScope)}`,
                  },
                ]}
              />
            </FigureFrame>
          </section>
        )}

        <section className="border-rule-strong mt-12 border-t pt-5">
          <Label as="h2">Take the figures with you</Label>
          <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
            This table as a file, with its licence, its reference period and what was
            calculated here written inside it rather than left behind on this page.
          </p>
          <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
               A file, not a page: the handler answers with
               Content-Disposition: attachment, and next/link would try to
               navigate to it and prefetch it. */}
            <a href="/api/datasets/advertisements-by-state?format=csv" className={link()}>
              Download CSV
            </a>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
               A file, not a page: the handler answers with
               Content-Disposition: attachment, and next/link would try to
               navigate to it and prefetch it. */}
            <a
              href="/api/datasets/advertisements-by-state?format=json"
              className={link()}
            >
              Download JSON
            </a>
            <Link href="/data-and-licensing" prefetch={false} className={link()}>
              What you may do with it
            </Link>
          </p>
        </section>

        <Notes>
          <Note>
            State and territory figures are sums of the regions Jobs and Skills Australia
            publishes, computed here. Their regions cover Australia exactly once, so the
            sum is well defined, but it is our arithmetic rather than a figure they
            released. Each region&rsquo;s own published figure is on its state&rsquo;s
            page and on the map.
          </Note>
          <Note>
            The Internet Vacancy Index counts advertisements appearing on a defined set of
            job boards. Vacancies never advertised online, or advertised only through an
            employer&rsquo;s own site, are not in it. It is an indicator of advertising
            activity, not a measure of total Australian vacancies.
          </Note>
          <Note>
            Areas the index does not report on are not listed. Other Territories and
            Outside Australia exist in the boundary registry because sources report
            against them; this dataset publishes no figures for either.
          </Note>
        </Notes>

        <Colophon
          sources={[
            {
              key: SOURCE_KEY,
              dataset: DATASET,
              ...(periodLabel === null ? {} : { referencePeriod: periodLabel }),
            },
            'abs-asgs',
          ]}
        />
      </PageBody>
    </>
  );
}
