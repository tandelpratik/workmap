import type { Metadata } from 'next';
import Link from 'next/link';
import {
  cachedOccupationTotals,
  cachedRegionTotals,
  cachedStates,
} from '@/app/cached-queries';
import { findAreaBySlug, toAreaSlug } from '@/domain/geography';
import { isLeafCode } from '@/domain/occupation';
import type { OccupationTotal } from '@/db/repositories/labour-market';
import { occupationLabel } from '@/components/occupation-filter';
import { CompareForm, type Choice } from '@/components/compare-form';
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
 * Two things, side by side.
 *
 * Every other page here answers a question about one thing. A ranking puts many
 * things in an order, which is not the same as a comparison: it tells a reader
 * that New South Wales is larger than Queensland and nothing about how the two
 * differ.
 *
 * The interesting difference between two places is almost never size, because
 * size is already obvious and already on the location pages. It is **mix**: what
 * one advertises that the other does not. So the comparison leads with the
 * figures, and then spends its space on where the two diverge, using the same
 * measure the insights page uses so a reader meeting it twice meets one idea.
 *
 * Two occupations compare the other way round: their size and movement, then
 * where in the country each is advertised.
 */

export const dynamic = 'force-dynamic';

const EDITION = 'ASGS2026';
const DATASET = 'Internet Vacancy Index';
const SOURCE_KEY = 'jsa-ivi';
const TOTAL_OCCUPATION_CODE = '0';

/** Rows of divergence to show. */
const DIVERGENCE_ROWS = 6;

/**
 * Advertisements a side must have before a difference in mix is reported.
 *
 * Same reasoning as the insights floor: a share computed from a handful of
 * advertisements moves on one posting, and a table of the biggest differences
 * would otherwise be a table of the smallest samples.
 */
const FLOOR = 80;

export const metadata: Metadata = {
  title: 'Compare',
  description:
    'Compare two Australian states or two occupation groups: their advertising volume, how each moved, and where the two differ.',
};

