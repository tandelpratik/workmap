import type { Metadata } from 'next';
import Link from 'next/link';
import { findSourceDescriptor } from '@/config/sources';
import { cachedOccupationTotals } from '@/app/cached-queries';
import { isLeafCode } from '@/domain/occupation';
import { occupationLabel } from '@/components/occupation-filter';
import { OccupationSearchForm } from '@/components/occupation-search-form';
import { Masthead } from '@/components/layout/masthead';
import { Colophon } from '@/components/layout/colophon';
import {
  Advisory,
  Dateline,
  Lede,
  Note,
  Notes,
  PageBody,
  PageTitle,
  Plate,
} from '@/components/layout/plate';
import { FigureFrame } from '@/components/layout/figure-frame';
import { ReleaseStrip, type ReleaseField } from '@/components/data/release-strip';
import { Stat } from '@/components/data/stat';
import { RankedTable } from '@/components/ui/ranked-table';
import { Label } from '@/components/ui/label';
import { link } from '@/components/ui/link';
import { cn } from '@/components/ui/cn';

/**
 * WHAT: which occupations are being advertised.
 *
 * The second leg of the product's grammar, and the first surface to read the
 * occupation dimension across the whole vocabulary rather than one group at a
 * time. Server rendered, like everything else here.
 *
 * Fifty-six groups is too many to compare as a column of numerals, so each row
 * carries a bar scaled to the largest group. The figure is printed beside it
 * in every case: the bar restores the comparison the numerals lose, and
 * nothing is encoded by length alone.
 *
 * The figures are sums across the regions JSA published: our arithmetic on
 * their partition of the country, not a national figure they released. The
 * notes say so rather than leaving a reader to assume otherwise.
 */

export const dynamic = 'force-dynamic';

const EDITION = 'ASGS2026';
const DATASET = 'Internet Vacancy Index';
const SOURCE_KEY = 'jsa-ivi';
const TOTAL_OCCUPATION_CODE = '0';
const TABLE_ID = 'advertisements-by-occupation';

