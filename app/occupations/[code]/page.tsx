import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findSourceDescriptor } from '@/config/sources';
import {
  cachedOccupations,
  cachedOccupationTotals,
  cachedRegionTotals,
  cachedStates,
} from '@/app/cached-queries';
import { occupationLabel } from '@/components/occupation-filter';
import { toAreaSlug } from '@/domain/geography';
import { RankedTable } from '@/components/ui/ranked-table';
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
import { VacancyTable } from '@/components/vacancy-table';
import { Label } from '@/components/ui/label';
import { link } from '@/components/ui/link';

/**
 * One occupation group, everywhere it is advertised.
 *
 * Reads the same rows the map reads, for one occupation instead of all of
 * them, and shows them as a table rather than a choropleth. The map answers
 * where; this answers where for one kind of work, and links back to the map
 * filtered to it so the reader can see the shape rather than the ranking.
 *
 * There is no trend here. Two reference periods are held (ADR-0010), so the
 * page states a month and its change on the month before, and says that is
 * all there is rather than drawing a two-point line and calling it a trend.
 */

export const dynamic = 'force-dynamic';

const EDITION = 'ASGS2026';
const DATASET = 'Internet Vacancy Index';
const SOURCE_KEY = 'jsa-ivi';
const TABLE_ID = 'regions-for-occupation';
const STATE_TABLE_ID = 'states-for-occupation';

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

/** The code as it arrives in the path, bounded before it is used. */
function codeFrom(raw: string): string | null {
  const trimmed = decodeURIComponent(raw).trim();
  return /^[A-Za-z0-9]{1,10}$/.test(trimmed) ? trimmed : null;
}

async function findOccupation(raw: string) {
  const code = codeFrom(raw);
  if (code === null) return null;
  const list = await cachedOccupations({ sourceKey: SOURCE_KEY, dataset: DATASET });
  if (!list.ok) return null;
  return list.value.find((option) => option.code === code) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const occupation = await findOccupation((await params).code);
  if (occupation === null) return { title: 'Occupation not found' };

  const label = occupationLabel(occupation);
  return {
    title: label,
    description: `Online job advertisements for ${label} across Australian regions, from the Jobs and Skills Australia Internet Vacancy Index.`,
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-rule flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b py-2 last:border-b-0">
      <Label as="dt">{label}</Label>
      <dd className="text-ink text-right text-sm">{children}</dd>
    </div>
  );
}

