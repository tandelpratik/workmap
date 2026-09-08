import type { Metadata } from 'next';
import Link from 'next/link';
import {
  cachedOccupationTotals,
  cachedRegionTotals,
  cachedStates,
} from '@/app/cached-queries';
import { stateAbbreviation, toAreaSlug } from '@/domain/geography';
import { concentration } from '@/domain/occupation';
import { employmentTypes } from '@/domain/job';
import { sponsorshipSignals } from '@/domain/sponsorship';
import { occupationLabel } from '@/components/occupation-filter';
import { ExploreForm } from '@/components/explore-form';
import type { Choice } from '@/components/compare-form';
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
} from '@/components/layout/plate';
import { FigureFrame } from '@/components/layout/figure-frame';
import { Label } from '@/components/ui/label';
import { link } from '@/components/ui/link';

/**
 * Where should I look?
 *
 * The product's tagline as a page. Everything else here presents figures and
 * lets a reader draw the conclusion; this one draws it, which means it has to be
 * unusually careful about what the conclusion actually is.
 *
 * It ranks places by how much of the chosen work each advertises, and says so in
 * those words. It is not a recommendation about where to live, it does not
 * predict anything, and it does not know whether anyone will be hired. Every
 * heading and every column says what it is measuring, because the failure mode
 * here is a reader taking "first in this list" to mean "best place for me".
 *
 * The second column is the interesting one. Volume alone sends everybody to New
 * South Wales for everything, because New South Wales advertises the most of
 * nearly everything. Concentration says whether a place is *unusually* oriented
 * towards this work, which is a different and often more useful answer for
 * someone deciding where to move.
 *
 * The two preference controls do not touch the ranking and say so. The index
 * publishes advertising by occupation and region; it knows nothing about
 * employment type or sponsorship. Those preferences are carried into the link to
 * the advertisements, where the data supports them.
 */

export const dynamic = 'force-dynamic';

const EDITION = 'ASGS2026';
const DATASET = 'Internet Vacancy Index';
const SOURCE_KEY = 'jsa-ivi';
const TOTAL_OCCUPATION_CODE = '0';

/** Below this, a concentration figure is not reported. See domain/occupation. */
const FLOOR = 60;

export const metadata: Metadata = {
  title: 'Where should I look',
  description:
    'Choose a kind of work and see which Australian states advertise the most of it, and which are unusually oriented towards it.',
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

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single?.trim() === '' ? undefined : single?.trim();
}

interface Place {
  readonly code: string;
  readonly name: string;
  readonly slug: string;
  readonly abbreviation: string | null;
  readonly value: number;
  /** Share of this occupation's national advertising. */
  readonly shareOfOccupation: number | null;
  /** Share of this place's own advertising, and how that compares nationally. */
  readonly shareOfPlace: number | null;
  readonly quotient: number | null;
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedOccupation = first(params['occupation']);
  const requestedType = first(params['type']);
  const employmentType = employmentTypes.find((value) => value === requestedType);
  const requestedSponsorship = first(params['sponsorship']);
  const sponsorship = sponsorshipSignals.find((value) => value === requestedSponsorship);

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
  const nationalGroups = national.ok ? national.value.occupations : [];
  const period = national.ok ? national.value.period : null;
  const periodLabel = period === null ? null : monthFormat.format(period);

  const nationalTotal =
    nationalGroups.find((entry) => entry.code === TOTAL_OCCUPATION_CODE)?.total ?? null;

  const choices: readonly Choice[] = nationalGroups
    .filter((entry) => entry.code !== TOTAL_OCCUPATION_CODE && entry.total !== null)
    .map((entry) => ({ value: entry.code, label: occupationLabel(entry) }));

  const chosen =
    requestedOccupation === undefined
      ? null
      : (nationalGroups.find((entry) => entry.code === requestedOccupation) ?? null);

  // Regions for the chosen occupation, and each state's own all-occupations
  // total, which is the denominator concentration needs.
  const [regions, byState] = chosen
    ? await Promise.all([
        cachedRegionTotals({
          sourceKey: SOURCE_KEY,
          dataset: DATASET,
          edition: EDITION,
          levels: ['GCCSA', 'SA4'],
          occupationCode: chosen.code,
        }),
        Promise.all(
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
        ),
      ])
    : [null, null];

