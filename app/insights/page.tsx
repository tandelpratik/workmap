import type { Metadata } from 'next';
import Link from 'next/link';
import { cachedOccupationTotals, cachedStates } from '@/app/cached-queries';
import { toAreaSlug } from '@/domain/geography';
import { concentration, isLeafCode } from '@/domain/occupation';
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
} from '@/components/layout/plate';
import { FigureFrame } from '@/components/layout/figure-frame';
import { ReleaseStrip, type ReleaseField } from '@/components/data/release-strip';
import { RankedTable } from '@/components/ui/ranked-table';
import { Label } from '@/components/ui/label';
import { link } from '@/components/ui/link';
import { cn } from '@/components/ui/cn';

/**
 * What the release says that a ranking does not.
 *
 * The rankings elsewhere answer "which is biggest" and "which moved most". Both
 * are dominated by size, and both are already on their own pages, so repeating
 * them here would make this a digest of other pages rather than a page.
 *
 * This answers a different question: what is each place's advertising *unlike*
 * the country's? A state advertising the national mix of occupations has no
 * specialism however large it is, and a small state devoting a third of its
 * advertising to one trade has a strong one. That is a fact about mix rather
 * than volume, it is invisible in every other view here, and it is the closest
 * thing to intelligence the two held periods support.
 *
 * The measure is ours, so it is labelled as ours, and the note under it says
 * what it is not: a high figure is not more jobs.
 */

export const dynamic = 'force-dynamic';

const EDITION = 'ASGS2026';
const DATASET = 'Internet Vacancy Index';
const SOURCE_KEY = 'jsa-ivi';
const TOTAL_OCCUPATION_CODE = '0';

/** How many specialisms to show per state. */
const PER_STATE = 4;

/**
 * Advertisements a state must have in a group before its concentration is
 * reported.
 *
 * A quotient built from twenty advertisements moves on one posting, and without
 * a floor this page becomes a ranking of the smallest samples in the country.
 */
const FLOOR = 100;

export const metadata: Metadata = {
  title: 'Insights',
  description:
    'Which occupations each Australian state advertises more of than the country as a whole, from the Jobs and Skills Australia Internet Vacancy Index.',
};

