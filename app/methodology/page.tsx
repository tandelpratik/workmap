import type { Metadata } from 'next';
import Link from 'next/link';
import { brand } from '@/config/brand';
import { lifecycle } from '@/config/lifecycle';
import { retention } from '@/config/retention';
import { cachedOccupationTotals } from '@/app/cached-queries';
import { Masthead } from '@/components/layout/masthead';
import { Dateline, Lede, PageBody, PageTitle } from '@/components/layout/plate';
import {
  Contents,
  Definition,
  Definitions,
  Prose,
  Section,
} from '@/components/layout/prose';
import { ReleaseStrip, type ReleaseField } from '@/components/data/release-strip';
import { link } from '@/components/ui/link';

/**
 * How every figure on this site is made, and what it does and does not mean.
 *
 * The product's claim is that a reader can get from a number to its source,
 * its reference period, the arithmetic applied to it and its licence without
 * ambiguity. This is the page where that chain is written down, and it is
 * therefore the page that has to be right.
 *
 * The counts in it are read from the database rather than typed, for the same
 * reason the licensing page is generated from the registry: a methodology
 * stating a figure the system no longer holds is worse than one stating none,
 * because it is checkable and wrong.
 */

export const dynamic = 'force-dynamic';

const EDITION = 'ASGS2026';
const DATASET = 'Internet Vacancy Index';
const SOURCE_KEY = 'jsa-ivi';
const TOTAL_OCCUPATION_CODE = '0';

const SECTIONS = [
  { id: 'measures', title: 'What this site measures' },
  { id: 'not-measured', title: 'What it does not measure' },
  { id: 'geography', title: 'Geography and aggregation' },
  { id: 'occupations', title: 'Occupations' },
  { id: 'periods', title: 'Reference periods and change' },
  { id: 'missing', title: 'Missing figures' },
  { id: 'advertisements', title: 'Job advertisements' },
  { id: 'sponsorship', title: 'Visa sponsorship labels' },
  { id: 'limitations', title: 'Limitations' },
  { id: 'corrections', title: 'Corrections' },
] as const;

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'What this site measures, what it does not, how figures are aggregated, and the limitations of the data behind them.',
};

