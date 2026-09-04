import type { Metadata } from 'next';
import { findSourceDescriptor } from '@/config/sources';
import { listOccupationTotals } from '@/db/repositories/labour-market';
import { occupationLabel } from '@/components/occupation-filter';
import { SiteHeader } from '@/components/site-header';

/**
 * WHAT: which occupations are being advertised.
 *
 * The second leg of the product's grammar, and the first surface to read the
 * occupation dimension across the whole vocabulary rather than one group at a
 * time. Server rendered, like everything else here.
 *
 * The figures are sums across the regions JSA published: our arithmetic on
 * their partition of the country, not a national figure they released. The
 * caption says so rather than leaving a reader to assume otherwise.
 */

export const dynamic = 'force-dynamic';

const EDITION = 'ASGS2026';
const DATASET = 'Internet Vacancy Index';
const SOURCE_KEY = 'jsa-ivi';
const TOTAL_OCCUPATION_CODE = '0';

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

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-ink-muted max-w-measure mt-3 space-y-3 text-sm leading-relaxed">
      {children}
    </div>
  );
}

export default async function OccupationsPage() {
  const result = await listOccupationTotals({
    sourceKey: SOURCE_KEY,
    dataset: DATASET,
    edition: EDITION,
    levels: ['GCCSA', 'SA4'],
  });

  const descriptor = findSourceDescriptor(SOURCE_KEY);

  if (!result.ok) {
    return (
      <>
        <SiteHeader current="occupations" />
        <main id="main" className="mx-auto max-w-5xl px-6 py-16">
          <h1 className="text-ink font-serif text-4xl font-semibold">
            What is being advertised
          </h1>
          <Prose>
            <p>These figures cannot be shown. {result.error.message}</p>
          </Prose>
        </main>
      </>
    );
  }

  const { period, previousPeriod, occupations, regionsInScope } = result.value;
  // The all-occupations row is the whole, not one of the parts, so it heads the
  // page rather than competing in the ranking below it.
  const total = occupations.find((entry) => entry.code === TOTAL_OCCUPATION_CODE) ?? null;
  const groups = occupations.filter((entry) => entry.code !== TOTAL_OCCUPATION_CODE);

  return (
    <>
      <SiteHeader current="occupations" />

      <main id="main" className="mx-auto max-w-5xl px-6 py-16">
        <header>
          <p className="text-ink-faint text-xs font-medium tracking-widest uppercase">
            What
          </p>
          <h1 className="text-ink mt-2 font-serif text-4xl font-semibold text-balance">
            What is being advertised
          </h1>
          <Prose>
            <p>
              Online job advertisements by occupation group
              {period === null ? '' : `, ${monthFormat.format(period)}`}. These are the
              groups Jobs and Skills Australia publishes, in its own words and under its
              own codes.
            </p>
            <p>
              <strong className="text-ink font-medium">
                The groups overlap on purpose.
              </strong>{' '}
              A major group such as MANAGERS contains the finer groups listed under it, so
              the rows below must not be added together. Each is a figure the publisher
              reports in its own right.
            </p>
          </Prose>
        </header>

        {period === null || groups.length === 0 ? (
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
          <section className="mt-12">
            {total === null ? null : (
              <div className="border-rule-strong border-y py-5">
                <p className="text-ink-faint font-mono text-xs tracking-widest uppercase">
                  All occupations
                </p>
                <p className="text-ink mt-2 font-serif text-4xl font-semibold tabular-nums">
                  {total.total === null ? 'No figure' : numberFormat.format(total.total)}
                </p>
                <p className="text-ink-muted mt-1 text-sm">
                  advertisements across {total.regionsReporting} of {regionsInScope}{' '}
                  regions
                  {total.total === null ||
                  total.previousTotal === null ||
                  previousPeriod === null
                    ? ''
                    : `, ${signedFormat.format(
                        total.total - total.previousTotal,
                      )} on ${monthFormat.format(previousPeriod)}`}
                </p>
              </div>
            )}

            <table className="mt-8 w-full border-collapse text-sm">
              <caption className="text-ink-muted max-w-measure mb-4 text-left text-sm leading-relaxed">
                Occupation groups by number of online job advertisements
                {period === null ? '' : `, ${monthFormat.format(period)}`}. Each figure is
                the sum of the regions the publisher reports on, added here: the index is
                published by region, and its regions cover Australia exactly once.
              </caption>
              <thead>
                <tr className="border-rule-strong border-b">
                  <th scope="col" className="text-ink py-2 pr-4 text-left font-medium">
                    Occupation group
                  </th>
                  <th scope="col" className="text-ink py-2 pr-4 text-right font-medium">
                    Advertisements
                  </th>
                  <th scope="col" className="text-ink py-2 text-right font-medium">
                    On the month before
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((entry) => {
                  const change =
                    entry.total === null || entry.previousTotal === null
                      ? null
                      : entry.total - entry.previousTotal;
                  return (
                    <tr key={entry.code} className="border-rule border-b">
                      <th
                        scope="row"
                        className="text-ink py-2 pr-4 text-left font-normal"
                      >
                        <a
                          href={`/occupations/${encodeURIComponent(entry.code)}`}
                          className="text-ink hover:text-accent underline-offset-4 hover:underline"
                        >
                          {occupationLabel(entry)}
                        </a>
                      </th>
                      <td className="text-ink py-2 pr-4 text-right font-mono tabular-nums">
                        {entry.total === null ? (
                          <span className="text-ink-faint font-sans">No figure</span>
                        ) : (
                          numberFormat.format(entry.total)
                        )}
                      </td>
                      <td className="text-ink-muted py-2 text-right font-mono tabular-nums">
                        {change === null ? (
                          <span className="text-ink-faint font-sans">No comparison</span>
                        ) : (
                          signedFormat.format(change)
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
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
