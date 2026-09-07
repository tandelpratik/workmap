import Link from 'next/link';
import { redirect } from 'next/navigation';
import { brand } from '@/config/brand';
import {
  cachedOccupationTotals,
  cachedRegionTotals,
  cachedStates,
} from '@/app/cached-queries';
import { makeObservation } from '@/domain/labour-market';
import { buildChoroplethGeometry, quantileBins } from '@/geography/choropleth';
import { occupationLabel } from '@/components/occupation-filter';
import { Masthead } from '@/components/layout/masthead';
import { Colophon } from '@/components/layout/colophon';
import { Dateline, Note, Notes, PageBody } from '@/components/layout/plate';
import { FigureFrame } from '@/components/layout/figure-frame';
import { ReleaseStrip, type ReleaseField } from '@/components/data/release-strip';
import { Bar } from '@/components/data/bar';
import { VacancyLegend, VacancyMap } from '@/components/vacancy-map';
import type { RegionFigure } from '@/components/region-figure';

/**
 * The front page.
 *
 * A section front, in the sense a newspaper means it: the name of the
 * publication, the current release, and the two questions the product answers
 * shown with real figures rather than described. It routes, and it proves the
 * thing is loaded and current while doing so.
 *
 * The map here is drawn at state level, not the fifty-region view the map page
 * carries. That is a deliberate trade. The national SA4 geometry is over a
 * megabyte of path data once projected, which is a reasonable price on the
 * page whose whole purpose is the map and an unreasonable one on the page a
 * reader lands on first. Nine shapes cost almost nothing and answer the
 * question a front page should: where in the country is this happening, and
 * where do I click to find out more.
 *
 * The state figures are sums of the regions Jobs and Skills Australia
 * publishes, computed here. Their regions cover Australia exactly once, so the
 * sum is well defined, but it is our arithmetic and the figure says so. A
 * state where any region went unreported is marked as such rather than being
 * quietly totalled from a partial set.
 *
 * There is deliberately no listing count. Counts derived from Adzuna data are
 * outside what their terms permit us to publish, and a headline figure on the
 * front page is the least defensible place to test that line.
 */

export const dynamic = 'force-dynamic';

const EDITION = 'ASGS2026';
const DATASET = 'Internet Vacancy Index';
const SOURCE_KEY = 'jsa-ivi';
const TOTAL_OCCUPATION_CODE = '0';
const STATE_TABLE_ID = 'advertisements-by-state';

