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
  RegionPrompt,
} from '@/components/region-detail';
import { regionHref } from '@/components/region-figure';
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
import { VacancyTable } from '@/components/vacancy-table';

/**
 * WHERE: online job advertisements by region.
 *
 * Rendered entirely on the server. The reader receives finished SVG and a
 * table, with no map library and no client JavaScript.
 *
 * Laid out as an atlas plate: the map is the page rather than an illustration
 * inside it, the selected region's figures stand in the margin beside it, and
 * the qualifications that used to run to three paragraphs above the fold are
 * numbered notes under the graphic they qualify. The reader meets the data
 * first and its limits immediately after, which is the order a statistical
 * release uses and the opposite of the order this page used to.
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
  const attribution =
    descriptor?.attributionText ??
    'Based on Jobs and Skills Australia Internet Vacancy Index data.';

  if (!totals.ok) {
    return (
      <>
        <Masthead current="map" />
        <PageBody width="column">
          <Dateline>Jobs and Skills Australia</Dateline>
          <PageTitle>Where the advertisements are</PageTitle>
          <Lede>This map cannot be shown. {totals.error.message}</Lede>
        </PageBody>
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

  // Filtered by the same state as the regions are. Counting national gaps
  // against a state's regions produced a coverage line that was arithmetic
  // between two different populations: "8 of 19" inside New South Wales, where
  // eight was the number of blank regions in the country.
  const missing =
    state === null
      ? withoutData
      : withoutData.filter((region) => region.stateCode === state.code);
  const inScope = regions.length + missing.length;

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
  const periodLabel = period === null ? null : monthFormat.format(period);
  const where = state === null ? 'Australia' : state.name;
  const subject = isTotal
    ? 'Online job advertisements'
    : `Advertisements for ${occupationName}`;

  const fields: ReleaseField[] = [
    { label: 'Dataset', value: DATASET },
    ...(periodLabel === null ? [] : [{ label: 'Reference period', value: periodLabel }]),
    { label: 'Occupation', value: isTotal ? 'All occupations' : occupationName },
    ...(inScope === 0
      ? []
      : [
          {
            label: 'Regions reporting',
            value: `${String(regions.length)} of ${String(inScope)}`,
          },
        ]),
  ];

  return (
    <>
      <Masthead
        current="map"
        release={periodLabel === null ? null : `IVI · ${periodLabel}`}
      />

      <PageBody>
        <header>
          <Breadcrumb
            state={state === null ? null : { code: state.code, name: state.name }}
            regionCode={selectedCode}
          />
          <Dateline>Jobs and Skills Australia · Internet Vacancy Index</Dateline>
          <PageTitle>
            {state === null
              ? 'Where the advertisements are'
              : `Advertisements in ${state.name}`}
          </PageTitle>
          <Lede>
            {subject} across {where}
            {periodLabel === null ? '' : `, ${periodLabel}`}. Capital cities are shown as
            whole cities and the rest of the country by region, which is how the index is
            published.
          </Lede>

          <ReleaseStrip fields={fields} />

          {unknownState ? (
            <Advisory>
              <strong className="text-ink font-medium">
                That state or territory was not recognised,
              </strong>{' '}
              so the whole country is shown instead.
            </Advisory>
          ) : null}
          {unknownOccupation ? (
            <Advisory>
              <strong className="text-ink font-medium">
                This release does not report that occupation,
              </strong>{' '}
              so all occupations are shown instead. The list below is the
              publisher&rsquo;s own, and it is what may be asked for.
            </Advisory>
          ) : null}
        </header>

        <OccupationFilter
          occupations={occupations}
          selected={occupationCode}
          stateCode={state?.code ?? null}
          regionCode={selectedCode}
        />

        {hasFigures ? (
          <>
            <Plate
              margin={
                selectedRegion !== null ? (
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
                ) : elsewhere !== null ? (
                  <RegionElsewhere
                    name={elsewhere.name}
                    href={regionHref(elsewhere.code, elsewhere.stateCode)}
                    where={
                      states.find((area) => area.code === elsewhere.stateCode)?.name ??
                      'another state'
                    }
                  />
                ) : requestedCode !== null && requestedRegion === null ? (
                  <RegionNotFound code={requestedCode} />
                ) : (
                  <RegionPrompt tableId={TABLE_ID} />
                )
              }
              below={
                <VacancyTable
                  id={TABLE_ID}
                  regions={regions}
                  selectedCode={selectedCode}
                  stateCode={state?.code ?? null}
                  caption={`${subject} by region${
                    periodLabel === null ? '' : `, ${periodLabel}`
                  }. Ordered by number of advertisements. Select a region for its
                  figures; bars are scaled to the largest figure shown.`}
                />
              }
            >
              <div>
                {/*
                  Every region on the map is a link, which is what makes it
                  operable by keyboard, and also what puts fifty tab stops
                  between the page and the table. This is the standard escape
                  hatch: hidden until focused, so it costs a sighted mouse user
                  nothing.
                */}
                <a
                  href={`#${TABLE_ID}`}
                  className="focus:bg-paper-raised focus:text-ink focus:border-rule-strong sr-only focus:not-sr-only focus:mb-4 focus:inline-block focus:border focus:px-3 focus:py-2 focus:text-sm"
                >
                  Skip the map, go to the table of figures
                </a>

                <FigureFrame
                  title={`${subject} by region, ${where}`}
                  subtitle={`${
                    periodLabel === null ? 'Reference period not stated' : periodLabel
                  }. Counts of advertisements, not of vacancies. Shaded by rank, in five equal groups of regions.`}
                  source={attribution}
                  legend={
                    <VacancyLegend
                      bins={bins}
                      hasMissing={regions.some(
                        (region) => region.observation.value === null,
                      )}
                    />
                  }
                >
                  <VacancyMap
                    geometry={geometry}
                    regions={regions}
                    bins={bins}
                    tableId={TABLE_ID}
                    selectedCode={selectedCode}
                    stateCode={state?.code ?? null}
                  />
                </FigureFrame>
              </div>
            </Plate>

            <Notes>
              <Note>
                <strong className="text-ink font-medium">
                  This is not a count of jobs.
                </strong>{' '}
                The Internet Vacancy Index counts advertisements appearing on a defined
                set of job boards. Vacancies never advertised online, or advertised only
                through an employer&rsquo;s own site, are not in it. It is an indicator of
                advertising activity, not a measure of total Australian vacancies.
              </Note>
              <Note>
                Shading is by rank, in five equal groups of regions, not by a fixed scale.
                Greater Sydney carries more advertisements than every regional area of New
                South Wales combined, so a fixed scale would leave almost the whole map in
                the palest band. The key prints the value each band opens at.
              </Note>
              {state === null ? (
                <Note>
                  Capital cities are drawn as whole cities and the rest of each state
                  region by region, because that is how the index is published. The two
                  levels together cover the country exactly once.
                </Note>
              ) : (
                <Note>
                  Boundaries here are finer than on the national map, and the shading
                  means the same thing: the bands are the national ones, so a region does
                  not change colour when you zoom into it.
                </Note>
              )}
              {missing.length > 0 ? (
                <Note>
                  {missing.length} of {inScope} regions this index reports on carry no
                  figure for {periodLabel ?? 'this period'} and are left unshaded. No
                  figure was published for them, which is not the same as no
                  advertisements.
                </Note>
              ) : null}
            </Notes>
          </>
        ) : (
          <section className="border-rule-strong mt-12 border-t pt-6">
            <h2 className="text-ink font-serif text-2xl font-semibold">
              No figures loaded yet
            </h2>
            <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
              The geography is in place but no Internet Vacancy Index release has been
              imported. This is an empty database, not a month with no advertisements.
            </p>
          </section>
        )}

        <Colophon sources={[SOURCE_KEY, 'abs-asgs']} />
      </PageBody>
    </>
  );
}