  const places: Place[] =
    chosen && regions?.ok === true && byState !== null
      ? byState
          .flatMap(({ area, result }): Place[] => {
            const reporting = regions.value.regions.filter(
              (region) =>
                region.stateCode === area.code && region.observation.value !== null,
            );
            if (reporting.length === 0) return [];

            const value = reporting.reduce(
              (running, region) => running + (region.observation.value ?? 0),
              0,
            );

            const placeTotal = result.ok
              ? (result.value.occupations.find(
                  (entry) => entry.code === TOTAL_OCCUPATION_CODE,
                )?.total ?? null)
              : null;

            const quotient =
              placeTotal === null || chosen.total === null || nationalTotal === null
                ? null
                : concentration({
                    localValue: value,
                    localTotal: placeTotal,
                    nationalValue: chosen.total,
                    nationalTotal,
                  });

            return [
              {
                code: area.code,
                name: area.name,
                slug: toAreaSlug(area.name),
                abbreviation: stateAbbreviation(area.name),
                value,
                shareOfOccupation:
                  chosen.total === null || chosen.total === 0
                    ? null
                    : (value / chosen.total) * 100,
                shareOfPlace:
                  placeTotal === null || placeTotal === 0
                    ? null
                    : (value / placeTotal) * 100,
                // Suppressed on a small base, for the reason recorded in
                // domain/occupation: a quotient from a handful of
                // advertisements moves on one posting.
                quotient: value < FLOOR ? null : quotient,
              },
            ];
          })
          .sort((a, b) => b.value - a.value)
      : [];

  /** The advertisements link for one place, carrying the reader's preferences. */
  function listingsHref(place: Place): string | null {
    if (place.abbreviation === null) return null;
    const search = new URLSearchParams({ where: place.abbreviation });
    if (chosen?.name != null) search.set('q', chosen.name.toLowerCase());
    if (employmentType !== undefined) search.set('type', employmentType);
    if (sponsorship !== undefined) search.set('sponsorship', sponsorship);
    return `/jobs?${search.toString()}`;
  }

  const mostConcentrated = [...places]
    .filter((place) => place.quotient !== null)
    .sort((a, b) => (b.quotient ?? 0) - (a.quotient ?? 0))[0];

  /*
   * The two sentences are assembled as strings rather than as JSX fragments.
   * A newline between an element and the expression after it renders as a
   * space, which put one in front of a comma: "advertises the most of this work
   * , 34.7%". The clause has to be one string for the punctuation to sit where
   * it was written.
   */
  const leadSentence =
    places[0]?.shareOfOccupation == null
      ? ' advertises the most of this work.'
      : ` advertises the most of this work, ${shareFormat.format(
          places[0].shareOfOccupation,
        )}% of the national total.`;

  const concentrationSentence =
    mostConcentrated === undefined || (mostConcentrated.quotient ?? 0) <= 1
      ? null
      : ` is the most oriented towards it, giving it ${quotientFormat.format(
          mostConcentrated.quotient ?? 0,
        )} times the share the country does.`;