const numberFormat = new Intl.NumberFormat('en-AU');
const quotientFormat = new Intl.NumberFormat('en-AU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const shareFormat = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 });
const monthFormat = new Intl.DateTimeFormat('en-AU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

interface Specialism {
  readonly code: string;
  readonly name: string | null;
  readonly value: number;
  readonly quotient: number;
  /** Share of this state's advertising, for reading the quotient against. */
  readonly localShare: number;
}

interface StateSpecialisms {
  readonly code: string;
  readonly name: string;
  readonly slug: string;
  readonly total: number;
  readonly specialisms: readonly Specialism[];
}

export default async function InsightsPage() {
  const [states, national] = await Promise.all([
    cachedStates(EDITION, 'STATE'),
    cachedOccupationTotals({
      sourceKey: SOURCE_KEY,
      dataset: DATASET,
      edition: EDITION,
      levels: ['GCCSA', 'SA4'],
    }),
  ]);

  const areas = states.ok ? states.value : [];

  const scoped = await Promise.all(
    areas.map(async (area) => ({
      area,
      result: await cachedOccupationTotals({
        sourceKey: SOURCE_KEY,
        dataset: DATASET,
        edition: EDITION,
        levels: ['GCCSA', 'SA4'],
        stateCode: area.code,
      }),
    })),
  );

  const period = national.ok ? national.value.period : null;
  const periodLabel = period === null ? null : monthFormat.format(period);

  const nationalGroups = national.ok ? national.value.occupations : [];
  const publishedCodes = nationalGroups.map((entry) => entry.code);
  const nationalTotal =
    nationalGroups.find((entry) => entry.code === TOTAL_OCCUPATION_CODE)?.total ?? null;
  const nationalByCode = new Map(
    nationalGroups.map((entry) => [entry.code, entry.total]),
  );

  const byState: StateSpecialisms[] = scoped.flatMap(({ area, result }) => {
    if (!result.ok || nationalTotal === null) return [];

    const localTotal =
      result.value.occupations.find((entry) => entry.code === TOTAL_OCCUPATION_CODE)
        ?.total ?? null;
    if (localTotal === null || localTotal <= 0) return [];

    const specialisms = result.value.occupations
      .flatMap((entry): Specialism[] => {
        // The all-occupations row is the denominator, not a group. Parent
        // groups are their children added up, and would report the same
        // specialism twice at two grains.
        if (entry.code === TOTAL_OCCUPATION_CODE) return [];
        if (!isLeafCode(entry.code, publishedCodes)) return [];
        if (entry.total === null || entry.total < FLOOR) return [];

        const nationalValue = nationalByCode.get(entry.code) ?? null;
        if (nationalValue === null) return [];

        const quotient = concentration({
          localValue: entry.total,
          localTotal,
          nationalValue,
          nationalTotal,
        });
        if (quotient === null) return [];

        return [
          {
            code: entry.code,
            name: entry.name,
            value: entry.total,
            quotient,
            localShare: (entry.total / localTotal) * 100,
          },
        ];
      })
      .sort((a, b) => b.quotient - a.quotient)
      // Only genuine over-representation. A state whose most distinctive group
      // still sits below the national proportion has no specialism, and
      // printing its least-under-represented group as one would invent a
      // finding.
      .filter((entry) => entry.quotient > 1)
      .slice(0, PER_STATE);

    if (specialisms.length === 0) return [];

    return [
      {
        code: area.code,
        name: area.name,
        slug: toAreaSlug(area.name),
        total: localTotal,
        specialisms,
      },
    ];
  });

  byState.sort((a, b) => b.total - a.total);

  const fields: ReleaseField[] = [
    ...(periodLabel === null ? [] : [{ label: 'Reference period', value: periodLabel }]),
    ...(nationalTotal === null
      ? []
      : [{ label: 'Advertisements', value: numberFormat.format(nationalTotal) }]),
    { label: 'Areas compared', value: String(byState.length) },
    { label: 'Basis', value: 'Share of local advertising' },
  ];

  return (
    <>
      <Masthead
        current="insights"
        release={periodLabel === null ? null : `IVI · ${periodLabel}`}
      />

      <PageBody>
        <header>
          <Dateline>
            Jobs and Skills Australia · Internet Vacancy Index
            {periodLabel === null ? '' : ` · ${periodLabel}`}
          </Dateline>
          <PageTitle>What each place advertises more of</PageTitle>
          <Lede>
            Every state advertises across the whole range of work. These are the
            occupations each one devotes a larger share of its advertising to than the
            country does.
          </Lede>
          {byState.length === 0 ? null : <ReleaseStrip fields={fields} />}
        </header>

        <section className="border-rule-heavy mt-10 border-t-2 pt-5">
          <Label as="h2">How to read this</Label>
          <div className="text-ink-muted mt-4 grid max-w-4xl grid-cols-1 gap-x-10 gap-y-3 text-sm leading-relaxed md:grid-cols-2">
            <p>
              The figure beside each group is its share of that state&rsquo;s advertising,
              divided by its share of Australia&rsquo;s.{' '}
              <strong className="text-ink font-medium">1.00</strong> means the state
              advertises the group in the national proportion.{' '}
              <strong className="text-ink font-medium">1.80</strong> means nearly twice
              that proportion.
            </p>
            <p>
              <strong className="text-ink font-medium">
                A high figure is not more jobs.
              </strong>{' '}
              It is a statement about mix. A small state concentrating on one trade will
              rank above a large state advertising many more of those roles, and the
              advertisement count is printed beside it so the two are never confused.
            </p>
          </div>
        </section>

        {byState.length === 0 ? (
          <section className="border-rule-strong mt-12 border-t pt-6">
            <h2 className="text-ink font-serif text-2xl font-semibold">
              Nothing to compare yet
            </h2>
            <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
              This comparison needs a loaded release with figures for both the country and
              its states. No Internet Vacancy Index release has been imported, or none of
              its groups clears the reporting floor.
            </p>
          </section>
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-12 lg:grid-cols-2">
            {byState.map((state) => (
              <section key={state.code} className="min-w-0">
                <FigureFrame
                  title={state.name}
                  subtitle={`${numberFormat.format(
                    state.total,
                  )} advertisements. The groups it devotes the largest share of them to, relative to the country.`}
                  aside={
                    <Link
                      href={`/locations/${state.slug}`}
                      prefetch={false}
                      className={cn(link(), 'text-sm')}
                    >
                      Full profile
                    </Link>
                  }
                >
                  <RankedTable
                    minWidth="min-w-[19rem]"
                    captionHidden
                    caption={`Occupation groups that ${state.name} advertises a larger share of than Australia as a whole${
                      periodLabel === null ? '' : `, ${periodLabel}`
                    }.`}
                    rows={state.specialisms}
                    rowKey={(entry) => entry.code}
                    heading="Occupation group"
                    figureHeading="Concentration"
                    /*
                      No bar. The bar scales lengths against the largest value
                      shown, which would compare one state's quotients with
                      another's across the grid and imply a ranking between
                      panels that this page is not making.
                    */
                    bar={false}
                    name={(entry) => ({
                      label: occupationLabel(entry),
                      href: `/occupations/${encodeURIComponent(entry.code)}`,
                    })}
                    figure={(entry) => ({
                      value: null,
                      absence: quotientFormat.format(entry.quotient),
                    })}
                    after={[
                      {
                        heading: 'Share here',
                        align: 'right',
                        compact: true,
                        render: (entry) => `${shareFormat.format(entry.localShare)}%`,
                      },
                      {
                        heading: 'Ads',
                        align: 'right',
                        compact: true,
                        render: (entry) => numberFormat.format(entry.value),
                      },
                    ]}
                  />
                </FigureFrame>
              </section>
            ))}
          </div>
        )}

        <Notes>
          <Note>
            The concentration figure is calculated here, not published by Jobs and Skills
            Australia. It is a group&rsquo;s share of a state&rsquo;s advertising divided
            by its share of the country&rsquo;s, computed from the figures the publisher
            released by region.
          </Note>
          <Note>
            Only the finest groups the release carries are compared. A parent group is its
            children added together, so including both would report one specialism twice
            at two levels of detail.
          </Note>
          <Note>
            A group is only shown where the state advertised at least {String(FLOOR)} of
            them. A quotient built from a handful of advertisements moves on a single
            posting, and without the floor this page would rank the smallest samples in
            the country.
          </Note>
          <Note>
            Only groups above the national proportion are listed. A state whose most
            distinctive group still sits below it has no specialism, and printing its
            least under-represented group as one would invent a finding.
          </Note>
          <Note>
            These are counts of advertisements on a defined set of job boards, not of
            vacancies, and not of people employed. A state may specialise in advertising
            work it also imports labour to do.
          </Note>
          <Note>
            One reference period. This says what the mix is, not that it is changing.{' '}
            <Link href="/occupations" prefetch={false} className={link()}>
              The month&rsquo;s movements
            </Link>{' '}
            are on the occupations page.
          </Note>
        </Notes>

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