export default async function OccupationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const raw = (await params).code;
  const code = codeFrom(raw);

  // The path is already bounded to short alphanumerics, so the figures can be
  // asked for while the vocabulary is being read rather than after it. Three
  // round trips to another region become one, and a code the release does not
  // carry simply returns nothing, which is the answer this page wants anyway.
  const [occupation, totals, across, states] = await Promise.all([
    findOccupation(raw),
    cachedRegionTotals({
      sourceKey: SOURCE_KEY,
      dataset: DATASET,
      edition: EDITION,
      levels: ['GCCSA', 'SA4'],
      occupationCode: code ?? '',
    }),
    cachedOccupationTotals({
      sourceKey: SOURCE_KEY,
      dataset: DATASET,
      edition: EDITION,
      levels: ['GCCSA', 'SA4'],
    }),
    cachedStates(EDITION, 'STATE'),
  ]);

  // A code the release does not carry is a missing page, not an empty one.
  // Answering with 200 and a blank profile would tell a search engine, and a
  // reader, that this occupation exists and reported nothing.
  if (occupation === null) notFound();

  const label = occupationLabel(occupation);
  const name = occupation.name ?? `Occupation ${occupation.code}`;

  const descriptor = findSourceDescriptor(SOURCE_KEY);
  const attribution =
    descriptor?.attributionText ??
    'Based on Jobs and Skills Australia Internet Vacancy Index data.';

  if (!totals.ok) {
    return (
      <>
        <Masthead current="occupations" />
        <PageBody width="column">
          <Dateline>Jobs and Skills Australia</Dateline>
          <PageTitle>{name}</PageTitle>
          <Lede>These figures cannot be shown. {totals.error.message}</Lede>
        </PageBody>
      </>
    );
  }

  const { period, previousPeriod, regions, withoutData } = totals.value;
  const summary = across.ok
    ? (across.value.occupations.find((entry) => entry.code === occupation.code) ?? null)
    : null;

  // Rank among the groups the publisher reports, excluding the
  // all-occupations row, which is the whole rather than one of the parts.
  const ranked = across.ok
    ? across.value.occupations.filter(
        (entry) => entry.code !== '0' && entry.total !== null,
      )
    : [];
  const rankIndex = ranked.findIndex((entry) => entry.code === occupation.code);

  const change =
    summary === null || summary.total === null || summary.previousTotal === null
      ? null
      : summary.total - summary.previousTotal;
  const percent =
    change === null || summary?.previousTotal === null || summary?.previousTotal === 0
      ? null
      : (change / (summary?.previousTotal ?? 1)) * 100;

  /*
   * The same regions, rolled up to their states.
   *
   * The fifty-row table below answers where precisely; this answers where
   * broadly, which is the question most readers arrive with. It is the same
   * arithmetic the location pages do in the other direction, so the two agree
   * by construction rather than by coincidence: a state's figure for this
   * occupation is the sum of the regions the publisher reports inside it.
   *
   * Both halves of the count are kept. A state totalled from nine of its eleven
   * regions is not the same figure as one totalled from all eleven.
   */
  const stateRows = (states.ok ? states.value : [])
    .map((area) => {
      const inside = regions.filter((region) => region.stateCode === area.code);
      const missing = withoutData.filter((region) => region.stateCode === area.code);
      const reporting = inside.filter((region) => region.observation.value !== null);
      const total = reporting.reduce(
        (running, region) => running + (region.observation.value ?? 0),
        0,
      );
      return {
        code: area.code,
        name: area.name,
        slug: toAreaSlug(area.name),
        total: reporting.length === 0 ? null : total,
        reporting: reporting.length,
        inScope: inside.length + missing.length,
      };
    })
    // An area the release covers no regions for is out of scope, not empty.
    .filter((row) => row.inScope > 0)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

  const busiest = [...regions]
    .filter((region) => region.observation.value !== null)
    .sort((a, b) => (b.observation.value ?? 0) - (a.observation.value ?? 0))[0];

  const periodLabel = period === null ? null : monthFormat.format(period);
  const reporting = regions.length + withoutData.length;

  const fields: ReleaseField[] = [
    { label: 'Dataset', value: DATASET },
    ...(periodLabel === null ? [] : [{ label: 'Reference period', value: periodLabel }]),
    { label: 'Publisher code', value: occupation.code },
    {
      label: 'Regions reporting',
      value: `${String(regions.length)} of ${String(reporting)}`,
    },
  ];

  return (
    <>
      <Masthead
        current="occupations"
        release={periodLabel === null ? null : `IVI · ${periodLabel}`}
      />

      <PageBody>
        <header>
          <nav aria-label="Breadcrumb" className="mb-4">
            <ol className="text-ink-muted flex flex-wrap items-center gap-2 text-xs">
              <li>
                <Link href="/occupations" prefetch={false} className={link()}>
                  Occupations
                </Link>
              </li>
              <li aria-hidden="true" className="text-ink-faint">
                /
              </li>
              <li aria-current="page" className="text-ink font-medium">
                {occupation.name ?? occupation.code}
              </li>
            </ol>
          </nav>

          <Dateline>Jobs and Skills Australia · Internet Vacancy Index</Dateline>
          <PageTitle>{name}</PageTitle>
          <Lede>
            Online job advertisements
            {periodLabel === null ? '' : `, ${periodLabel}`}, as published by Jobs and
            Skills Australia under code{' '}
            <span className="font-mono text-base">{occupation.code}</span>. The name is
            the publisher&rsquo;s own.
          </Lede>

          {period === null ? null : <ReleaseStrip fields={fields} />}
        </header>

        {period === null ? (
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
                  <Stat
                    label="Advertisements"
                    value={
                      summary === null || summary.total === null
                        ? 'No figure'
                        : numberFormat.format(summary.total)
                    }
                    muted={summary === null || summary.total === null}
                    note="summed across every region the publisher reports"
                  />

                  <dl className="border-rule-strong mt-6 border-t">
                    <Row label="On the month before">
                      {change === null ? (
                        <span className="text-ink-muted">
                          {previousPeriod === null
                            ? 'No earlier month held'
                            : `Not published for ${monthFormat.format(previousPeriod)}`}
                        </span>
                      ) : (
                        <span className="tabular font-mono">
                          {signedFormat.format(change)}
                          {percent === null ? '' : ` (${percentFormat.format(percent)}%)`}
                        </span>
                      )}
                    </Row>

                    <Row label="Rank among groups">
                      {rankIndex === -1 ? (
                        <span className="text-ink-muted">Not ranked</span>
                      ) : (
                        <span className="tabular">
                          {rankIndex + 1} of {ranked.length}
                        </span>
                      )}
                    </Row>

                    <Row label="Most advertised in">
                      {busiest === undefined ? (
                        <span className="text-ink-muted">
                          No region reported a figure
                        </span>
                      ) : (
                        <span>
                          {busiest.name}
                          <span className="text-ink-muted tabular block font-mono text-xs">
                            {numberFormat.format(busiest.observation.value ?? 0)}
                          </span>
                        </span>
                      )}
                    </Row>
                  </dl>

                  <p className="mt-5 text-sm">
                    <a
                      href={`/map?occupation=${encodeURIComponent(occupation.code)}`}
                      className={link()}
                    >
                      See this occupation on the map
                    </a>
                    <span className="text-ink-muted block text-xs">
                      where the same figures are shaded by region
                    </span>
                  </p>

                  {/*
                    A text search, and labelled as one. Listings carry no
                    occupation classification: mapping them is blocked on an
                    open licence question, and an unmapped listing stays
                    unmapped rather than being guessed into a plausible code.
                    So this searches the words, which is a different and weaker
                    thing than "advertisements in this group", and the wording
                    has to say so or the page claims a mapping that does not
                    exist.
                  */}
                  {occupation.name === null ? null : (
                    <p className="mt-4 text-sm">
                      <a
                        href={`/jobs?q=${encodeURIComponent(occupation.name.toLowerCase())}`}
                        className={link()}
                      >
                        Search advertisements for these words
                      </a>
                      <span className="text-ink-muted block text-xs">
                        a keyword search, not a classification: listings are not mapped to
                        occupation codes
                      </span>
                    </p>
                  )}
                </div>
              }
              below={
                stateRows.length === 0 ? undefined : (
                  <div className="mt-4">
                    <FigureFrame
                      title={`${label} by state and territory`}
                      subtitle={`${
                        periodLabel ?? 'Reference period not stated'
                      }. Regions summed into the states they sit in, computed here rather than published as state figures.`}
                    >
                      <RankedTable
                        id={STATE_TABLE_ID}
                        captionHidden
                        caption={`Online job advertisements for ${label} by state and territory${
                          periodLabel === null ? '' : `, ${periodLabel}`
                        }, ordered by number of advertisements.`}
                        rows={stateRows}
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
                            heading: 'Regions',
                            align: 'right',
                            compact: true,
                            render: (row) =>
                              row.reporting === row.inScope
                                ? String(row.inScope)
                                : `${String(row.reporting)} of ${String(row.inScope)}`,
                          },
                        ]}
                      />
                    </FigureFrame>
                  </div>
                )
              }
            >
              <FigureFrame
                title={`${label} by region`}
                subtitle={`${
                  periodLabel ?? 'Reference period not stated'
                }. Counts of advertisements, not of vacancies. Bars are scaled to the largest region shown.`}
                source={attribution}
              >
                <VacancyTable
                  id={TABLE_ID}
                  regions={regions}
                  selectedCode={null}
                  stateCode={null}
                  caption="Ordered by number of advertisements. Region names link to the map."
                />
              </FigureFrame>
            </Plate>

            <Notes>
              <Note>
                The figure in the margin is the sum of the regions the publisher reports
                on, added here rather than published as a national total by Jobs and
                Skills Australia. Its regions cover Australia exactly once, so the sum is
                well defined, but it is our arithmetic and not their figure.
              </Note>
              <Note>
                The Internet Vacancy Index counts advertisements appearing on a defined
                set of job boards. It is an indicator of advertising activity, not a
                measure of total Australian vacancies.
              </Note>
              <Note>
                Two reference periods are held, so this page states a month and its change
                on the month before. That is a comparison, not a trend, and it is
                deliberately not drawn as one.
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
