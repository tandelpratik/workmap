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
import { RankedTable } from '@/components/ui/ranked-table';
import { Label } from '@/components/ui/label';

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
                subtitle={`${
                  periodLabel ?? 'Reference period not stated'
                }. Counts of advertisements, not of vacancies. Bars are scaled to the largest group.`}
                source={attribution}
              >
                <RankedTable
                  id={TABLE_ID}
                  minWidth="min-w-[20rem]"
                  captionHidden
                  caption={`Occupation groups by number of online job advertisements${
                    periodLabel === null ? '' : `, ${periodLabel}`
                  }. Each figure is the sum of the regions the publisher reports on,
                  added here. Ordered by number of advertisements.`}
                  rows={ranked}
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
