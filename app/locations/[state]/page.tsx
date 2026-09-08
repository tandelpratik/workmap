import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  cachedOccupationTotals,
  cachedRegionTotals,
  cachedStates,
} from '@/app/cached-queries';
import { searchJobs } from '@/db/repositories/job';
import { findAreaBySlug, stateAbbreviation } from '@/domain/geography';
import type { GeographyArea } from '@/domain/geography';
import { occupationLabel } from '@/components/occupation-filter';
import { JobList } from '@/components/job-list';
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
import { Stat } from '@/components/data/stat';
import { RankedTable } from '@/components/ui/ranked-table';
import { Label } from '@/components/ui/label';
import { link } from '@/components/ui/link';
import { cn } from '@/components/ui/cn';

/**
 * One state or territory: what is advertised there, where, and by whom.
 *
 * The gap this fills is the one the map left. Selecting a state on the map
 * redrew the map; it did not give a reader a place. This page is the place: its
 * headline figure and how it moved, the occupations advertised in it, the
 * regions inside it with the publisher's own figures, and the advertisements
 * currently held for it.
 *
 * Three different kinds of number appear here and they are kept apart, which is
 * most of the work:
 *
 *   - **the publisher's**, per region, exactly as JSA released them;
 *   - **ours**, the state total and the occupation ranking, which are sums over
 *     the regions JSA published and are labelled as our arithmetic everywhere
 *     they appear;
 *   - **none at all** for the advertisements below, which come from Adzuna and
 *     Queensland Smart Jobs. Adzuna's terms reserve aggregate figures, so the
 *     listings are shown and never counted. There is no "N jobs in Queensland"
 *     on this page and there must not be.
 *
 * The address is the state's published name, slugified. Areas the index reports
 * nothing for have no page rather than an empty one.
 */

export const dynamic = 'force-dynamic';

const EDITION = 'ASGS2026';
const DATASET = 'Internet Vacancy Index';
const SOURCE_KEY = 'jsa-ivi';
const TOTAL_OCCUPATION_CODE = '0';
const OCCUPATION_TABLE_ID = 'occupations-in-state';
const REGION_TABLE_ID = 'regions-in-state';

/** How many advertisements to show before linking to the rest. */
const LISTING_PREVIEW = 5;

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

async function findState(slug: string): Promise<GeographyArea | null> {
  const states = await cachedStates(EDITION, 'STATE');
  return states.ok ? findAreaBySlug(states.value, slug) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ state: string }>;
}): Promise<Metadata> {
  const { state: slug } = await params;
  const area = await findState(slug);
  if (area === null) return { title: 'Area not found' };

  return {
    title: `${area.name} job advertising`,
    description:
      `Online job advertising in ${area.name}: how many advertisements the Internet ` +
      'Vacancy Index reports, which occupations they are for, and how the regions compare.',
  };
}

