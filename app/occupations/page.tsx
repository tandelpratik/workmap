import type { Metadata } from 'next';
import { findSourceDescriptor } from '@/config/sources';
import { cachedOccupationTotals } from '@/app/cached-queries';
import { occupationLabel } from '@/components/occupation-filter';
import { Masthead } from '@/components/layout/masthead';
import { Colophon } from '@/components/layout/colophon';
import {
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
import { Bar } from '@/components/data/bar';

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
const monthFormat = new Intl.DateTimeFormat('en-AU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export default async function OccupationsPage() {
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
  const max = ranked.reduce((highest, entry) => Math.max(highest, entry.total ?? 0), 0);

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
                    <p className="text-ink-faint text-label font-mono uppercase">
                      Reading this table
                    </p>
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
                subtitle={`${
                  periodLabel ?? 'Reference period not stated'
                }. Counts of advertisements, not of vacancies. Bars are scaled to the largest group.`}
                source={attribution}
              >
                <div className="scroll-x">
                  <table
                    id={TABLE_ID}
                    className="w-full min-w-[20rem] border-collapse text-sm"
                  >
                    <caption className="sr-only">
                      Occupation groups by number of online job advertisements
                      {periodLabel === null ? '' : `, ${periodLabel}`}. Each figure is the
                      sum of the regions the publisher reports on, added here. Ordered by
                      number of advertisements.
                    </caption>
                    <thead>
                      <tr className="border-rule-strong border-b">
                        <th
                          scope="col"
                          className="text-ink-faint text-label hidden w-8 py-2 pr-3 text-right font-mono font-normal uppercase sm:table-cell"
                        >
                          <span className="sr-only">Rank</span>
                          <span aria-hidden="true">#</span>
                        </th>
                        <th
                          scope="col"
                          className="text-ink-faint text-label py-2 pr-4 text-left font-mono font-normal uppercase"
                        >
                          Occupation group
                        </th>
                        <th
                          scope="col"
                          className="text-ink-faint text-label py-2 text-right font-mono font-normal uppercase"
                        >
                          Advertisements
                        </th>
                        <th scope="col" className="hidden w-28 py-2 pl-4 sm:table-cell">
                          <span className="sr-only">Relative size</span>
                        </th>
                        <th
                          scope="col"
                          className="text-ink-faint text-label py-2 pl-4 text-right font-mono font-normal uppercase"
                        >
                          On the month before
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((entry, index) => {
                        const change =
                          entry.total === null || entry.previousTotal === null
                            ? null
                            : entry.total - entry.previousTotal;
                        return (
                          <tr
                            key={entry.code}
                            className="border-rule hover:bg-paper-sunken border-b"
                          >
                            <td className="tabular text-ink-faint hidden py-2.5 pr-3 text-right font-mono text-xs sm:table-cell">
                              {entry.total === null ? '' : index + 1}
                            </td>
                            <th
                              scope="row"
                              className="text-ink py-2.5 pr-4 text-left font-normal"
                            >
                              <a
                                href={`/occupations/${encodeURIComponent(entry.code)}`}
                                className="text-ink hover:text-accent underline-offset-4 hover:underline"
                              >
                                {occupationLabel(entry)}
                              </a>
                            </th>
                            <td className="text-ink tabular py-2.5 text-right font-mono">
                              {entry.total === null ? (
                                <span className="text-ink-faint font-sans text-xs">
                                  No figure
                                </span>
                              ) : (
                                numberFormat.format(entry.total)
                              )}
                            </td>
                            <td className="hidden py-2.5 pl-4 align-middle sm:table-cell">
                              <Bar value={entry.total} max={max} />
                            </td>
                            <td className="text-ink-muted tabular py-2.5 pl-4 text-right font-mono">
                              {change === null ? (
                                <span className="text-ink-faint font-sans text-xs">
                                  No comparison
                                </span>
                              ) : (
                                signedFormat.format(change)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </FigureFrame>
            </Plate>

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

        <Colophon sources={[SOURCE_KEY]} />
      </PageBody>
    </>
  );
}