const numberFormat = new Intl.NumberFormat('en-AU');
const signedFormat = new Intl.NumberFormat('en-AU', { signDisplay: 'always' });
const percentFormat = new Intl.NumberFormat('en-AU', {
  signDisplay: 'always',
  maximumFractionDigits: 1,
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

/** A figure and its comparison, for one side. */
interface Side {
  readonly key: string;
  readonly name: string;
  readonly href: string;
  readonly total: number | null;
  readonly previousTotal: number | null;
  readonly shareOfNational: number | null;
}

function Figures({ sides, unit }: { sides: readonly Side[]; unit: string }) {
  return (
    <dl className="border-rule-heavy grid grid-cols-1 border-t-2 sm:grid-cols-2">
      {sides.map((side, index) => {
        const change =
          side.total === null || side.previousTotal === null
            ? null
            : side.total - side.previousTotal;
        const percent =
          change === null || side.previousTotal === null || side.previousTotal === 0
            ? null
            : (change / side.previousTotal) * 100;

        return (
          <div
            key={side.key}
            className={
              index === 0
                ? 'border-rule border-b py-5 sm:border-r sm:border-b-0 sm:pr-8'
                : 'py-5 sm:pl-8'
            }
          >
            <dt>
              <Link href={side.href} prefetch={false} className={link()}>
                {side.name}
              </Link>
            </dt>
            <dd className="mt-3">
              <p className="text-ink tabular text-figure font-serif font-semibold">
                {side.total === null ? 'No figure' : numberFormat.format(side.total)}
              </p>
              <p className="text-ink-muted mt-2 text-sm leading-snug">
                {unit}
                {change === null ? null : (
                  <>
                    <span className="text-ink-faint"> · </span>
                    {signedFormat.format(change)}
                    {percent === null ? '' : ` (${percentFormat.format(percent)}%)`} on
                    the month before
                  </>
                )}
                {side.shareOfNational === null ? null : (
                  <>
                    <span className="text-ink-faint"> · </span>
                    {shareFormat.format(side.shareOfNational)}% of Australia
                  </>
                )}
              </p>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** One row of a divergence table: a group, and each side's share of its own total. */
interface Divergence {
  readonly code: string;
  readonly name: string | null;
  readonly aValue: number;
  readonly bValue: number;
  readonly aShare: number;
  readonly bShare: number;
  /** Percentage points, positive where the first side is ahead. */
  readonly gap: number;
}

function DivergenceTable({
  rows,
  aName,
  bName,
  caption,
}: {
  rows: readonly Divergence[];
  aName: string;
  bName: string;
  caption: string;
}) {
  return (
    <div className="scroll-x">
      <table className="w-full min-w-[26rem] border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-rule-heavy border-b-2">
            <th
              scope="col"
              className="text-ink-faint text-label py-2 text-left font-normal uppercase"
            >
              Occupation group
            </th>
            <th
              scope="col"
              className="text-ink-faint text-label py-2 pl-4 text-right font-normal uppercase"
            >
              {aName}
            </th>
            <th
              scope="col"
              className="text-ink-faint text-label py-2 pl-4 text-right font-normal uppercase"
            >
              {bName}
            </th>
            <th
              scope="col"
              className="text-ink-faint text-label py-2 pl-4 text-right font-normal uppercase"
            >
              Gap
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.code} className="border-rule border-b">
              <th scope="row" className="py-2.5 text-left font-normal">
                <Link
                  href={`/occupations/${encodeURIComponent(row.code)}`}
                  prefetch={false}
                  className={link()}
                >
                  {occupationLabel(row)}
                </Link>
              </th>
              <td className="tabular py-2.5 pl-4 text-right font-mono">
                {shareFormat.format(row.aShare)}%
                <span className="text-ink-faint block text-xs">
                  {numberFormat.format(row.aValue)}
                </span>
              </td>
              <td className="tabular py-2.5 pl-4 text-right font-mono">
                {shareFormat.format(row.bShare)}%
                <span className="text-ink-faint block text-xs">
                  {numberFormat.format(row.bValue)}
                </span>
              </td>
              <td className="tabular text-ink py-2.5 pl-4 text-right font-mono font-medium">
                {percentFormat.format(row.gap)}
                <span className="text-ink-faint block text-xs font-normal">points</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const placeA = first(params['placeA']);
  const placeB = first(params['placeB']);
  const occupationA = first(params['occupationA']);
  const occupationB = first(params['occupationB']);

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
  const publishedCodes = nationalGroups.map((entry) => entry.code);
  const nationalTotal =
    nationalGroups.find((entry) => entry.code === TOTAL_OCCUPATION_CODE)?.total ?? null;

  const period = national.ok ? national.value.period : null;
  const previousPeriod = national.ok ? national.value.previousPeriod : null;
  const periodLabel = period === null ? null : monthFormat.format(period);

  // Only the areas the index reports on can be compared. The others exist in
  // the registry and carry no figures, so offering them would be offering a
  // comparison that cannot be drawn.
  const comparablePlaces = areas.filter((area) => area.name !== 'Outside Australia');

  const placeChoices: readonly Choice[] = comparablePlaces.map((area) => ({
    value: toAreaSlug(area.name),
    label: area.name,
  }));

  const occupationChoices: readonly Choice[] = nationalGroups
    .filter((entry) => entry.code !== TOTAL_OCCUPATION_CODE && entry.total !== null)
    .map((entry) => ({ value: entry.code, label: occupationLabel(entry) }));

  const areaA = placeA === undefined ? null : findAreaBySlug(comparablePlaces, placeA);
  const areaB = placeB === undefined ? null : findAreaBySlug(comparablePlaces, placeB);
  const comparingPlaces = areaA !== null && areaB !== null && areaA.code !== areaB.code;

  const groupA =
    occupationA === undefined
      ? null
      : (nationalGroups.find((entry) => entry.code === occupationA) ?? null);
  const groupB =
    occupationB === undefined
      ? null
      : (nationalGroups.find((entry) => entry.code === occupationB) ?? null);
  const comparingOccupations =
    groupA !== null && groupB !== null && groupA.code !== groupB.code;

  // Only fetch what the chosen comparison needs.
  const [scopedA, scopedB] = comparingPlaces
    ? await Promise.all([
        cachedOccupationTotals({
          sourceKey: SOURCE_KEY,
          dataset: DATASET,
          edition: EDITION,
          levels: ['GCCSA', 'SA4'],
          stateCode: areaA.code,
        }),
        cachedOccupationTotals({
          sourceKey: SOURCE_KEY,
          dataset: DATASET,
          edition: EDITION,
          levels: ['GCCSA', 'SA4'],
          stateCode: areaB.code,
        }),
      ])
    : [null, null];

  const [regionsA, regionsB] = comparingOccupations
    ? await Promise.all([
        cachedRegionTotals({
          sourceKey: SOURCE_KEY,
          dataset: DATASET,
          edition: EDITION,
          levels: ['GCCSA', 'SA4'],
          occupationCode: groupA.code,
        }),
        cachedRegionTotals({
          sourceKey: SOURCE_KEY,
          dataset: DATASET,
          edition: EDITION,
          levels: ['GCCSA', 'SA4'],
          occupationCode: groupB.code,
        }),
      ])
    : [null, null];

  /** The mix difference between two sets of occupation totals. */
  function divergenceBetween(
    left: readonly OccupationTotal[],
    leftTotal: number,
    right: readonly OccupationTotal[],
    rightTotal: number,
  ): Divergence[] {
    const rightByCode = new Map(right.map((entry) => [entry.code, entry.total]));

    return left
      .flatMap((entry): Divergence[] => {
        if (entry.code === TOTAL_OCCUPATION_CODE) return [];
        if (!isLeafCode(entry.code, publishedCodes)) return [];
        const aValue = entry.total;
        const bValue = rightByCode.get(entry.code) ?? null;
        if (aValue === null || bValue === null) return [];
        // Both sides must clear the floor. A group one side barely advertises
        // produces a large gap from a small sample either way.
        if (aValue < FLOOR && bValue < FLOOR) return [];

        const aShare = (aValue / leftTotal) * 100;
        const bShare = (bValue / rightTotal) * 100;
        return [
          {
            code: entry.code,
            name: entry.name,
            aValue,
            bValue,
            aShare,
            bShare,
            gap: aShare - bShare,
          },
        ];
      })
      .sort((x, y) => Math.abs(y.gap) - Math.abs(x.gap));
  }

  const placeSides: Side[] =
    comparingPlaces && scopedA?.ok === true && scopedB?.ok === true
      ? [
          { area: areaA, result: scopedA.value },
          { area: areaB, result: scopedB.value },
        ].map(({ area, result }) => {
          const all = result.occupations.find(
            (entry) => entry.code === TOTAL_OCCUPATION_CODE,
          );
          return {
            key: area.code,
            name: area.name,
            href: `/locations/${toAreaSlug(area.name)}`,
            total: all?.total ?? null,
            previousTotal: all?.previousTotal ?? null,
            shareOfNational:
              all?.total == null || nationalTotal === null || nationalTotal === 0
                ? null
                : (all.total / nationalTotal) * 100,
          };
        })
      : [];

  const placeDivergence =
    comparingPlaces &&
    scopedA?.ok === true &&
    scopedB?.ok === true &&
    placeSides[0]?.total != null &&
    placeSides[1]?.total != null
      ? divergenceBetween(
          scopedA.value.occupations,
          placeSides[0].total,
          scopedB.value.occupations,
          placeSides[1].total,
        ).slice(0, DIVERGENCE_ROWS)
      : [];

  const occupationSides: Side[] = comparingOccupations
    ? [groupA, groupB].map((group) => ({
        key: group.code,
        name: occupationLabel(group),
        href: `/occupations/${encodeURIComponent(group.code)}`,
        total: group.total,
        previousTotal: group.previousTotal,
        shareOfNational:
          group.total === null || nationalTotal === null || nationalTotal === 0
            ? null
            : (group.total / nationalTotal) * 100,
      }))
    : [];

  /** Where each occupation is advertised, as a share of its own national total. */
  const occupationByState =
    comparingOccupations && regionsA?.ok === true && regionsB?.ok === true
      ? comparablePlaces
          .map((area) => {
            const sum = (regions: typeof regionsA.value.regions): number | null => {
              const inside = regions.filter(
                (region) =>
                  region.stateCode === area.code && region.observation.value !== null,
              );
              return inside.length === 0
                ? null
                : inside.reduce(
                    (running, region) => running + (region.observation.value ?? 0),
                    0,
                  );
            };
            return {
              code: area.code,
              name: area.name,
              slug: toAreaSlug(area.name),
              a: sum(regionsA.value.regions),
              b: sum(regionsB.value.regions),
            };
          })
          .filter((row) => row.a !== null || row.b !== null)
          .sort((x, y) => (y.a ?? 0) + (y.b ?? 0) - ((x.a ?? 0) + (x.b ?? 0)))
      : [];

  const askedForPlaces = placeA !== undefined || placeB !== undefined;
  const askedForOccupations = occupationA !== undefined || occupationB !== undefined;

  return (
    <>
      <Masthead release={periodLabel === null ? null : `IVI · ${periodLabel}`} />

      <PageBody>
        <header>
          <Dateline>
            Jobs and Skills Australia · Internet Vacancy Index
            {periodLabel === null ? '' : ` · ${periodLabel}`}
          </Dateline>
          <PageTitle>Compare</PageTitle>
          <Lede>
            Two states or two occupation groups, side by side. Rankings say which is
            larger; this says how they differ.
          </Lede>
        </header>

        <CompareForm
          places={placeChoices}
          occupations={occupationChoices}
          placeA={placeA}
          placeB={placeB}
          occupationA={occupationA}
          occupationB={occupationB}
        />

        {askedForPlaces && !comparingPlaces ? (
          <Advisory>
            {areaA === null && placeA !== undefined
              ? `No state or territory matches “${placeA}”. `
              : areaB === null && placeB !== undefined
                ? `No state or territory matches “${placeB}”. `
                : areaA !== null && areaB !== null
                  ? 'Choose two different places. '
                  : 'Choose a place in both boxes. '}
            Nothing has been compared.
          </Advisory>
        ) : null}

        {askedForOccupations && !comparingOccupations ? (
          <Advisory>
            {groupA === null && occupationA !== undefined
              ? `No occupation group matches “${occupationA}”. `
              : groupB === null && occupationB !== undefined
                ? `No occupation group matches “${occupationB}”. `
                : groupA !== null && groupB !== null
                  ? 'Choose two different groups. '
                  : 'Choose a group in both boxes. '}
            Nothing has been compared.
          </Advisory>
        ) : null}

        {comparingPlaces && placeSides.length === 2 ? (
          <section className="mt-12">
            <FigureFrame
              title={`${placeSides[0]?.name ?? ''} and ${placeSides[1]?.name ?? ''}`}
              subtitle={`${
                periodLabel ?? 'Reference period not stated'
              }. Advertisements summed from the regions the index reports in each.`}
            >
              <Figures sides={placeSides} unit="advertisements" />
            </FigureFrame>

            {placeDivergence.length === 0 ? (
              <Advisory>
                No occupation group clears the reporting floor in both places, so there is
                nothing to compare their mixes on.
              </Advisory>
            ) : (
              <div className="mt-10">
                <Label as="h3">Where the two differ most</Label>
                <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
                  Each figure is the share of that place&rsquo;s own advertising the group
                  takes. The gap is the difference in percentage points, so a positive
                  number means {placeSides[0]?.name ?? 'the first'} devotes more of its
                  advertising to that work than {placeSides[1]?.name ?? 'the second'}{' '}
                  does. It is a difference in mix and not in volume: the counts underneath
                  say which place advertises more of them.
                </p>
                <div className="mt-5">
                  <DivergenceTable
                    rows={placeDivergence}
                    aName={placeSides[0]?.name ?? ''}
                    bName={placeSides[1]?.name ?? ''}
                    caption={`Occupation groups whose share of advertising differs most between ${
                      placeSides[0]?.name ?? ''
                    } and ${placeSides[1]?.name ?? ''}.`}
                  />
                </div>
              </div>
            )}
          </section>
        ) : null}

        {comparingOccupations && occupationSides.length === 2 ? (
          <section className="mt-12">
            <FigureFrame
              title={`${occupationSides[0]?.name ?? ''} and ${occupationSides[1]?.name ?? ''}`}
              subtitle={`${
                periodLabel ?? 'Reference period not stated'
              }. Advertisements summed across every region the index reports.`}
            >
              <Figures sides={occupationSides} unit="advertisements" />
            </FigureFrame>

            {occupationByState.length === 0 ? null : (
              <div className="mt-10">
                <Label as="h3">Where each is advertised</Label>
                <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
                  Advertisements in each state, summed from the regions the index reports.
                  A group advertised heavily in one state and thinly elsewhere is a
                  different proposition from one spread evenly, and the totals above do
                  not show that.
                </p>
                <div className="scroll-x mt-5">
                  <table className="w-full min-w-[24rem] border-collapse text-sm">
                    <caption className="sr-only">
                      Advertisements by state for each of the two occupation groups.
                    </caption>
                    <thead>
                      <tr className="border-rule-heavy border-b-2">
                        <th
                          scope="col"
                          className="text-ink-faint text-label py-2 text-left font-normal uppercase"
                        >
                          State or territory
                        </th>
                        <th
                          scope="col"
                          className="text-ink-faint text-label py-2 pl-4 text-right font-normal uppercase"
                        >
                          {occupationSides[0]?.name ?? ''}
                        </th>
                        <th
                          scope="col"
                          className="text-ink-faint text-label py-2 pl-4 text-right font-normal uppercase"
                        >
                          {occupationSides[1]?.name ?? ''}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {occupationByState.map((row) => (
                        <tr key={row.code} className="border-rule border-b">
                          <th scope="row" className="py-2.5 text-left font-normal">
                            <Link
                              href={`/locations/${row.slug}`}
                              prefetch={false}
                              className={link()}
                            >
                              {row.name}
                            </Link>
                          </th>
                          <td className="tabular py-2.5 pl-4 text-right font-mono">
                            {row.a === null ? (
                              <span className="text-ink-faint font-sans text-xs">
                                Not reported
                              </span>
                            ) : (
                              numberFormat.format(row.a)
                            )}
                          </td>
                          <td className="tabular py-2.5 pl-4 text-right font-mono">
                            {row.b === null ? (
                              <span className="text-ink-faint font-sans text-xs">
                                Not reported
                              </span>
                            ) : (
                              numberFormat.format(row.b)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        ) : null}

        <Notes>
          <Note>
            State figures are sums of the regions Jobs and Skills Australia publishes,
            computed here. Their regions cover Australia exactly once, so the sum is well
            defined, but it is our arithmetic rather than a figure they released.
          </Note>
          <Note>
            The mix comparison uses only the finest groups the release carries. A parent
            group is its children added together, so including both would report one
            difference twice at two levels of detail.
          </Note>
          <Note>
            A group is compared only where at least one side advertised {String(FLOOR)} of
            them. A share built from a handful of advertisements moves on a single
            posting, and the largest gaps would otherwise be the smallest samples.
          </Note>
          <Note>
            {previousPeriod === null
              ? 'Only one reference period is held, so no change is shown.'
              : `Changes are against ${monthFormat.format(previousPeriod)}. Two periods are a comparison, not a trend.`}
          </Note>
          <Note>
            These are counts of advertisements on a defined set of job boards, not of
            vacancies.{' '}
            <Link href="/methodology" prefetch={false} className={link()}>
              How the figures are made
            </Link>
            .
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
