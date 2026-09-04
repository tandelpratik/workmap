import type { Metadata } from 'next';
import { findSourceDescriptor } from '@/config/sources';
import { listRegionTotals } from '@/db/repositories/labour-market';
import { buildChoroplethGeometry, quantileBins } from '@/geography/choropleth';
import { VacancyLegend, VacancyMap } from '@/components/vacancy-map';
import { RegionDetail, RegionNotFound } from '@/components/region-detail';
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
 * ASGS codes are short alphanumerics, "101" and "1GSYD" among them. A query
 * string is external input, so it is bounded before it is used rather than
 * passed to a lookup and hoped about. Anything failing this is treated as no
 * selection rather than as an error: a malformed link still shows the map.
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
  const requestedCode = selectedCodeFrom((await searchParams)['region']);
  const totals = await listRegionTotals({
    sourceKey: SOURCE_KEY,
    dataset: DATASET,
    edition: EDITION,
    // Capitals at GCCSA, everywhere else at SA4. This is how IVI publishes,
    // and the two levels together cover the country exactly once.
    levels: ['GCCSA', 'SA4'],
    totalOccupationCode: TOTAL_OCCUPATION_CODE,
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

  const { period, previousPeriod, regions, withoutData } = totals.value;

  // A code that parses but names no region in this release is answered rather
  // than ignored. Silently dropping it would leave a reader who followed a
  // stale link looking at a map that behaved as though they had not clicked.
  const selectedRegion =
    requestedCode === null
      ? null
      : (regions.find((region) => region.code === requestedCode) ?? null);
  const selectedCode = selectedRegion?.code ?? null;

  // Rank is computed from the same ordering the table uses, so the panel and
  // the table cannot disagree about which region is third.
  const withFigures = [...regions]
    .filter((region) => region.observation.value !== null)
    .sort((a, b) => (b.observation.value ?? 0) - (a.observation.value ?? 0));
  const rankIndex =
    selectedRegion === null
      ? -1
      : withFigures.findIndex((region) => region.code === selectedRegion.code);
  const values = regions
    .map((region) => region.observation.value)
    .filter((value): value is number => value !== null);
  const bins = quantileBins(values, 5);
  const geometry = await buildChoroplethGeometry({
    edition: EDITION,
    levels: ['GCCSA', 'SA4'],
  });

  const hasFigures = regions.length > 0 && period !== null;

  return (
    <>
      <SiteHeader current="map" />

      <main id="main" className="mx-auto max-w-5xl px-6 py-16">
        <header>
          <p className="text-ink-faint text-xs font-medium tracking-widest uppercase">
            Where
          </p>
          <h1 className="text-ink mt-2 font-serif text-4xl font-semibold text-balance">
            Where the advertisements are
          </h1>
          <Prose>
            <p>
              Online job advertisements across Australia
              {period === null ? '' : `, ${monthFormat.format(period)}`}. Capital cities
              are shown as whole cities and the rest of the country by region, which is
              how the index is published.
            </p>
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

        {hasFigures ? (
          <section className="mt-12">
            <VacancyMap
              geometry={geometry}
              regions={regions}
              bins={bins}
              tableId={TABLE_ID}
              selectedCode={selectedCode}
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
              />
            )}
            {requestedCode !== null && selectedRegion === null ? (
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
              caption={`Online job advertisements by region${
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