export default async function StatePage({
  params,
}: {
  params: Promise<{ state: string }>;
}) {
  const { state: slug } = await params;
  const area = await findState(slug);
  if (area === null) notFound();

  const [scoped, national, regions] = await Promise.all([
    cachedOccupationTotals({
      sourceKey: SOURCE_KEY,
      dataset: DATASET,
      edition: EDITION,
      levels: ['GCCSA', 'SA4'],
      stateCode: area.code,
    }),
    cachedOccupationTotals({
      sourceKey: SOURCE_KEY,
      dataset: DATASET,
      edition: EDITION,
      levels: ['GCCSA', 'SA4'],
    }),
    cachedRegionTotals({
      sourceKey: SOURCE_KEY,
      dataset: DATASET,
      edition: EDITION,
      levels: ['GCCSA', 'SA4'],
      occupationCode: TOTAL_OCCUPATION_CODE,
    }),
  ]);

  /*
   * An area the index reports nothing for gets no page.
   *
   * Other Territories and Outside Australia are real ASGS areas carried because
   * sources report against them, and JSA publishes no figures for either. A
   * page for one would be a heading, a set of empty stats and three paragraphs
   * of caveat: a page generated because the address could exist rather than
   * because there is something on it.
   */
  if (!scoped.ok || scoped.value.regionsInScope === 0) notFound();

  const period = scoped.value.period;
  const previousPeriod = scoped.value.previousPeriod;
  const periodLabel = period === null ? null : monthFormat.format(period);

  const stateTotal =
    scoped.value.occupations.find((entry) => entry.code === TOTAL_OCCUPATION_CODE) ??
    null;

  const nationalTotal = national.ok
    ? (national.value.occupations.find((entry) => entry.code === TOTAL_OCCUPATION_CODE) ??
      null)
    : null;

  // The occupation groups advertised here, largest first. The all-occupations
  // row is the headline figure above and is not one of the groups, so it is
  // taken out rather than ranked against its own parts.
  const groups = scoped.value.occupations
    .filter((entry) => entry.code !== TOTAL_OCCUPATION_CODE && entry.total !== null)
    .sort((a, b) => (b.total ?? 0) - (a.total ?? 0));

  // The regions inside this state, with the publisher's own figures. Filtered
  // from the national read rather than queried again: the map already needs
  // every region, and this is a slice of the same cached answer.
  const inState = regions.ok
    ? regions.value.regions
        .filter((region) => region.stateCode === area.code)
        .sort((a, b) => (b.observation.value ?? 0) - (a.observation.value ?? 0))
    : [];

  const regionsWithoutData = regions.ok
    ? regions.value.withoutData.filter((region) => region.stateCode === area.code)
    : [];

  const change =
    stateTotal?.total != null && stateTotal.previousTotal != null
      ? {
          absolute: stateTotal.total - stateTotal.previousTotal,
          percent:
            stateTotal.previousTotal === 0
              ? null
              : ((stateTotal.total - stateTotal.previousTotal) /
                  stateTotal.previousTotal) *
                100,
        }
      : null;

  const share =
    stateTotal?.total != null && nationalTotal?.total != null && nationalTotal.total > 0
      ? (stateTotal.total / nationalTotal.total) * 100
      : null;

  /*
   * The advertisements held for this state.
   *
   * Shown, never counted. The corpus mixes Adzuna and Queensland Smart Jobs,
   * and Adzuna's terms reserve "aggregation (including but not limited to
   * vacancy counts...)" for a written licence, so a figure here would be the
   * one thing on the page we are not permitted to publish. The link through to
   * search is where a reader can page the rest.
   */
  const abbreviation = stateAbbreviation(area.name);
  const listings =
    abbreviation === null
      ? null
      : await searchJobs({ location: abbreviation, page: 1, pageSize: LISTING_PREVIEW });

  const shownJobs = listings?.ok ? listings.value.jobs : [];
  const listingSources = [...new Set(shownJobs.map((job) => job.sourceKey))];

  const fields: ReleaseField[] = [
    ...(periodLabel === null ? [] : [{ label: 'Reference period', value: periodLabel }]),
    ...(stateTotal?.total == null
      ? []
      : [{ label: 'Advertisements', value: numberFormat.format(stateTotal.total) }]),
    ...(change === null
      ? []
      : [
          {
            label:
              previousPeriod === null
                ? 'Change'
                : `On ${monthFormat.format(previousPeriod)}`,
            value: `${signedFormat.format(change.absolute)}${
              change.percent === null ? '' : ` (${percentFormat.format(change.percent)}%)`
            }`,
          },
        ]),
    {
      label: 'Regions',
      value:
        stateTotal === null || stateTotal.regionsReporting === scoped.value.regionsInScope
          ? String(scoped.value.regionsInScope)
          : `${String(stateTotal.regionsReporting)} of ${String(scoped.value.regionsInScope)}`,
    },
  ];

  return (
    <>
      <Masthead
        current="locations"
        release={periodLabel === null ? null : `IVI · ${periodLabel}`}
      />

      <PageBody>
        <header>
          <Dateline>
            <Link href="/locations" prefetch={false} className="hover:text-ink">
              States and territories
            </Link>
            {periodLabel === null ? '' : ` · ${periodLabel}`}
          </Dateline>
          <PageTitle>{area.name}</PageTitle>
          <Lede>
            Online job advertising in {area.name}: what is advertised, where inside the
            state, and the advertisements behind the figures.
          </Lede>
          <ReleaseStrip fields={fields} />
        </header>

        <Plate
          margin={
            <div className="space-y-8">
              <Stat
                label="Advertisements"
                value={
                  stateTotal?.total == null
                    ? 'Not reported'
                    : numberFormat.format(stateTotal.total)
                }
                muted={stateTotal?.total == null}
                note={
                  <>
                    {periodLabel === null ? null : <>{periodLabel}. </>}
                    Summed from the {String(scoped.value.regionsInScope)} regions the
                    index reports on in {area.name}. Our arithmetic, not a figure Jobs and
                    Skills Australia released.
                  </>
                }
              />

              <Stat
                label={
                  previousPeriod === null
                    ? 'Change'
                    : `Change on ${monthFormat.format(previousPeriod)}`
                }
                value={
                  change === null
                    ? 'No comparison'
                    : `${signedFormat.format(change.absolute)}${
                        change.percent === null
                          ? ''
                          : ` (${percentFormat.format(change.percent)}%)`
                      }`
                }
                muted={change === null}
                note={
                  change === null
                    ? 'Only one reference period is held, so there is nothing to compare against. That is not a change of zero.'
                    : 'One month against the one before it. Two points are a comparison, not a trend.'
                }
              />

              <Stat
                label="Share of Australia"
                value={share === null ? 'Not available' : `${shareFormat.format(share)}%`}
                muted={share === null}
                note={
                  nationalTotal?.total == null ? undefined : (
                    <>
                      Of {numberFormat.format(nationalTotal.total)} advertisements
                      nationally. Both figures are sums over the regions the index
                      reports.
                    </>
                  )
                }
              />

              <div className="border-rule border-t pt-5">
                <Label as="h2">Elsewhere</Label>
                <ul className="mt-3 space-y-2 text-sm">
                  <li>
                    <Link
                      href={`/map?state=${encodeURIComponent(area.code)}`}
                      prefetch={false}
                      className={link()}
                    >
                      {area.name} on the map
                    </Link>
                  </li>
                  <li>
                    <Link href="/occupations" prefetch={false} className={link()}>
                      Occupations across Australia
                    </Link>
                  </li>
                  {abbreviation === null ? null : (
                    <li>
                      <Link
                        href={`/jobs?where=${encodeURIComponent(abbreviation)}`}
                        prefetch={false}
                        className={link()}
                      >
                        Advertisements in {area.name}
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            </div>
          }
          below={
            inState.length === 0 ? null : (
              <div className="mt-4">
                <FigureFrame
                  title={`Regions of ${area.name}`}
                  subtitle={`${
                    periodLabel ?? 'Reference period not stated'
                  }. Figures as Jobs and Skills Australia published them, unaltered.`}
                >
                  <RankedTable
                    id={REGION_TABLE_ID}
                    captionHidden
                    caption={`Online job advertisements by region within ${area.name}${
                      periodLabel === null ? '' : `, ${periodLabel}`
                    }, ordered by number of advertisements.`}
                    rows={inState}
                    rowKey={(region) => `${region.level}-${region.code}`}
                    heading="Region"
                    rank="compact"
                    name={(region) => ({
                      label: region.name,
                      href: `/map?state=${encodeURIComponent(
                        area.code,
                      )}&region=${encodeURIComponent(region.code)}`,
                    })}
                    figure={(region) => ({
                      value: region.observation.value,
                      absence:
                        region.observation.valueState === 'SUPPRESSED'
                          ? 'Withheld by the publisher'
                          : 'Not reported',
                    })}
                    after={[
                      {
                        heading: 'Level',
                        align: 'left',
                        compact: true,
                        render: (region) =>
                          region.level === 'GCCSA' ? 'Capital city' : 'SA4',
                      },
                      {
                        heading:
                          previousPeriod === null
                            ? 'Change'
                            : `On ${monthFormat.format(previousPeriod)}`,
                        align: 'right',
                        compact: true,
                        render: (region) => {
                          const now = region.observation.value;
                          const before = region.previous?.value ?? null;
                          if (now === null || before === null) {
                            return <span className="text-ink-faint">No comparison</span>;
                          }
                          return signedFormat.format(now - before);
                        },
                      },
                    ]}
                  />
                </FigureFrame>

                {regionsWithoutData.length === 0 ? null : (
                  <Advisory>
                    {regionsWithoutData.length === 1
                      ? 'One region of '
                      : `${String(regionsWithoutData.length)} regions of `}
                    {area.name} carries no figure for this period:{' '}
                    {regionsWithoutData.map((region) => region.name).join(', ')}. The
                    state total above is summed from the regions that reported, so it is a
                    partial figure rather than an incomplete one presented as whole.
                  </Advisory>
                )}
              </div>
            )
          }
        >
          <FigureFrame
            title={`What is advertised in ${area.name}`}
            subtitle={`${
              periodLabel ?? 'Reference period not stated'
            }. ${String(groups.length)} occupation groups, summed across the state's regions. Groups overlap and must not be added together.`}
            aside={
              <Link
                href="/occupations"
                prefetch={false}
                className={cn(link(), 'text-sm')}
              >
                All groups nationally
              </Link>
            }
          >
            {groups.length === 0 ? (
              <p className="text-ink-muted text-sm leading-relaxed">
                No occupation figures are held for {area.name} in this period.
              </p>
            ) : (
              <RankedTable
                id={OCCUPATION_TABLE_ID}
                captionHidden
                caption={`Online job advertisements by occupation group in ${area.name}${
                  periodLabel === null ? '' : `, ${periodLabel}`
                }, ordered by number of advertisements.`}
                rows={groups}
                rowKey={(entry) => entry.code}
                heading="Occupation group"
                rank="compact"
                name={(entry) => ({
                  label: occupationLabel(entry),
                  href: `/occupations/${encodeURIComponent(entry.code)}`,
                })}
                figure={(entry) => ({ value: entry.total, absence: 'Not reported' })}
                after={[
                  {
                    heading:
                      previousPeriod === null
                        ? 'Change'
                        : `On ${monthFormat.format(previousPeriod)}`,
                    align: 'right',
                    compact: true,
                    render: (entry) => {
                      if (entry.total === null || entry.previousTotal === null) {
                        return <span className="text-ink-faint">No comparison</span>;
                      }
                      return signedFormat.format(entry.total - entry.previousTotal);
                    },
                  },
                ]}
              />
            )}
          </FigureFrame>
        </Plate>

        {shownJobs.length === 0 ? null : (
          <section className="border-rule-heavy mt-16 border-t-2 pt-5">
            <h2 className="text-ink font-serif text-2xl font-semibold">
              Advertisements in {area.name}
            </h2>
            <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
              Individual listings this site is licensed to republish, from sources that
              cover part of {area.name} rather than all of it. They are a sample of what
              is advertised and are deliberately not counted: the figures above come from
              the Internet Vacancy Index and these do not add to them.
            </p>

            <JobList jobs={shownJobs} />

            {abbreviation === null ? null : (
              <p className="mt-6">
                <Link
                  href={`/jobs?where=${encodeURIComponent(abbreviation)}`}
                  prefetch={false}
                  className="text-paper-raised bg-ink hover:bg-accent inline-flex min-h-11 items-center px-5 text-sm font-medium transition-colors"
                >
                  Search advertisements in {area.name}
                </Link>
              </p>
            )}
          </section>
        )}

        <Notes>
          <Note>
            The {area.name} total and the occupation figures on this page are sums of the
            regions Jobs and Skills Australia publishes, computed here. Their regions
            cover the state exactly once, so the sum is well defined, but it is our
            arithmetic rather than a figure they released. The regional table carries
            their published figures unaltered.
          </Note>
          <Note>
            Occupation groups are reported at the level Jobs and Skills Australia
            publishes them. They overlap, so adding groups together produces a number
            nobody published.
          </Note>
          <Note>
            The Internet Vacancy Index counts advertisements appearing on a defined set of
            job boards. Vacancies never advertised online, or advertised only through an
            employer&rsquo;s own site, are not in it. It is an indicator of advertising
            activity, not a measure of total vacancies in {area.name}.
          </Note>
          {shownJobs.length === 0 ? null : (
            <Note>
              The advertisements listed are not a count and not a sample designed to be
              representative. They are the listings held from the sources named below,
              which cover particular employers and boards rather than the whole market.
            </Note>
          )}
        </Notes>

        <Colophon
          sources={[
            {
              key: SOURCE_KEY,
              dataset: DATASET,
              ...(periodLabel === null ? {} : { referencePeriod: periodLabel }),
            },
            'abs-asgs',
            ...listingSources,
          ]}
        />
      </PageBody>
    </>
  );
}
