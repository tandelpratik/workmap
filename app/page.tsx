import Link from 'next/link';
import { redirect } from 'next/navigation';
import { brand } from '@/config/brand';
import { legal } from '@/config/legal';
import { regionalAreas } from '@/config/regional-areas';
import { listIndexedSources } from '@/db/repositories/job';
import { JobSearchForm } from '@/components/job-search-form';
import {
  cachedOccupationTotals,
  cachedRegionTotals,
  cachedStates,
} from '@/app/cached-queries';
import { makeObservation } from '@/domain/labour-market';
import { toAreaSlug } from '@/domain/geography';
import { buildChoroplethGeometry, quantileBins } from '@/geography/choropleth';
import { occupationLabel } from '@/components/occupation-filter';
import { Masthead } from '@/components/layout/masthead';
import { Colophon } from '@/components/layout/colophon';
import { Dateline, Note, Notes, PageBody } from '@/components/layout/plate';
import { FigureFrame } from '@/components/layout/figure-frame';
import { ReleaseStrip, type ReleaseField } from '@/components/data/release-strip';
import { RankedTable } from '@/components/ui/ranked-table';
import { VacancyLegend, VacancyMap } from '@/components/vacancy-map';
import type { RegionFigure } from '@/components/region-figure';
import { link } from '@/components/ui/link';
import { Label } from '@/components/ui/label';
import { cn } from '@/components/ui/cn';