const numberFormat = new Intl.NumberFormat('en-AU');
const monthFormat = new Intl.DateTimeFormat('en-AU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

export default async function MethodologyPage() {
  const totals = await cachedOccupationTotals({
    sourceKey: SOURCE_KEY,
    dataset: DATASET,
    edition: EDITION,
    levels: ['GCCSA', 'SA4'],
  });

  const period = totals.ok ? totals.value.period : null;
  const previousPeriod = totals.ok ? totals.value.previousPeriod : null;
  const periodLabel = period === null ? null : monthFormat.format(period);
  const regionsInScope = totals.ok ? totals.value.regionsInScope : 0;
  const groupCount = totals.ok
    ? totals.value.occupations.filter((entry) => entry.code !== TOTAL_OCCUPATION_CODE)
        .length
    : 0;
  const nationalTotal = totals.ok
    ? (totals.value.occupations.find((entry) => entry.code === TOTAL_OCCUPATION_CODE)
        ?.total ?? null)
    : null;

  const fields: ReleaseField[] = [
    ...(periodLabel === null ? [] : [{ label: 'Current release', value: periodLabel }]),
    ...(nationalTotal === null
      ? []
      : [{ label: 'Advertisements', value: numberFormat.format(nationalTotal) }]),
    ...(regionsInScope === 0
      ? []
      : [{ label: 'Regions', value: String(regionsInScope) }]),
    ...(groupCount === 0
      ? []
      : [{ label: 'Occupation groups', value: String(groupCount) }]),
  ];

  return (
    <>
      <Masthead release={periodLabel === null ? null : `IVI · ${periodLabel}`} />

      <PageBody width="column">
        <header>
          <Dateline>Methodology</Dateline>
          <PageTitle>How these figures are made</PageTitle>
          <Lede>
            What the numbers on this site count, how they are aggregated, and the things
            they cannot tell you.
          </Lede>
          {fields.length === 0 ? null : <ReleaseStrip fields={fields} />}
          <Contents items={SECTIONS} />
        </header>

        <Section id="measures" kicker="Scope" title="What this site measures">
          <Prose>
            <p>
              The figures come from the{' '}
              <strong className="text-ink font-medium">Internet Vacancy Index</strong>,
              published monthly by Jobs and Skills Australia. It counts job advertisements
              appearing on a defined set of online job boards, by occupation and by
              region.
            </p>
            <p>
              An advertisement is the unit. Not a vacancy, not a hire, not a person: an
              advertisement, appearing on one of the boards the index covers, during the
              reference month. That distinction runs through everything on this site and
              is the single most important thing on this page.
            </p>
            {regionsInScope === 0 ? null : (
              <p>
                The current release covers {String(regionsInScope)} regions
                {groupCount === 0 ? '' : ` and ${String(groupCount)} occupation groups`}
                {periodLabel === null ? '' : `, for ${periodLabel}`}. Australia is divided
                into the eight capital cities and the regions outside them, which together
                cover the country exactly once.
              </p>
            )}
          </Prose>
        </Section>

        <Section id="not-measured" kicker="Scope" title="What it does not measure">
          <Prose>
            <p>
              Nothing on this site is a count of vacancies in Australia. In particular:
            </p>
          </Prose>

          <Definitions>
            <Definition term="Unadvertised vacancies">
              A role filled internally, through a network, or by a recruiter&rsquo;s own
              contacts never appears in an advertisement index. A great many jobs are
              never advertised anywhere.
            </Definition>
            <Definition term="Employer-only advertising">
              A vacancy advertised solely on an employer&rsquo;s own careers site, and not
              on a board the index covers, is not counted.
            </Definition>
            <Definition term="Hiring">
              An advertisement is not a hire. One advertisement may fill many positions,
              or none.
            </Definition>
            <Definition term="Labour demand">
              Advertising activity moves with recruitment practice, budget cycles and
              board pricing as well as with demand. A change in advertisements is a change
              in advertisements.
            </Definition>
            <Definition term="Your prospects">
              Nothing here is advice about employment, migration or any individual&rsquo;s
              circumstances.
            </Definition>
          </Definitions>
        </Section>

        <Section id="geography" kicker="Method" title="Geography and aggregation">
          <Prose>
            <p>
              Boundaries are the Australian Statistical Geography Standard, Edition 4,
              published by the Australian Bureau of Statistics. The index reports the
              eight capital cities as Greater Capital City Statistical Areas and the rest
              of the country as Statistical Areas Level 4.
            </p>
            <p>
              Those two levels sit side by side rather than one inside the other, and
              their figures must never be added together. A capital city and the SA4s that
              make it up describe the same ground twice.
            </p>
            <p>
              A state total on this site is the sum of the regions the publisher reports
              on within that state. The publisher releases this index by region, not by
              state, so the state figure is arithmetic done here. Every page showing one
              says so. Where a region carried no figure for the month, the state total is
              the sum of those that did, and the page says how many reported.
            </p>
            <p>
              Boundaries are simplified for drawing. That is a display decision and it
              affects the shapes on the map, never the figures beside them.
            </p>
          </Prose>
        </Section>

        <Section id="occupations" kicker="Method" title="Occupations">
          <Prose>
            <p>
              Occupation groups are reported at the level Jobs and Skills Australia
              publishes them, with the codes and names the publisher uses. Where the
              publisher names a code inconsistently across regions, no name is shown
              rather than one of them being chosen.
            </p>
            <p>
              <strong className="text-ink font-medium">
                Occupation groups must not be added together.
              </strong>{' '}
              They nest and overlap, so summing them produces a total nobody published.
              The all-occupations figure comes from the publisher&rsquo;s own
              all-occupations row, never from adding the groups up.
            </p>
            <p>
              Job advertisements are a separate matter. A listing is mapped to an
              occupation classification only where the mapping is established; an unmapped
              listing stays unmapped rather than being guessed into a plausible code.
            </p>
          </Prose>
        </Section>

        <Section id="periods" kicker="Method" title="Reference periods and change">
          <Prose>
            <p>
              Every figure belongs to a reference month, and the month is stated wherever
              the figure appears
              {periodLabel === null ? '' : `. The current release is ${periodLabel}`}.
            </p>
            <p>
              {String(retention.labourMarketPeriods)} reference periods are held: the
              current month and the one before it
              {previousPeriod === null
                ? ''
                : `, currently ${monthFormat.format(previousPeriod)}`}
              . A change shown on this site is that comparison and nothing more.
            </p>
            <p>
              <strong className="text-ink font-medium">
                Two points are a comparison, not a trend.
              </strong>{' '}
              Nothing here is described as a trend, because a direction cannot be
              established from two observations. The publisher&rsquo;s own workbook holds
              the full history, and trends will appear on this site when enough periods
              have accumulated to support them honestly.
            </p>
            <p>
              Where no prior period is held, a page reports that there is no comparison.
              It does not report a change of zero, which is a different statement.
            </p>
          </Prose>
        </Section>

        <Section id="missing" kicker="Method" title="Missing figures">
          <Prose>
            <p>
              A figure that does not exist is never shown as zero. Absence has kinds, and
              they are distinguished:
            </p>
          </Prose>

          <Definitions>
            <Definition term="Not reported">
              The publisher released no figure for that region and period.
            </Definition>
            <Definition term="Withheld by the publisher">
              A figure exists and the publisher chose not to release it, usually because
              releasing it would identify something.
            </Definition>
            <Definition term="Not covered">
              The area or question is outside what the dataset covers. Some areas exist in
              the boundary registry because sources report against them and carry no
              figures at all; they get no page rather than an empty one.
            </Definition>
            <Definition term="Genuinely zero">
              A measurement of zero, which is a figure and is shown as one.
            </Definition>
          </Definitions>
        </Section>

        <Section id="advertisements" kicker="Listings" title="Job advertisements">
          <Prose>
            <p>
              Alongside the statistics, this site republishes individual job
              advertisements from the sources it is licensed to carry. These are a
              different kind of thing from the index figures and are never mixed with
              them.
            </p>
            <p>
              They are shown and never counted. The listing corpus mixes sources, and one
              of them reserves aggregate figures for a written licence, so there is no
              count of advertisements anywhere on this site. The figures on the map and
              the location pages come from the Internet Vacancy Index; the listings do not
              add to them and are not a sample of them.
            </p>
            <p>Three dates travel with a listing and they mean different things:</p>
          </Prose>

          <Definitions>
            <Definition term="Posted">
              The date the employer or board published the advertisement.
            </Definition>
            <Definition term="Verified">
              The last time the source confirmed the advertisement was still there. This
              is the one that tells you whether a role is likely to still exist.
            </Definition>
            <Definition term="Not recently confirmed">
              Shown when more than {String(lifecycle.staleAfterDays)} days have passed
              since the source last confirmed it. The advertisement may well still be
              open; it has simply not been seen recently.
            </Definition>
            <Definition term="Removed from search">
              After {String(lifecycle.expireAfterDays)} days without being seen, a listing
              leaves search. It is not deleted: the record that it existed is kept,
              because deleting it would destroy the evidence.
            </Definition>
          </Definitions>

          <Prose>
            <p className="mt-6">
              The original advertisement is authoritative. Every listing links to it, and
              where this site and the source disagree, the source is right.{' '}
              <Link href="/data-and-licensing#job-content" className={link()}>
                What is and is not reproduced from an advertisement
              </Link>{' '}
              is recorded field by field.
            </p>
          </Prose>
        </Section>

        <Section id="sponsorship" kicker="Listings" title="Visa sponsorship labels">
          <Prose>
            <p>
              Each advertisement carries a label describing what it says about visa
              sponsorship, together with the words that produced it. The label reports
              wording. It is not advice, and it says nothing about any reader&rsquo;s visa
              position or eligibility.
            </p>
          </Prose>

          <Definitions>
            <Definition term="Sponsorship mentioned">
              The advertisement states that sponsorship is offered or available. The
              phrase that says so is quoted beside the label.
            </Definition>
            <Definition term="Sponsorship excluded">
              The advertisement states that sponsorship is not available.
            </Definition>
            <Definition term="Not mentioned">
              The whole advertisement was read and says nothing either way. This is not a
              statement that sponsorship is unavailable.
            </Definition>
            <Definition term="Not known">
              Only part of the advertisement is held, so its silence proves nothing. Most
              listings from one source arrive as excerpts and land here. Absence of
              evidence is not evidence of absence, and this label exists so the two are
              not confused.
            </Definition>
          </Definitions>

          <Prose>
            <p className="mt-6">
              Labels are matched on phrases rather than keywords, because
              &ldquo;visa&rdquo; alone appears in job titles and in descriptions of who
              may apply, neither of which is an offer to sponsor anyone. For anything
              about a visa, see the{' '}
              <a
                href="https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing"
                target="_blank"
                rel="noopener noreferrer"
                className={link()}
              >
                Department of Home Affairs
              </a>
              .
            </p>
          </Prose>
        </Section>

        <Section id="limitations" kicker="Honesty" title="Limitations">
          <Prose>
            <p>
              The things most likely to mislead a reader who skips the rest of this page:
            </p>
          </Prose>

          <Definitions>
            <Definition term="Coverage is partial by construction">
              The index covers a defined set of job boards. It is an indicator of online
              advertising activity, not a census of work.
            </Definition>
            <Definition term="Listings are not representative">
              The advertisements republished here come from particular sources covering
              particular employers and boards. One is a state government&rsquo;s own
              board, whose listings are that government&rsquo;s vacancies and never a
              picture of that state&rsquo;s labour market.
            </Definition>
            <Definition term="State totals are ours">
              Reliable arithmetic on the publisher&rsquo;s own partition of the country,
              but not figures the publisher released.
            </Definition>
            <Definition term="No trends yet">
              Two reference periods are held, which supports a comparison and not a
              direction.
            </Definition>
            <Definition term="Occupation mapping is incomplete">
              Job advertisements are not all mapped to an occupation classification, and
              unmapped ones stay unmapped rather than being guessed.
            </Definition>
            <Definition term="No warranty from the publishers">
              Jobs and Skills Australia publishes no warranty as to the accuracy, currency
              or completeness of the index.
            </Definition>
          </Definitions>
        </Section>

        <Section id="corrections" kicker="Feedback" title="Corrections">
          <Prose>
            <p>
              If a figure here looks wrong, an advertisement is out of date, or a listing
              carries information it should not, it should be corrected. Every figure is
              traceable to the release it came from, so a correction can be checked rather
              than argued about.
            </p>
            <p>
              A reporting route is not yet published, and this page will name it when it
              is. In the meantime the original publisher is authoritative for anything
              they released, and every listing and figure on this site links back to its
              source.
            </p>
            <p>
              {brand.productName} is an independent project. It is not affiliated with,
              endorsed by, or sponsored by Jobs and Skills Australia, the Australian
              Bureau of Statistics, the State of Queensland, or any other organisation
              whose data it draws on.
            </p>
          </Prose>
        </Section>
      </PageBody>
    </>
  );
}