  return (
    <>
      <Masthead release={periodLabel === null ? null : `IVI · ${periodLabel}`} />

      <PageBody>
        <header>
          <Dateline>
            Jobs and Skills Australia · Internet Vacancy Index
            {periodLabel === null ? '' : ` · ${periodLabel}`}
          </Dateline>
          <PageTitle>Where should I look?</PageTitle>
          <Lede>
            Choose a kind of work and see where it is advertised. This ranks places by
            advertising activity. It is not advice about where to live, and it does not
            predict whether anyone will be hired.
          </Lede>
        </header>

        <ExploreForm
          occupations={choices}
          occupation={requestedOccupation}
          sponsorship={sponsorship}
          employmentType={employmentType}
        />

        {requestedOccupation !== undefined && chosen === null ? (
          <Advisory>
            No occupation group matches &ldquo;{requestedOccupation}&rdquo;. Choose one
            from the list.
          </Advisory>
        ) : null}

        {chosen === null ? (
          <section className="border-rule-strong mt-12 border-t pt-6">
            <h2 className="text-ink font-serif text-2xl font-semibold">
              Start with the work
            </h2>
            <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
              Pick an occupation group above. The answer is built from the Internet
              Vacancy Index, which counts advertisements on a defined set of job boards
              rather than vacancies, so it describes where this kind of work is being
              advertised and not where all of it exists.
            </p>
          </section>
        ) : places.length === 0 ? (
          <Advisory>
            No state reported a figure for {occupationLabel(chosen)} in this release, so
            there is nothing to rank.
          </Advisory>
        ) : (
          <>
            <section className="mt-12">
              <FigureFrame
                title={`Where ${occupationLabel(chosen)} is advertised`}
                subtitle={`${
                  periodLabel ?? 'Reference period not stated'
                }. States ordered by number of advertisements, summed from the regions the index reports.`}
              >
                <div className="scroll-x">
                  <table className="w-full min-w-[30rem] border-collapse text-sm">
                    <caption className="sr-only">
                      States and territories ordered by advertisements for{' '}
                      {occupationLabel(chosen)}, with each one&rsquo;s share of the
                      national total, the share of its own advertising, and how that
                      compares with the country.
                    </caption>
                    <thead>
                      <tr className="border-rule-heavy border-b-2">
                        {[
                          { key: 'rank', label: 'Rank', align: 'right' },
                          { key: 'place', label: 'State or territory', align: 'left' },
                          { key: 'ads', label: 'Advertisements', align: 'right' },
                          {
                            key: 'share',
                            label: 'Of the national total',
                            align: 'right',
                          },
                          {
                            key: 'local',
                            label: 'Of its own advertising',
                            align: 'right',
                          },
                          { key: 'conc', label: 'Against the country', align: 'right' },
                        ].map((column) => (
                          <th
                            key={column.key}
                            scope="col"
                            className={`text-ink-faint text-label py-2 font-normal uppercase ${
                              column.align === 'right' ? 'pl-4 text-right' : 'text-left'
                            } ${column.key === 'local' || column.key === 'conc' ? 'hidden sm:table-cell' : ''}`}
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {places.map((place, index) => (
                        <tr key={place.code} className="border-rule border-b">
                          <td className="text-ink-faint tabular py-2.5 text-right font-mono text-xs">
                            {index + 1}
                          </td>
                          <th scope="row" className="py-2.5 text-left font-normal">
                            <Link
                              href={`/locations/${place.slug}`}
                              prefetch={false}
                              className={link()}
                            >
                              {place.name}
                            </Link>
                            {listingsHref(place) === null ? null : (
                              <Link
                                href={listingsHref(place) ?? '#'}
                                prefetch={false}
                                className="text-ink-faint hover:text-ink block text-xs underline-offset-4 hover:underline"
                              >
                                advertisements held here
                              </Link>
                            )}
                          </th>
                          <td className="tabular text-ink py-2.5 pl-4 text-right font-mono font-medium">
                            {numberFormat.format(place.value)}
                          </td>
                          <td className="tabular text-ink-muted py-2.5 pl-4 text-right font-mono">
                            {place.shareOfOccupation === null
                              ? '—'
                              : `${shareFormat.format(place.shareOfOccupation)}%`}
                          </td>
                          <td className="tabular text-ink-muted hidden py-2.5 pl-4 text-right font-mono sm:table-cell">
                            {place.shareOfPlace === null
                              ? '—'
                              : `${shareFormat.format(place.shareOfPlace)}%`}
                          </td>
                          <td className="tabular hidden py-2.5 pl-4 text-right font-mono sm:table-cell">
                            {place.quotient === null ? (
                              <span className="text-ink-faint font-sans text-xs">
                                Too few to say
                              </span>
                            ) : (
                              <span
                                className={
                                  place.quotient > 1
                                    ? 'text-ink font-medium'
                                    : 'text-ink-muted'
                                }
                              >
                                {quotientFormat.format(place.quotient)}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </FigureFrame>
            </section>

            <section className="border-rule-heavy mt-12 border-t-2 pt-5">
              <Label as="h2">Reading this</Label>
              <div className="text-ink-muted mt-4 grid max-w-4xl grid-cols-1 gap-x-10 gap-y-3 text-sm leading-relaxed md:grid-cols-2">
                <p>
                  <strong className="text-ink font-medium">
                    {places[0]?.name ?? ''}
                  </strong>
                  {leadSentence} The largest states advertise the most of nearly
                  everything, so first place here is often a fact about the state rather
                  than about the work.
                </p>
                <p>
                  {concentrationSentence === null ? (
                    <>
                      No state devotes an unusual share of its advertising to this work.
                      It is spread roughly in proportion to how much each place advertises
                      overall.
                    </>
                  ) : (
                    <>
                      <strong className="text-ink font-medium">
                        {mostConcentrated?.name ?? ''}
                      </strong>
                      {concentrationSentence} That is the column worth reading if you are
                      deciding where to move rather than where the most openings are.
                    </>
                  )}
                </p>
              </div>
            </section>
          </>
        )}

        <Notes>
          <Note>
            This ranks advertising activity. It is not a recommendation, not a prediction,
            and not advice about employment, migration or where to live. Nothing here says
            anyone will be hired anywhere.
          </Note>
          <Note>
            State figures are sums of the regions Jobs and Skills Australia publishes,
            computed here. Their regions cover Australia exactly once, so the sum is well
            defined, but it is our arithmetic rather than a figure they released.
          </Note>
          <Note>
            The last column is a place&rsquo;s share of its own advertising divided by the
            country&rsquo;s share. Above 1 means unusually oriented towards this work. It
            is a statement about mix, not about volume: the advertisement count is beside
            it for exactly that reason.
          </Note>
          <Note>
            Employment type and sponsorship do not change the ranking and are not part of
            it. The index publishes advertising by occupation and region and knows nothing
            about either, so those preferences are carried into the advertisements, where
            the data supports them.
          </Note>
          <Note>
            The advertisements are found by searching their words, not by an occupation
            classification. Listings are not mapped to occupation codes, so that link is a
            keyword search and will miss roles worded differently.
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
