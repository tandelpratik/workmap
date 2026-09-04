import type { Metadata } from 'next';
import { findSourceDescriptor } from '@/config/sources';
import {
  cachedOccupations,
  cachedRegionTotals,
  cachedStates,
} from '@/app/cached-queries';
import { OccupationFilter, occupationLabel } from '@/components/occupation-filter';
import {
  buildChoroplethGeometry,
  buildStateChoroplethGeometry,
  quantileBins,
} from '@/geography/choropleth';
import { VacancyLegend, VacancyMap } from '@/components/vacancy-map';
import {
  Breadcrumb,
  RegionDetail,
  RegionElsewhere,
  RegionNotFound,
} from '@/components/region-detail';
import { regionHref } from '@/components/region-figure';
import { SiteHeader } from '@/components/site-header';
import { VacancyTable } from '@/components/vacancy-table';

/**
 * WHERE: online job advertisements by region.
 *
 * Rendered entirely on the server. The reader receives finished SVG and a
 * table, with no map library and no client JavaScript.
 *
 * Selection is a query parameter, so a selected region is shareable, survives
 * a reload, works without scripting and needs no state to keep in sync. Every
 * region on the map and every row in the table is a link to this same page.
 *
 * Everything on this page comes from JSA IVI, which is CC BY 4.0 and the only
 * source currently licensed for published aggregate figures. Adzuna
 * advertisements are barred from this page by its licence, and the repository
 * refuses them rather than relying on this page to remember.
 */

export const dynamic = 'force-dynamic';

const EDITION = 'ASGS2026';
const DATASET = 'Internet Vacancy Index';
const SOURCE_KEY = 'jsa-ivi';
/** JSA's own code for the all-occupations row. */
const TOTAL_OCCUPATION_CODE = '0';
const TABLE_ID = 'vacancies-by-region';

/**
 * ASGS codes are short alphanumerics, "101" and "1GSYD" among them, and JSA's
 * occupation codes are shorter still. A query string is external input, so it
 * is bounded before it is used rather than passed to a lookup and hoped about.
 * Anything failing this is treated as no selection rather than as an error: a
 * malformed link still shows the map.
 */
const CODE_PATTERN = /^[A-Za-z0-9]{1,10}$/;

function selectedCodeFrom(value: string | string[] | undefined): string | null {
  const single = Array.isArray(value) ? value[0] : value;
  if (single === undefined) return null;
  const trimmed = single.trim();
  return CODE_PATTERN.test(trimmed) ? trimmed : null;
}

export const metadata: Metadata = {
  title: 'Where the advertisements are',
  description:
    'Online job advertisements by Australian region, from the Jobs and Skills Australia Internet Vacancy Index.',
};