const numberFormat = new Intl.NumberFormat('en-AU');
const monthFormat = new Intl.DateTimeFormat('en-AU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** How many rows each of the two rankings shows before linking to the rest. */
const PREVIEW_ROWS = 6;

/**
 * The parameters job search used to take when it lived at this address.
 *
 * A search was shareable by design, so links of the form `/?q=nurse` exist and
 * are the one kind of address this move could break. Answering them with a
 * front page that quietly ignored the query would be the worst of the
 * available behaviours, so they are forwarded intact.
 */
const JOB_SEARCH_PARAMS = ['q', 'where', 'sponsorship', 'page'] as const;

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const carried = new URLSearchParams();
  for (const key of JOB_SEARCH_PARAMS) {
    const value = params[key];
    const single = Array.isArray(value) ? value[0] : value;
    if (single !== undefined && single !== '') carried.set(key, single);
  }
  if (carried.size > 0) redirect(`/jobs?${carried.toString()}`);

  const [totals, stateList, byOccupation] = await Promise.all([
    cachedRegionTotals({
      sourceKey: SOURCE_KEY,
      dataset: DATASET,
      edition: EDITION,
      levels: ['GCCSA', 'SA4'],
      occupationCode: TOTAL_OCCUPATION_CODE,
    }),
    cachedStates(EDITION, 'STATE'),
    cachedOccupationTotals({
      sourceKey: SOURCE_KEY,
      dataset: DATASET,
      edition: EDITION,
      levels: ['GCCSA', 'SA4'],
    }),
  ]);

  const period = totals.ok ? totals.value.period : null;
  const periodLabel = period === null ? null : monthFormat.format(period);
  const states = stateList.ok ? stateList.value : [];

  // Regions summed into the states they sit in. Both halves of the count are
  // kept: a state total assembled from nine of its eleven regions is not the
  // same figure as one assembled from all eleven, and the difference has to
  // survive to the page rather than being flattened into a number.
  const byState = new Map<string, { sum: number; reporting: number; total: number }>();

  function tally(stateCode: string | null, value: number | null): void {
    if (stateCode === null) return;
    const entry = byState.get(stateCode) ?? { sum: 0, reporting: 0, total: 0 };
    entry.total += 1;
    if (value !== null) {
      entry.sum += value;
      entry.reporting += 1;
    }
    byState.set(stateCode, entry);
  }

  if (totals.ok && period !== null) {
    for (const region of totals.value.regions) {
      tally(region.stateCode, region.observation.value);
    }
    // Regions the release omits carry no figure by definition. They still
    // count towards the state's denominator, so a partial state is visible as
    // one rather than silently totalled from whatever happened to be reported.
    for (const region of totals.value.withoutData) {
      tally(region.stateCode, null);
    }
  }

  const stateFigures: RegionFigure[] =
    period === null
      ? []
      : states.flatMap((area) => {
          const entry = byState.get(area.code);
          if (entry === undefined || entry.reporting === 0) return [];
          return [
            {
              code: area.code,
              name: area.name,
              level: 'STATE' as const,
              stateCode: area.code,
              observation: makeObservation(period, 'PRESENT', entry.sum),
              previous: null,
            },
          ];
        });

  const rankedStates = [...stateFigures].sort(
    (a, b) => (b.observation.value ?? 0) - (a.observation.value ?? 0),
  );
  const stateMax = rankedStates[0]?.observation.value ?? 0;

  const bins = quantileBins(
    stateFigures
      .map((figure) => figure.observation.value)
      .filter((value): value is number => value !== null),
    5,
  );

  const geometry =
    stateFigures.length === 0
      ? null
      : await buildChoroplethGeometry({ edition: EDITION, levels: ['STATE'] });

  const groups = byOccupation.ok
    ? [...byOccupation.value.occupations]
        .filter((entry) => entry.code !== TOTAL_OCCUPATION_CODE && entry.total !== null)
        .sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
    : [];
  const occupationMax = groups[0]?.total ?? 0;

  const national = byOccupation.ok
    ? (byOccupation.value.occupations.find(
        (entry) => entry.code === TOTAL_OCCUPATION_CODE,
      ) ?? null)
    : null;

  const fields: ReleaseField[] = [
    ...(periodLabel === null ? [] : [{ label: 'Reference period', value: periodLabel }]),
    ...(national?.total == null
      ? []
      : [
          {
            label: 'Advertisements',
            value: numberFormat.format(national.total),
          },
        ]),
    ...(totals.ok
      ? [
          {
            label: 'Regions',
            value: String(totals.value.regions.length + totals.value.withoutData.length),
          },
        ]
      : []),
    { label: 'Occupation groups', value: String(groups.length) },
  ];

  const hasFigures = stateFigures.length > 0;

  return (
    <>
      <Masthead
        current="home"
        release={periodLabel === null ? null : `IVI · ${periodLabel}`}
      />

      <PageBody>
        <header>
          <Dateline>
            Australian labour market
            {periodLabel === null ? '' : ` · ${periodLabel}`}
          </Dateline>
          <h1 className="text-ink text-display mt-3 max-w-3xl font-serif font-semibold text-balance">
            {brand.tagline}
          </h1>
          <p className="text-ink-muted max-w-measure mt-5 text-lg leading-relaxed text-pretty">
            {brand.description} Every figure on this site is traceable to the release it
            came from, and nothing is shown that a source did not publish.
          </p>

          <ReleaseStrip fields={fields} />
        </header>

        {hasFigures && geometry !== null ? (
          <section className="mt-12 grid grid-cols-1 gap-x-10 gap-y-12 lg:grid-cols-2">
            <div className="min-w-0">
              <FigureFrame
                title="Where the advertisements are"
                subtitle={`${
                  periodLabel ?? 'Reference period not stated'
                }. States and territories, summed from the regions the index reports. Counts of advertisements, not of vacancies.`}
                legend={<VacancyLegend bins={bins} hasMissing={false} />}
                aside={
                  <Link
                    href="/map"
                    prefetch={false}
                    className="text-ink hover:text-accent text-sm underline underline-offset-4"
                  >
                    Open the map
                  </Link>
                }
              >
                <VacancyMap
                  geometry={geometry}
                  regions={stateFigures}
                  bins={bins}
                  tableId={STATE_TABLE_ID}
                  selectedCode={null}
                  stateCode={null}
                />
              </FigureFrame>

              {/*
                The map's accessible alternative, and on a phone its practical
                one: nine rows, each a link into that state's regional view.
              */}
              <div className="scroll-x mt-6">
                <table
                  id={STATE_TABLE_ID}
                  className="w-full min-w-[16rem] border-collapse text-sm"
                >
                  <caption className="sr-only">
                    Online job advertisements by state and territory
                    {periodLabel === null ? '' : `, ${periodLabel}`}, summed from the
                    regions the index reports. Ordered by number of advertisements.
                  </caption>
                  <thead>
                    <tr className="border-rule-strong border-b">
                      <th
                        scope="col"
                        className="text-ink-faint text-label py-2 pr-4 text-left font-mono font-normal uppercase"
                      >
                        State or territory
                      </th>
                      <th
                        scope="col"
                        className="text-ink-faint text-label py-2 text-right font-mono font-normal uppercase"
                      >
                        Advertisements
                      </th>
                      <th scope="col" className="hidden w-24 py-2 pl-4 sm:table-cell">
                        <span className="sr-only">Relative size</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rankedStates.map((figure) => (
                      <tr
                        key={figure.code}
                        className="border-rule hover:bg-paper-sunken border-b"
                      >
                        <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                          <a
                            href={`/map?state=${encodeURIComponent(figure.code)}`}
                            className="text-ink hover:text-accent underline-offset-4 hover:underline"
                          >
                            {figure.name}
                          </a>
                        </th>
                        <td className="text-ink tabular py-2.5 text-right font-mono">
                          {numberFormat.format(figure.observation.value ?? 0)}
                        </td>
                        <td className="hidden py-2.5 pl-4 align-middle sm:table-cell">
                          <Bar value={figure.observation.value} max={stateMax} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="min-w-0">
              <FigureFrame
                title="What is being advertised"
                subtitle={`${
                  periodLabel ?? 'Reference period not stated'
                }. The ${String(PREVIEW_ROWS)} largest occupation groups of ${String(
                  groups.length,
                )}. Groups overlap and must not be added together.`}
                aside={
                  <Link
                    href="/occupations"
                    prefetch={false}
                    className="text-ink hover:text-accent text-sm underline underline-offset-4"
                  >
                    All groups
                  </Link>
                }
              >
                <div className="scroll-x">
                  <table className="w-full min-w-[16rem] border-collapse text-sm">
                    <caption className="sr-only">
                      The largest occupation groups by number of online job advertisements
                      {periodLabel === null ? '' : `, ${periodLabel}`}.
                    </caption>
                    <thead>
                      <tr className="border-rule-strong border-b">
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
                        <th scope="col" className="hidden w-24 py-2 pl-4 sm:table-cell">
                          <span className="sr-only">Relative size</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.slice(0, PREVIEW_ROWS).map((entry) => (
                        <tr
                          key={entry.code}
                          className="border-rule hover:bg-paper-sunken border-b"
                        >
                          <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                            <a
                              href={`/occupations/${encodeURIComponent(entry.code)}`}
                              className="text-ink hover:text-accent underline-offset-4 hover:underline"
                            >
                              {occupationLabel(entry)}
                            </a>
                          </th>
                          <td className="text-ink tabular py-2.5 text-right font-mono">
                            {numberFormat.format(entry.total ?? 0)}
                          </td>
                          <td className="hidden py-2.5 pl-4 align-middle sm:table-cell">
                            <Bar value={entry.total} max={occupationMax} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </FigureFrame>

              <div className="border-rule-heavy mt-12 border-t-2 pt-5">
                <h2 className="text-ink font-serif text-2xl font-semibold">
                  The advertisements themselves
                </h2>
                <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
                  The index above counts advertisements. Separately, this site republishes
                  individual listings from the sources it is licensed to carry, with the
                  employer, location and salary exactly as published, and labels what each
                  advertisement says about visa sponsorship.
                </p>
                <p className="mt-4">
                  <Link
                    href="/jobs"
                    prefetch={false}
                    className="text-paper-raised bg-ink hover:bg-accent inline-flex min-h-11 items-center px-5 text-sm font-medium transition-colors"
                  >
                    Search advertisements
                  </Link>
                </p>
              </div>
            </div>
          </section>
        ) : (
          <section className="border-rule-strong mt-12 border-t pt-6">
            <h2 className="text-ink font-serif text-2xl font-semibold">
              No figures loaded yet
            </h2>
            <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
              No Internet Vacancy Index release has been imported. This is an empty
              database, not a month with no advertisements.{' '}
              <Link
                href="/jobs"
                prefetch={false}
                className="text-ink underline underline-offset-4"
              >
                Job advertisements
              </Link>{' '}
              are held separately and may still be available.
            </p>
          </section>
        )}

        <Notes>
          <Note>
            State and territory figures are sums of the regions Jobs and Skills Australia
            publishes, computed here. Their regions cover Australia exactly once, so the
            sum is well defined, but it is our arithmetic rather than a figure they
            released. The regional view carries their published figures unaltered.
          </Note>
          <Note>
            The Internet Vacancy Index counts advertisements appearing on a defined set of
            job boards. Vacancies never advertised online, or advertised only through an
            employer&rsquo;s own site, are not in it. It is an indicator of advertising
            activity, not a measure of total Australian vacancies.
          </Note>
        </Notes>

        <Colophon sources={[SOURCE_KEY, 'abs-asgs']} />
      </PageBody>
    </>
  );
}