/**
 * The front page.
 *
 * Search first, and search itself rather than a button that promises it. The
 * product exists so that somebody looking for regional work can type what they
 * do and where, once, instead of opening hundreds of postcodes; putting the
 * form anywhere but the top would be describing that rather than doing it.
 *
 * It is the same form the search page carries, not a cut-down copy. A reduced
 * hero form teaches a reader a set of controls and then replaces them with a
 * different set on the next page, and the maintenance cost of the second copy
 * is paid every time a filter changes.
 *
 * There is deliberately no count of listings anywhere on this page. Counts
 * derived from Adzuna data are outside what their terms permit us to publish,
 * and a headline figure on the front page is the least defensible place to test
 * that line.
 *
 * Below the search sits the labour market layer, which used to be the whole
 * product and is now context: where employment demand is concentrated, and what
 * is being advertised. It is kept because it answers a question the listings
 * cannot, and demoted because it is not what anybody came for.
 *
 * What follows describes that layer.
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

  const [totals, stateList, byOccupation, indexed] = await Promise.all([
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
    // Run with the rest rather than after it. The search form needs to know
    // which sources actually hold listings so it can offer that filter only
    // when there is a choice to make, and it is one grouped query.
    listIndexedSources(),
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
          <Dateline>Regional Australia</Dateline>
          <h1 className="text-ink text-display mt-3 max-w-3xl font-serif font-semibold text-balance">
            {brand.tagline}
          </h1>
          <p className="text-ink-muted max-w-measure mt-5 text-lg leading-relaxed text-pretty">
            {brand.description}
          </p>

          {/*
            The search itself, not a link to it. Defaulted to regional, which is
            what the product is for, and every other filter is here rather than
            a page away because this is the search rather than a preview of one.
          */}
          <JobSearchForm
            text={undefined}
            location={undefined}
            area="regional"
            sponsorship={undefined}
            employmentType={undefined}
            source={undefined}
            postedWithin={undefined}
            sources={indexed.ok ? indexed.value : []}
          />

          <p className="text-ink-faint max-w-measure mt-4 text-sm leading-relaxed">
            Where a listing sits is decided by its postcode against the{' '}
            <a
              href={regionalAreas.instrument.url}
              target="_blank"
              rel="noopener noreferrer"
              className={link()}
            >
              instrument that defines a designated regional area
            </a>
            , and every listing says which postcode and which rule placed it.{' '}
            {legal.disclaimer}
          </p>
        </header>

        <section className="border-rule-heavy mt-14 border-t-2 pt-6">
          <Label as="h2">The labour market behind the advertisements</Label>
          <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
            Where employment demand is concentrated across the country, and what is being
            advertised. Every figure is traceable to the release it came from, and nothing
            is shown that a source did not publish. These are counts of advertisements
            appearing on a defined set of job boards, not of vacancies.
          </p>

          <ReleaseStrip fields={fields} />
        </section>

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
                  <Link href="/map" prefetch={false} className={cn(link(), 'text-sm')}>
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
              <div className="mt-6">
                <RankedTable
                  id={STATE_TABLE_ID}
                  minWidth="min-w-[16rem]"
                  captionHidden
                  caption={`Online job advertisements by state and territory${
                    periodLabel === null ? '' : `, ${periodLabel}`
                  }, summed from the regions the index reports. Ordered by number of
                  advertisements.`}
                  rows={rankedStates}
                  rowKey={(figure) => figure.code}
                  heading="State or territory"
                  name={(figure) => ({
                    label: figure.name,
                    // Into the state's own page rather than back into the map.
                    // A reader who clicks a state on a front page is asking
                    // what is happening there, and the map's answer to that
                    // was another map.
                    href: `/locations/${toAreaSlug(figure.name)}`,
                  })}
                  figure={(figure) => ({ value: figure.observation.value })}
                />
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
                    className={cn(link(), 'text-sm')}
                  >
                    All groups
                  </Link>
                }
              >
                <RankedTable
                  minWidth="min-w-[16rem]"
                  captionHidden
                  caption={`The largest occupation groups by number of online job
                  advertisements${periodLabel === null ? '' : `, ${periodLabel}`}.`}
                  rows={groups.slice(0, PREVIEW_ROWS)}
                  rowKey={(entry) => entry.code}
                  heading="Occupation group"
                  name={(entry) => ({
                    label: occupationLabel(entry),
                    href: `/occupations/${encodeURIComponent(entry.code)}`,
                  })}
                  figure={(entry) => ({ value: entry.total })}
                />
              </FigureFrame>

              {/*
                The question the product is named for, offered before the
                figures rather than after them. A reader who arrives knowing what
                work they do does not want to be taught the index first; they
                want to be asked what they do and told where it is advertised.
              */}
              <div className="border-rule-heavy mt-12 border-t-2 pt-5">
                <h2 className="text-ink font-serif text-2xl font-semibold">
                  Where should I look?
                </h2>
                <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
                  Choose a kind of work and see which states advertise the most of it, and
                  which are unusually oriented towards it. Advertising activity, not a
                  recommendation about where to live.
                </p>
                <p className="mt-4">
                  <Link
                    href="/explore"
                    prefetch={false}
                    className="text-paper-raised bg-ink hover:bg-accent inline-flex min-h-11 items-center px-5 text-sm font-medium transition-colors"
                  >
                    Find where the work is
                  </Link>
                </p>
              </div>

              <div className="border-rule-strong mt-10 border-t pt-5">
                <h2 className="text-ink font-serif text-2xl font-semibold">
                  How &ldquo;regional&rdquo; is decided
                </h2>
                <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
                  By one published instrument, {regionalAreas.instrument.id}, which is
                  written entirely in postcodes. A listing is placed by its postcode where
                  a source publishes one, by its region where every postcode in that
                  region agrees, and by its state where the instrument lists that state in
                  full. An advertisement that cannot be placed says so rather than being
                  guessed at.
                </p>
                <p className="mt-4">
                  <Link
                    href="/data-and-licensing"
                    prefetch={false}
                    className={cn(link(), 'text-sm')}
                  >
                    Sources and licensing
                  </Link>
                </p>
              </div>

              {/*
                The rest of the product, named rather than left to the rail. The
                site grew five surfaces during this upgrade and the front page
                still pointed at the three it launched with, so a reader landing
                here had no way to learn that the others existed.
              */}
              <nav aria-label="More" className="border-rule-strong mt-10 border-t pt-5">
                <Label as="h2">Also here</Label>
                <ul className="mt-4 space-y-3">
                  {[
                    {
                      href: '/locations',
                      title: 'States and territories',
                      blurb:
                        'Each one in full: its figure, its regions, and what it advertises.',
                    },
                    {
                      href: '/insights',
                      title: 'What each place advertises more of',
                      blurb: 'Where a state is unlike the country, rather than larger.',
                    },
                    {
                      href: '/compare',
                      title: 'Compare',
                      blurb: 'Two states or two occupation groups, side by side.',
                    },
                    {
                      href: '/methodology',
                      title: 'Methodology',
                      blurb: 'What these figures count, and what they cannot tell you.',
                    },
                  ].map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} prefetch={false} className="group block">
                        <span className="text-ink group-hover:text-accent text-sm font-medium underline-offset-4 group-hover:underline">
                          {item.title}
                        </span>
                        <span className="text-ink-muted block text-sm leading-snug">
                          {item.blurb}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
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
              <Link href="/jobs" prefetch={false} className={link()}>
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