const monthFormat = new Intl.DateTimeFormat('en-AU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-ink-muted max-w-measure mt-3 space-y-3 text-sm leading-relaxed">
      {children}
    </div>
  );
}

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedCode = selectedCodeFrom(params['region']);
  const requestedState = selectedCodeFrom(params['state']);
  const requestedOccupation = selectedCodeFrom(params['occupation']);

  // Three independent reads, so they overlap rather than queue. Each is a
  // round trip to a database in another region, and the page cannot render
  // until it has all three, so running them in turn spent three latencies
  // where one does.
  //
  // The figures are fetched for the occupation the reader asked for before it
  // has been checked against the vocabulary, because checking it is itself one
  // of the three reads. The check still happens; it just no longer blocks the
  // query. A code the release does not carry costs one extra read below, which
  // is the rare path and the right one to make slow.
  const speculativeOccupation = requestedOccupation ?? TOTAL_OCCUPATION_CODE;
  const [speculativeTotals, stateList, occupationList] = await Promise.all([
    cachedRegionTotals({
      sourceKey: SOURCE_KEY,
      dataset: DATASET,
      edition: EDITION,
      // Capitals at GCCSA, everywhere else at SA4. This is how IVI publishes,
      // and the two levels together cover the country exactly once.
      levels: ['GCCSA', 'SA4'],
      occupationCode: speculativeOccupation,
    }),
    cachedStates(EDITION, 'STATE'),
    cachedOccupations({ sourceKey: SOURCE_KEY, dataset: DATASET }),
  ]);

  // The vocabulary is the source's, so what may be asked for is decided by
  // what it published rather than by a list written here. An occupation the
  // dataset does not carry falls back to the total, which is the same posture
  // the region and state parameters take.
  const occupations = occupationList.ok ? occupationList.value : [];
  const occupation =
    occupations.find((option) => option.code === requestedOccupation) ??
    occupations.find((option) => option.code === TOTAL_OCCUPATION_CODE) ??
    null;
  const occupationCode = occupation?.code ?? TOTAL_OCCUPATION_CODE;
  const unknownOccupation =
    requestedOccupation !== null && occupation?.code !== requestedOccupation;
  const isTotal = occupationCode === TOTAL_OCCUPATION_CODE;
  const occupationName =
    occupation === null ? 'All occupations' : occupationLabel(occupation);

  const totals =
    occupationCode === speculativeOccupation
      ? speculativeTotals
      : await cachedRegionTotals({
          sourceKey: SOURCE_KEY,
          dataset: DATASET,
          edition: EDITION,
          levels: ['GCCSA', 'SA4'],
          occupationCode,
        });

  const descriptor = findSourceDescriptor(SOURCE_KEY);

  if (!totals.ok) {
    return (
      <>
        <SiteHeader current="map" />

        <main id="main" className="mx-auto max-w-5xl px-6 py-16">
          <h1 className="text-ink font-serif text-4xl font-semibold">
            Where the advertisements are
          </h1>
          <Prose>
            <p>This map cannot be shown. {totals.error.message}</p>
          </Prose>
        </main>
      </>
    );
  }

  const { period, previousPeriod, regions: national, withoutData } = totals.value;

  // The states are read for their names, not their shapes. A breadcrumb saying
  // "1" would be an ASGS code shown to a reader who never asked for one.
  const states = stateList.ok ? stateList.value : [];
  const state =
    requestedState === null
      ? null
      : (states.find((area) => area.code === requestedState) ?? null);
  const unknownState = requestedState !== null && state === null;

  // Drilling in narrows what is drawn to one state. Nothing about the figures
  // changes: the same rows, filtered, so a region cannot mean one thing
  // nationally and another here.
  const regions =
    state === null
      ? national
      : national.filter((region) => region.stateCode === state.code);

  // The selection is resolved against the whole country and then checked
  // against what is on screen, so "selected but not in this state" stays a
  // distinct case from "no such region".
  const requestedRegion =
    requestedCode === null
      ? null
      : (national.find((region) => region.code === requestedCode) ?? null);
  const selectedRegion =
    requestedRegion !== null && regions.includes(requestedRegion)
      ? requestedRegion
      : null;
  const selectedCode = selectedRegion?.code ?? null;
  const elsewhere =
    requestedRegion !== null && selectedRegion === null ? requestedRegion : null;

  // Rank is computed from the same ordering the table uses, so the panel and
  // the table cannot disagree about which region is third. It ranks within
  // what is shown, which is what the panel says.
  const withFigures = [...regions]
    .filter((region) => region.observation.value !== null)
    .sort((a, b) => (b.observation.value ?? 0) - (a.observation.value ?? 0));
  const rankIndex =
    selectedRegion === null
      ? -1
      : withFigures.findIndex((region) => region.code === selectedRegion.code);

  // Where "see all of New South Wales" leads, and absent once the reader is
  // already there.
  const drilldownState =
    selectedRegion === null || state !== null
      ? null
      : (states.find((area) => area.code === selectedRegion.stateCode) ?? null);
  // Bands are computed nationally even in a state view, so one colour means
  // one thing everywhere. Rebanding per state would make a region darken
  // simply because the reader zoomed in, which is a picture of the view rather
  // than of the labour market.
  const values = national
    .map((region) => region.observation.value)
    .filter((value): value is number => value !== null);
  const bins = quantileBins(values, 5);
  const geometry =
    state === null
      ? await buildChoroplethGeometry({ edition: EDITION, levels: ['GCCSA', 'SA4'] })
      : await buildStateChoroplethGeometry({
          edition: EDITION,
          stateCode: state.code,
          regionCodes: new Set(regions.map((region) => region.code)),
        });

  const hasFigures = regions.length > 0 && period !== null;

  return (
    <>
      <SiteHeader current="map" />

      <main id="main" className="mx-auto max-w-5xl px-6 py-16">
        <header>
          <Breadcrumb
            state={state === null ? null : { code: state.code, name: state.name }}
            regionCode={selectedCode}
          />
          <p className="text-ink-faint text-xs font-medium tracking-widest uppercase">
            Where
          </p>
          <h1 className="text-ink mt-2 font-serif text-4xl font-semibold text-balance">
            {state === null
              ? 'Where the advertisements are'
              : `Advertisements in ${state.name}`}
          </h1>
          <Prose>
            <p>
              {isTotal
                ? 'Online job advertisements'
                : `Advertisements for ${occupationName}`}{' '}
              across {state === null ? 'Australia' : state.name}
              {period === null ? '' : `, ${monthFormat.format(period)}`}. Capital cities
              are shown as whole cities and the rest of the country by region, which is
              how the index is published.
              {state === null
                ? ''
                : ' Boundaries here are finer than on the national map, and the shading' +
                  ' means the same thing: the bands are the national ones, so a region' +
                  ' does not change colour when you zoom into it.'}
            </p>
            {unknownState ? (
              <p>
                <strong className="text-ink font-medium">
                  That state or territory was not recognised,
                </strong>{' '}
                so the whole country is shown instead.
              </p>
            ) : null}
            {unknownOccupation ? (
              <p>
                <strong className="text-ink font-medium">
                  This release does not report that occupation,
                </strong>{' '}
                so all occupations are shown instead. The list below is the
                publisher&rsquo;s own, and it is what may be asked for.
              </p>
            ) : null}
            <p>
              <strong className="text-ink font-medium">
                This is not a count of jobs.
              </strong>{' '}
              The Internet Vacancy Index counts advertisements appearing on a defined set
              of job boards. Vacancies never advertised online, or advertised only through
              an employer&rsquo;s own site, are not in it. It is an indicator of
              advertising activity, not a measure of total Australian vacancies.
            </p>
          </Prose>
        </header>

        <OccupationFilter
          occupations={occupations}
          selected={occupationCode}
          stateCode={state?.code ?? null}
          regionCode={selectedCode}
        />

        {hasFigures ? (
          <section className="mt-12">
            {/*
              Every region on the map is a link, which is what makes it
              operable by keyboard, and also what puts fifty tab stops between
              the page and the table. This is the standard escape hatch: hidden
              until focused, so it costs a sighted mouse user nothing.
            */}
            <a
              href={`#${TABLE_ID}`}
              className="focus:bg-paper-raised focus:text-ink focus:border-rule-strong sr-only focus:not-sr-only focus:mb-4 focus:inline-block focus:border focus:px-3 focus:py-2 focus:text-sm"
            >
              Skip the map, go to the table of figures
            </a>

            <VacancyMap
              geometry={geometry}
              regions={regions}
              bins={bins}
              tableId={TABLE_ID}
              selectedCode={selectedCode}
              stateCode={state?.code ?? null}
            />
            <VacancyLegend
              bins={bins}
              hasMissing={regions.some((region) => region.observation.value === null)}
            />

            {selectedRegion === null ? null : (
              <RegionDetail
                region={selectedRegion}
                rank={rankIndex === -1 ? null : rankIndex + 1}
                of={withFigures.length}
                previousPeriod={previousPeriod}
                stateCode={state?.code ?? null}
                drilldown={
                  drilldownState === null
                    ? null
                    : { code: drilldownState.code, name: drilldownState.name }
                }
              />
            )}
            {elsewhere === null ? null : (
              <RegionElsewhere
                name={elsewhere.name}
                href={regionHref(elsewhere.code, elsewhere.stateCode)}
                where={
                  states.find((area) => area.code === elsewhere.stateCode)?.name ??
                  'another state'
                }
              />
            )}
            {requestedCode !== null && requestedRegion === null ? (
              <RegionNotFound code={requestedCode} />
            ) : null}
            <Prose>
              <p>
                Shading is by rank, in five equal groups of regions, not by a fixed scale.
                Greater Sydney carries more advertisements than every regional area of New
                South Wales combined, so a fixed scale would leave almost the whole map in
                the palest band. The key prints the range each band covers.
              </p>
            </Prose>

            <VacancyTable
              id={TABLE_ID}
              regions={regions}
              selectedCode={selectedCode}
              stateCode={state?.code ?? null}
              caption={`${
                isTotal
                  ? 'Online job advertisements'
                  : `Advertisements for ${occupationName}`
              } by region${
                period === null ? '' : `, ${monthFormat.format(period)}`
              }. Ordered by number of advertisements.`}
            />
          </section>
        ) : (
          <section className="border-rule-strong mt-12 border-t pt-6">
            <h2 className="text-ink font-serif text-2xl font-semibold">
              No figures loaded yet
            </h2>
            <Prose>
              <p>
                The geography is in place but no Internet Vacancy Index release has been
                imported. This is an empty database, not a month with no advertisements.
              </p>
            </Prose>
          </section>
        )}

        {withoutData.length > 0 && hasFigures ? (
          <section className="border-rule mt-12 border-t pt-6">
            <h2 className="text-ink font-serif text-xl font-semibold">Coverage</h2>
            <Prose>
              <p>
                {withoutData.length} of {regions.length + withoutData.length} regions this
                index reports on carry no figure for{' '}
                {period === null ? 'this period' : monthFormat.format(period)}, and are
                left unshaded. That means no figure was published for them, which is not
                the same as no advertisements.
              </p>
            </Prose>
          </section>
        ) : null}

        <footer className="border-rule-strong mt-16 border-t pt-6">
          <p className="text-ink-faint max-w-measure text-xs leading-relaxed">
            {descriptor?.attributionText ??
              'Based on Jobs and Skills Australia Internet Vacancy Index data.'}
          </p>
        </footer>
      </main>
    </>
  );
}