export const metadata: Metadata = {
  title: 'What is being advertised',
  description:
    'Australian online job advertisements by occupation group, from the Jobs and Skills Australia Internet Vacancy Index.',
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

/** How many groups each movers table shows. */
const MOVERS = 5;

/**
 * Groups too small for a percentage to mean anything.
 *
 * A group advertising 40 roles that advertises 52 the next month has moved 30%,
 * and printing that beside a national group's 3% invites a reader to conclude
 * the small one is the story. The percentage is suppressed below this rather
 * than the row being dropped: the absolute change is still a fact.
 */
const PERCENT_FLOOR = 200;

export default async function OccupationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawQuery = params['q'];
  const single = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;
  const query = single?.trim() === '' ? undefined : single?.trim();

  const result = await cachedOccupationTotals({
    sourceKey: SOURCE_KEY,
    dataset: DATASET,
    edition: EDITION,
    levels: ['GCCSA', 'SA4'],
  });

  const descriptor = findSourceDescriptor(SOURCE_KEY);
  const attribution =
    descriptor?.attributionText ??
    'Based on Jobs and Skills Australia Internet Vacancy Index data.';

  if (!result.ok) {
    return (
      <>
        <Masthead current="occupations" />
        <PageBody width="column">
          <Dateline>Jobs and Skills Australia</Dateline>
          <PageTitle>What is being advertised</PageTitle>
          <Lede>These figures cannot be shown. {result.error.message}</Lede>
        </PageBody>
      </>
    );
  }

  const { period, previousPeriod, occupations, regionsInScope } = result.value;
  // The all-occupations row is the whole, not one of the parts, so it heads the
  // page rather than competing in the ranking below it.
  const total = occupations.find((entry) => entry.code === TOTAL_OCCUPATION_CODE) ?? null;
  const groups = occupations.filter((entry) => entry.code !== TOTAL_OCCUPATION_CODE);

  const periodLabel = period === null ? null : monthFormat.format(period);
  const empty = period === null || groups.length === 0;

  // Ranked here rather than trusted from the query, so the ordinal, the bar
  // and the row order cannot disagree with one another.
  const ranked = [...groups].sort((a, b) => {
    if (a.total === null && b.total === null) return 0;
    if (a.total === null) return 1;
    if (b.total === null) return -1;
    return b.total - a.total;
  });

  /*
   * The month's largest movements, in advertisements rather than in percent.
   *
   * Both directions, because a page showing only the risers is a page telling
   * half a story, and the half it omits is the one a reader planning a move
   * most needs. Only groups holding a figure in both months can move at all;
   * the rest have no comparison, which is not a movement of zero.
   */
  /*
   * Only the finest groups the release carries.
   *
   * The publisher reports a hierarchy: MANAGERS (1) contains the finer groups
   * numbered 1x, so its movement is its children's movements added up. Ranking
   * both together answers "which group moved most" with "the biggest one",
   * which is nearly a tautology, and it puts a whole beside its own parts.
   *
   * The rule lives in the domain because the insights page needs the same one
   * for the same reason, and two copies of a hierarchy rule is two answers to
   * the question of what a group is.
   */
  const publishedCodes = ranked.map((entry) => entry.code);

  const movable = ranked.filter(
    (entry): entry is typeof entry & { total: number; previousTotal: number } =>
      entry.total !== null &&
      entry.previousTotal !== null &&
      isLeafCode(entry.code, publishedCodes),
  );

  const byChange = [...movable].sort(
    (a, b) => b.total - b.previousTotal - (a.total - a.previousTotal),
  );
  const risers = byChange.slice(0, MOVERS).filter((e) => e.total - e.previousTotal > 0);
  const fallers = [...byChange]
    .reverse()
    .slice(0, MOVERS)
    .filter((e) => e.total - e.previousTotal < 0);

  // The filter narrows what is listed, never what is measured. The movers and
  // the headline figure above describe the whole release either way.
  const needle = query?.toLowerCase();
  const filtered =
    needle === undefined
      ? ranked
      : ranked.filter(
          (entry) =>
            entry.code.toLowerCase().includes(needle) ||
            (entry.name ?? '').toLowerCase().includes(needle),
        );

  function changeOf(entry: { total: number; previousTotal: number }): {
    absolute: number;
    percent: number | null;
  } {
    const absolute = entry.total - entry.previousTotal;
    return {
      absolute,
      percent:
        entry.previousTotal < PERCENT_FLOOR
          ? null
          : (absolute / entry.previousTotal) * 100,
    };
  }

  const fields: ReleaseField[] = [
    { label: 'Dataset', value: DATASET },
    ...(periodLabel === null ? [] : [{ label: 'Reference period', value: periodLabel }]),
    { label: 'Occupation groups', value: String(groups.length) },
    { label: 'Regions summed', value: String(regionsInScope) },
  ];

  return (
    <>
      <Masthead
        current="occupations"
        release={periodLabel === null ? null : `IVI · ${periodLabel}`}
      />

      <PageBody>
        <header>
          <Dateline>Jobs and Skills Australia · Internet Vacancy Index</Dateline>
          <PageTitle>What is being advertised</PageTitle>
          <Lede>
            Online job advertisements by occupation group
            {periodLabel === null ? '' : `, ${periodLabel}`}. These are the groups Jobs
            and Skills Australia publishes, in its own words and under its own codes.
          </Lede>

          {empty ? null : <ReleaseStrip fields={fields} />}
        </header>

        {empty ? (
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
          <>
            {risers.length === 0 && fallers.length === 0 ? null : (
              <section className="mt-12">
                <FigureFrame
                  title={`Largest movements on ${
                    previousPeriod === null
                      ? 'the month before'
                      : monthFormat.format(previousPeriod)
                  }`}
                  subtitle={`Change in advertisements between the two reference periods held, among the finest groups the release carries. A movement on one month, not a trend. Percentages are shown only where the earlier month held at least ${String(
                    PERCENT_FLOOR,
                  )} advertisements.`}
                >
                  <div className="grid grid-cols-1 gap-x-10 gap-y-8 lg:grid-cols-2">
                    {[
                      { key: 'up', heading: 'Increased most', rows: risers },
                      { key: 'down', heading: 'Decreased most', rows: fallers },
                    ].map((table) =>
                      table.rows.length === 0 ? null : (
                        <div key={table.key} className="min-w-0">
                          <Label as="h3">{table.heading}</Label>
                          <div className="mt-3">
                            <RankedTable
                              minWidth="min-w-[17rem]"
                              captionHidden
                              caption={`Occupation groups whose advertisements ${
                                table.key === 'up' ? 'increased' : 'decreased'
                              } most${
                                periodLabel === null ? '' : ` in ${periodLabel}`
                              } against the month before.`}
                              rows={table.rows}
                              rowKey={(entry) => entry.code}
                              heading="Occupation group"
                              figureHeading="Change"
                              /*
                                No bar. A bar encodes magnitude against a
                                maximum, and half these values are negative, so
                                the length would be meaningless or absent
                                depending on the sign. The figures are printed
                                and that is the comparison.
                              */
                              bar={false}
                              name={(entry) => ({
                                label: occupationLabel(entry),
                                href: `/occupations/${encodeURIComponent(entry.code)}`,
                              })}
                              figure={(entry) => ({
                                value: entry.total - entry.previousTotal,
                              })}
                              after={[
                                {
                                  heading: 'Percent',
                                  align: 'right',
                                  compact: true,
                                  render: (entry) => {
                                    const percent = changeOf(entry).percent;
                                    return percent === null ? (
                                      <span className="text-ink-faint font-sans text-xs">
                                        Base too small
                                      </span>
                                    ) : (
                                      percentFormat.format(percent) + '%'
                                    );
                                  },
                                },
                                {
                                  heading: 'Now',
                                  align: 'right',
                                  compact: true,
                                  render: (entry) => numberFormat.format(entry.total),
                                },
                              ]}
                            />
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </FigureFrame>
              </section>
            )}

            <OccupationSearchForm query={query} />

            <Plate
              margin={
                <div>
                  {total === null ? null : (
                    <Stat
                      label="All occupations"
                      value={
                        total.total === null
                          ? 'No figure'
                          : numberFormat.format(total.total)
                      }
                      muted={total.total === null}
                      note={
                        <>
                          advertisements across {total.regionsReporting} of{' '}
                          {regionsInScope} regions
                          {total.total === null ||
                          total.previousTotal === null ||
                          previousPeriod === null
                            ? ''
                            : `, ${signedFormat.format(
                                total.total - total.previousTotal,
                              )} on ${monthFormat.format(previousPeriod)}`}
                        </>
                      }
                    />
                  )}

                  <div className="border-rule-strong mt-6 border-t pt-5">
                    <Label>Reading this table</Label>
                    <p className="text-ink-muted mt-3 text-sm leading-relaxed">
                      <strong className="text-ink font-medium">
                        The groups overlap on purpose.
                      </strong>{' '}
                      A major group such as MANAGERS contains the finer groups listed
                      under it, so the rows must not be added together. Each is a figure
                      the publisher reports in its own right.
                    </p>
                  </div>
                </div>
              }
            >
              <FigureFrame
                title="Online job advertisements by occupation group"
                subtitle={
                  query === undefined
                    ? `${
                        periodLabel ?? 'Reference period not stated'
                      }. Counts of advertisements, not of vacancies. Bars are scaled to the largest group.`
                    : `${String(filtered.length)} of ${String(
                        ranked.length,
                      )} groups matching “${query}”. Bars are scaled to the largest group shown.`
                }
                source={attribution}
                aside={
                  query === undefined ? undefined : (
                    <Link
                      href="/occupations"
                      prefetch={false}
                      className={cn(link(), 'text-sm')}
                    >
                      Clear filter
                    </Link>
                  )
                }
              >
                {filtered.length === 0 ? (
                  <Advisory>
                    No occupation group matches “{query}”. Every group the index reports
                    is on this page, so this is a term that matches none of their names or
                    codes rather than a part of the market with no advertisements.
                  </Advisory>
                ) : (
                  <RankedTable
                    id={TABLE_ID}
                    minWidth="min-w-[20rem]"
                    captionHidden
                    caption={`Occupation groups by number of online job advertisements${
                      periodLabel === null ? '' : `, ${periodLabel}`
                    }. Each figure is the sum of the regions the publisher reports on,
                  added here. Ordered by number of advertisements.`}
                    rows={filtered}
                    rowKey={(entry) => entry.code}
                    heading="Occupation group"
                    /* The ordinal is the first column to go when the width runs out. */
                    rank="compact"
                    name={(entry) => ({
                      label: occupationLabel(entry),
                      href: `/occupations/${encodeURIComponent(entry.code)}`,
                    })}
                    figure={(entry) => ({ value: entry.total })}
                    after={[
                      {
                        heading: 'On the month before',
                        align: 'right',
                        render: (entry) =>
                          entry.total === null || entry.previousTotal === null ? (
                            <span className="text-ink-faint font-sans text-xs">
                              No comparison
                            </span>
                          ) : (
                            <span className="text-ink-muted">
                              {signedFormat.format(entry.total - entry.previousTotal)}
                            </span>
                          ),
                      },
                    ]}
                  />
                )}
              </FigureFrame>
            </Plate>

            <section className="border-rule-strong mt-12 border-t pt-5">
              <Label as="h2">Take the figures with you</Label>
              <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
                Every group as a file, with its licence, its reference period and what was
                calculated here written inside it. The file marks which rows are the
                finest grain, because a copy separated from this page has no other way to
                know which ones must not be added together.
              </p>
              <p className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                   A file, not a page: the handler answers with
                   Content-Disposition: attachment, and next/link would try to
                   navigate to it and prefetch it. */}
                <a
                  href="/api/datasets/advertisements-by-occupation?format=csv"
                  className={link()}
                >
                  Download CSV
                </a>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages --
                   A file, not a page: the handler answers with
                   Content-Disposition: attachment, and next/link would try to
                   navigate to it and prefetch it. */}
                <a
                  href="/api/datasets/advertisements-by-occupation?format=json"
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
                Each figure is the sum of the regions the publisher reports on, added
                here: the index is published by region, and its regions cover Australia
                exactly once. The sum is well defined, but it is our arithmetic and not a
                national total Jobs and Skills Australia released.
              </Note>
              <Note>
                The Internet Vacancy Index counts advertisements appearing on a defined
                set of job boards. It is an indicator of advertising activity, not a
                measure of total Australian vacancies.
              </Note>
              <Note>
                Groups overlap: a major group contains the finer groups listed under it,
                so the rows must not be added together.
              </Note>
              <Note>
                {previousPeriod === null
                  ? 'No earlier month is held, so no comparison is shown.'
                  : `The comparison is against ${monthFormat.format(previousPeriod)}. Two
                     reference periods are held, which is a change on a month rather
                     than a trend, and it is not drawn as one.`}
              </Note>
            </Notes>
          </>
        )}

        <Colophon
          sources={[
            {
              key: SOURCE_KEY,
              dataset: DATASET,
              ...(periodLabel === null ? {} : { referencePeriod: periodLabel }),
            },
          ]}
        />
      </PageBody>
    </>
  );
}
