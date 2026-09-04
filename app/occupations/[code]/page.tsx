import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findSourceDescriptor } from '@/config/sources';
import {
  cachedOccupations,
  cachedOccupationTotals,
  cachedRegionTotals,
} from '@/app/cached-queries';
import { occupationLabel } from '@/components/occupation-filter';
import { SiteHeader } from '@/components/site-header';
import { VacancyTable } from '@/components/vacancy-table';

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

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-ink-muted max-w-measure mt-3 space-y-3 text-sm leading-relaxed">
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-rule flex items-baseline justify-between gap-6 border-b py-2 last:border-b-0">
      <dt className="text-ink-muted text-sm">{label}</dt>
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
  const [occupation, totals, across] = await Promise.all([
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
  ]);

  // A code the release does not carry is a missing page, not an empty one.
  // Answering with 200 and a blank profile would tell a search engine, and a
  // reader, that this occupation exists and reported nothing.
  if (occupation === null) notFound();

  const label = occupationLabel(occupation);

  const descriptor = findSourceDescriptor(SOURCE_KEY);

  if (!totals.ok) {
    return (
      <>
        <SiteHeader current="occupations" />
        <main id="main" className="mx-auto max-w-5xl px-6 py-16">
          <h1 className="text-ink font-serif text-4xl font-semibold">{label}</h1>
          <Prose>
            <p>These figures cannot be shown. {totals.error.message}</p>
          </Prose>
        </main>
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

  const busiest = [...regions]
    .filter((region) => region.observation.value !== null)
    .sort((a, b) => (b.observation.value ?? 0) - (a.observation.value ?? 0))[0];

  return (
    <>
      <SiteHeader current="occupations" />

      <main id="main" className="mx-auto max-w-5xl px-6 py-16">
        <header>
          <nav aria-label="Breadcrumb" className="mb-4">
            <ol className="text-ink-muted flex flex-wrap items-center gap-2 text-sm">
              <li>
                <Link
                  href="/occupations"
                  prefetch={false}
                  className="text-ink hover:text-accent underline underline-offset-4"
                >
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

          <p className="text-ink-faint text-xs font-medium tracking-widest uppercase">
            What
          </p>
          <h1 className="text-ink mt-2 font-serif text-4xl font-semibold text-balance">
            {occupation.name ?? `Occupation ${occupation.code}`}
          </h1>
          <Prose>
            <p>
              Online job advertisements
              {period === null ? '' : `, ${monthFormat.format(period)}`}, as published by
              Jobs and Skills Australia under code{' '}
              <span className="font-mono text-xs">{occupation.code}</span>. The name is
              the publisher&rsquo;s own.
            </p>
          </Prose>
        </header>

        {period === null ? (
          <section className="border-rule-strong mt-12 border-t pt-6">
            <h2 className="text-ink font-serif text-2xl font-semibold">
              No figures loaded yet
            </h2>
            <Prose>
              <p>
                No Internet Vacancy Index release has been imported. This is an empty
                database, not a month with no advertisements.
              </p>
            </Prose>
          </section>
        ) : (
          <>
            <section className="mt-12">
              <dl className="border-rule-strong border-t">
                <Row label="Advertisements, all regions">
                  {summary?.total === null || summary === null ? (
                    <span className="text-ink-muted">No figure</span>
                  ) : (
                    <span className="font-mono tabular-nums">
                      {numberFormat.format(summary.total)}
                    </span>
                  )}
                </Row>

                <Row label="Change on the month before">
                  {change === null ? (
                    <span className="text-ink-muted">
                      {previousPeriod === null
                        ? 'No earlier month held'
                        : `Not published for ${monthFormat.format(previousPeriod)}`}
                    </span>
                  ) : (
                    <span className="font-mono tabular-nums">
                      {signedFormat.format(change)}
                      {percent === null ? '' : ` (${percentFormat.format(percent)}%)`}
                    </span>
                  )}
                </Row>

                <Row label="Rank among groups">
                  {rankIndex === -1 ? (
                    <span className="text-ink-muted">Not ranked</span>
                  ) : (
                    <span className="tabular-nums">
                      {rankIndex + 1} of {ranked.length} by advertisements
                    </span>
                  )}
                </Row>

                <Row label="Most advertised in">
                  {busiest === undefined ? (
                    <span className="text-ink-muted">No region reported a figure</span>
                  ) : (
                    <span>
                      {busiest.name}
                      <span className="text-ink-muted font-mono text-xs">
                        {' '}
                        {numberFormat.format(busiest.observation.value ?? 0)}
                      </span>
                    </span>
                  )}
                </Row>

                <Row label="Regions reporting">
                  <span className="tabular-nums">
                    {regions.length} of {regions.length + withoutData.length}
                  </span>
                </Row>
              </dl>

              <Prose>
                <p>
                  The figure above is the sum of the regions the publisher reports on,
                  added here rather than published as a national total by Jobs and Skills
                  Australia. Its regions cover Australia exactly once, so the sum is well
                  defined, but it is our arithmetic and not their figure.
                </p>
                <p>
                  <a
                    href={`/map?occupation=${encodeURIComponent(occupation.code)}`}
                    className="text-ink hover:text-accent underline underline-offset-4"
                  >
                    See this occupation on the map
                  </a>
                  , where the same figures are shaded by region.
                </p>
              </Prose>
            </section>

            <VacancyTable
              id={TABLE_ID}
              regions={regions}
              selectedCode={null}
              stateCode={null}
              caption={`${label} by region${
                period === null ? '' : `, ${monthFormat.format(period)}`
              }. Ordered by number of advertisements. Region names link to the map.`}
            />
          </>
        )}

        <footer className="border-rule-strong mt-16 border-t pt-6">
          <p className="text-ink-faint max-w-measure text-xs leading-relaxed">
            {descriptor?.attributionText ??
              'Based on Jobs and Skills Australia Internet Vacancy Index data.'}{' '}
            The Internet Vacancy Index counts advertisements on a defined set of job
            boards. It is an indicator of advertising activity, not a measure of total
            Australian vacancies.
          </p>
        </footer>
      </main>
    </>
  );
}
