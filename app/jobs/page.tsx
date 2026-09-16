import type { Metadata } from 'next';
import { getAdzunaCredentials } from '@/config/env';
import { findSourceDescriptor } from '@/config/sources';
import {
  lastVerifiedBySource,
  listIndexedSources,
  listSkillsInUse,
  searchJobs,
} from '@/db/repositories/job';
import { JobList } from '@/components/job-list';
import { SponsorshipKey } from '@/components/sponsorship-badge';
import { RegionalKey } from '@/components/regional-note';
import { SkillKey } from '@/components/skill-note';
import { skillsByNormalizedName } from '@/skills/vocabulary';
import { JobSearchForm } from '@/components/job-search-form';
import { sponsorshipSignals } from '@/domain/sponsorship';
import { regionalAreas } from '@/config/regional-areas';
import { legal } from '@/config/legal';
import {
  areaFilters,
  defaultAreaFilter,
  isAreaFilter,
  type AreaFilter,
} from '@/domain/regional';
import { employmentTypes } from '@/domain/job';
import { Masthead } from '@/components/layout/masthead';
import { Colophon } from '@/components/layout/colophon';
import { Dateline, Lede, PageBody, PageTitle } from '@/components/layout/plate';
import { ReleaseStrip, type ReleaseField } from '@/components/data/release-strip';
import { Label } from '@/components/ui/label';
import { link } from '@/components/ui/link';

/**
 * Job search.
 *
 * Rendered on the server from the URL, so a search is shareable and works
 * without client JavaScript.
 *
 * Every state a reader can land in is handled explicitly, because "no results"
 * and "no provider configured" are different facts and collapsing them into one
 * empty page would misrepresent the product (ADR-0008).
 *
 * Attribution is derived from the listings actually shown rather than written
 * into the footer by hand. Two licensed sources are live, each with its own
 * obligations, and a hand-written footer had already fallen a source behind.
 */

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

/**
 * The posting windows offered, in days.
 *
 * A closed vocabulary rather than a free number, so `posted=99999` cannot be
 * turned into an unbounded query, and so the control and the parser cannot
 * offer different choices.
 */
const POSTED_WINDOWS = [3, 7, 14, 30] as const;

/** What the results are, in the reader's words, for the heading above them. */
const AREA_SUMMARY: Record<AreaFilter, string> = {
  regional:
    'Showing advertisements in a designated regional area. Change Area to see ' +
    'the rest.',
  elsewhere:
    'Showing advertisements outside a designated regional area, which in ' +
    'practice means Sydney, Melbourne and Brisbane.',
  unplaced:
    'Showing advertisements that could not be placed, usually because they ' +
    'name several regions at once. They may or may not be regional.',
  all: 'Showing every advertisement held, wherever it is.',
};

export const metadata: Metadata = {
  title: 'Regional job search',
  description:
    'One search across job advertisements in regional Australia, with the ' +
    'employer, location and salary exactly as the source published them, and ' +
    'what each advertisement says about visa sponsorship.',
};

const dateFormat = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Australia/Sydney',
});

function first(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed === '' ? undefined : trimmed;
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-rule-strong mt-10 border-t pt-6">
      <h2 className="text-ink font-serif text-2xl font-semibold">{title}</h2>
      <div className="text-ink-muted max-w-measure mt-3 space-y-3 text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

/** Every filter the page understands, as it appears in the address. */
interface Filters {
  q?: string | undefined;
  where?: string | undefined;
  area?: string | undefined;
  sponsorship?: string | undefined;
  type?: string | undefined;
  skill?: string | undefined;
  source?: string | undefined;
  posted?: string | undefined;
}

/**
 * The address for a given page of the current search.
 *
 * Every filter is carried, and the list is written once. Dropping one would
 * quietly widen the result set on page two, so a reader who filtered would find
 * listings that do not match without being told the filter had gone. That
 * happened once with sponsorship alone; with six filters, rebuilding the query
 * by hand at each call site would be a matter of time.
 */
function hrefFor(filters: Filters, page = 1): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') search.set(key, value);
  }
  if (page > 1) search.set('page', String(page));
  const query = search.toString();
  return query === '' ? '/jobs' : `/jobs?${query}`;
}

/**
 * The narrowings a reader can see themselves having typed, joined as a list.
 *
 * The empty state used to be assembled from the keyword and the location
 * alone, so a search narrowed by anything else produced "Nothing in the index
 * matches ." with a stray full stop, and then advised clearing a location that
 * had never been set. That was reachable before by filtering on employment
 * type alone; a skill filter makes it ordinary, because a skill is a filter a
 * reader will use on its own.
 *
 * Only the three filters a reader phrased in their own words are named. The
 * rest were chosen from a control that is still on screen showing what it is
 * set to, and reciting them back would be a paragraph restating the form.
 */
function joinPhrases(phrases: readonly string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? '';
  return `${phrases.slice(0, -1).join(', ')} and ${phrases.at(-1)}`;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const text = first(params['q']);
  const location = first(params['where']);
  // Bounded against the vocabulary rather than passed through: a query string
  // is external input, and an unrecognised value shows every listing rather
  // than erroring, which is how the other filters behave.
  // Bounded against the vocabulary, and defaulted rather than left open. An
  // unrecognised value falls back to the product's default instead of widening
  // the search, which is the opposite of how the other filters degrade and is
  // deliberate: this one is what the product is.
  const requestedArea = first(params['area']);
  const area: AreaFilter = isAreaFilter(requestedArea)
    ? requestedArea
    : defaultAreaFilter;
  const regional = areaFilters[area] ?? undefined;

  const requestedSponsorship = first(params['sponsorship']);
  const sponsorship = sponsorshipSignals.find(
    (signal) => signal === requestedSponsorship,
  );
  // Bounded the same way, for the same reason: a query string is external
  // input, and an unrecognised value widens the search rather than erroring.
  const requestedType = first(params['type']);
  const employmentType = employmentTypes.find((value) => value === requestedType);

  /*
   * Bounded against the vocabulary rather than against what the index happens
   * to hold today.
   *
   * Two different authorities, deliberately. The vocabulary decides what a
   * skill is, so a value it does not know is dropped; the corpus decides what
   * the control offers, so a reader is never shown a setting that cannot
   * return anything. A hand-typed key for a skill the vocabulary knows but no
   * regional listing carries therefore reaches the search and produces the
   * ordinary empty state, which already names the area filter as the likely
   * cause. Silently widening the search instead would be the worse answer.
   */
  const requestedSkill = first(params['skill']);
  const skill =
    requestedSkill !== undefined && skillsByNormalizedName.has(requestedSkill)
      ? requestedSkill
      : undefined;

  const requestedSource = first(params['source']);
  const source =
    requestedSource !== undefined && findSourceDescriptor(requestedSource) !== undefined
      ? requestedSource
      : undefined;

  const requestedPosted = first(params['posted']);
  const postedWithinDays = POSTED_WINDOWS.find(
    (days) => String(days) === requestedPosted,
  );

  const requestedPage = Number(first(params['page']) ?? '1');
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.trunc(requestedPage))
    : 1;

  const result = await searchJobs({
    ...(text ? { text } : {}),
    ...(location ? { location } : {}),
    ...(regional === undefined ? {} : { regional }),
    ...(sponsorship ? { sponsorship } : {}),
    ...(employmentType ? { employmentType } : {}),
    ...(skill ? { skill } : {}),
    ...(source ? { source } : {}),
    ...(postedWithinDays === undefined ? {} : { postedWithinDays }),
    page,
    pageSize: PAGE_SIZE,
  });

  /*
   * What the reader actually asked for, rebuilt from the values that survived
   * validation rather than from the raw query string. An address carrying
   * `type=banana` therefore loses it on the next page rather than carrying a
   * parameter the search ignored.
   */
  const filters: Filters = {
    ...(text === undefined ? {} : { q: text }),
    ...(location === undefined ? {} : { where: location }),
    // Carried only when it is not the default, so an ordinary search keeps a
    // clean address and "clear filters" does not count the product's own
    // premise as something the reader chose.
    ...(area === defaultAreaFilter ? {} : { area }),
    ...(sponsorship === undefined ? {} : { sponsorship }),
    ...(employmentType === undefined ? {} : { type: employmentType }),
    ...(skill === undefined ? {} : { skill }),
    ...(source === undefined ? {} : { source }),
    ...(postedWithinDays === undefined ? {} : { posted: String(postedWithinDays) }),
  };
  const activeFilters = Object.keys(filters).length;

  /*
   * What the reader typed, in their own words, for the empty state.
   *
   * Read from the values that survived validation rather than the raw query
   * string, so a discarded parameter is not quoted back at somebody as the
   * reason their search found nothing.
   */
  const skillName =
    skill === undefined ? undefined : skillsByNormalizedName.get(skill)?.name;
  const searchedFor = [
    ...(text === undefined ? [] : [`“${text}”`]),
    ...(location === undefined ? [] : [`the location ${location}`]),
    ...(skillName === undefined ? [] : [`advertisements naming ${skillName}`]),
  ];
  /*
   * Advice that names something the reader actually set. Telling somebody to
   * clear a location they never entered is worse than saying nothing: it sends
   * them looking for a control they did not touch.
   */
  const advice =
    text !== undefined && location !== undefined
      ? 'Try a broader term, or clear the location.'
      : text !== undefined
        ? 'Try a broader term.'
        : location !== undefined
          ? 'Try a wider location.'
          : 'Try clearing a filter.';

  const credentialsConfigured = getAdzunaCredentials() !== null;
  /*
   * Whether anything is narrowing the results.
   *
   * The area filter counts even when it is the default, because the default
   * narrows: it removes roughly four listings in five. Without this the strip
   * printed "In the index: 1,466 listings" over a regional-only result, which
   * states the size of the whole index and gives the size of part of it. It
   * also decides which empty state is shown, and "nothing has been ingested"
   * would be the wrong thing to say to a reader whose regional search found
   * nothing.
   */
  const hasQuery = activeFilters > 0 || regional !== undefined;

  // Only the sources that supplied a listing on this page. Adzuna's terms bind
  // "each displayed advert", so the obligation follows what is displayed.
  const shownSources = result.ok
    ? [...new Set(result.value.jobs.map((job) => job.sourceKey))]
    : [];

  /*
   * Freshness, per source that is actually on the page.
   *
   * This used to be one figure taken from Adzuna and printed above whatever
   * happened to be displayed, which told a reader something untrue whenever a
   * Queensland listing was among them. The two sources are crawled on different
   * schedules by different schedulers, so there is no single honest number, and
   * the fix is to stop pretending there is one.
   */
  // Run together: the freshness of what is displayed, and the vocabulary the
  // source filter should offer. Two unrelated answers, one wait.
  const [verified, indexed, skillsHeld] = await Promise.all([
    lastVerifiedBySource(shownSources),
    listIndexedSources(),
    listSkillsInUse(),
  ]);
  const indexedSources = indexed.ok ? indexed.value : [];
  /*
   * An empty list on failure rather than an error, which is how the source
   * vocabulary degrades too. A filter whose options could not be read is a
   * missing control; it is not a reason to refuse a reader the search results
   * that did load.
   */
  const heldSkills = skillsHeld.ok ? skillsHeld.value : [];

  const pages = result.ok
    ? Math.max(1, Math.ceil(result.value.total / result.value.pageSize))
    : 1;

  const freshnessFields: ReleaseField[] =
    verified.ok && shownSources.length > 0
      ? shownSources.flatMap((key) => {
          const at = verified.value.get(key);
          if (at === undefined) return [];
          return [
            {
              label: `${findSourceDescriptor(key)?.displayName ?? key} last checked`,
              value: dateFormat.format(at),
            },
          ];
        })
      : [];

  const fields: ReleaseField[] = result.ok
    ? [
        {
          label: hasQuery ? 'Matching' : 'In the index',
          value: `${result.value.total.toLocaleString('en-AU')} ${
            result.value.total === 1 ? 'listing' : 'listings'
          }`,
        },
        { label: 'Showing', value: `Page ${String(page)} of ${String(pages)}` },
        ...freshnessFields,
        { label: 'Basis', value: 'As published by the source' },
      ]
    : [];

  return (
    <>
      <Masthead current="jobs" />

      <PageBody width="column">
        <header>
          <Dateline>Advertisements</Dateline>
          <PageTitle>Regional job search</PageTitle>
          <Lede>
            One search across the regional job advertisements this product is licensed to
            republish, with the employer, location and salary exactly as each source
            published them. Where a listing sits is decided by its postcode against the
            instrument that defines a designated regional area, and every listing says
            which postcode and which rule placed it.
          </Lede>
          <p className="text-ink-faint max-w-measure mt-4 text-sm leading-relaxed">
            {legal.disclaimer}
          </p>
        </header>

        <JobSearchForm
          text={text}
          location={location}
          area={area}
          sponsorship={sponsorship}
          employmentType={employmentType}
          source={source}
          postedWithin={
            postedWithinDays === undefined ? undefined : String(postedWithinDays)
          }
          sources={indexedSources}
          skill={skill}
          skills={heldSkills}
        />

        {activeFilters === 0 ? null : (
          <p className="print-hide mt-3 text-sm">
            <a href="/jobs" className={link()}>
              Clear {activeFilters === 1 ? 'filter' : 'all filters'}
            </a>
          </p>
        )}

        {!result.ok ? (
          <Notice title="Search is unavailable">
            <p>{result.error.message}</p>
            {result.error.code === 'NOT_CONFIGURED' ? (
              <p>
                This deployment is missing configuration.{' '}
                <a href="/api/health" className={link()}>
                  /api/health
                </a>{' '}
                names the variables at fault. Guessing at{' '}
                <code className="font-mono text-xs">DATABASE_URL</code> here would be
                wrong as often as right: any invalid variable produces this state.
              </p>
            ) : null}
          </Notice>
        ) : result.value.total === 0 && !hasQuery ? (
          <Notice title="No listings have been ingested yet">
            {credentialsConfigured ? (
              <p>
                Adzuna credentials are configured. Run{' '}
                <code className="font-mono text-xs">npm run adzuna:ingest</code> to fetch
                the first page of advertisements.
              </p>
            ) : (
              <p>
                No job provider is configured. Set{' '}
                <code className="font-mono text-xs">ADZUNA_APP_ID</code> and{' '}
                <code className="font-mono text-xs">ADZUNA_APP_KEY</code> in{' '}
                <code className="font-mono text-xs">.env</code>, then run{' '}
                <code className="font-mono text-xs">npm run adzuna:ingest</code>.
              </p>
            )}
            <p>
              Nothing is shown until real listings are loaded. This page never displays
              placeholder or example advertisements.
            </p>
          </Notice>
        ) : result.value.total === 0 ? (
          <Notice title="No listings match this search">
            <p>
              {searchedFor.length === 0
                ? 'Nothing in the index matches the filters set above.'
                : `Nothing in the index matches ${joinPhrases(searchedFor)}.`}{' '}
              {advice}
            </p>
            {area === defaultAreaFilter ? (
              /*
                The filter most likely to be responsible, named where a reader
                will see it. Search defaults to regional, so an empty result is
                often a regional result rather than an empty index, and saying
                so is more useful than leaving them to find the control.
              */
              <p>
                This search is limited to advertisements in a designated regional area,
                which is most of what this site carries but not all of it. Set{' '}
                <strong className="font-medium">Area</strong> to{' '}
                <strong className="font-medium">Everywhere</strong> to include the rest.
              </p>
            ) : null}
            <p>
              The index holds advertisements collected from the licensed sources listed
              below, which is a sample of what is advertised online rather than every
              vacancy in Australia.
            </p>
          </Notice>
        ) : (
          <>
            {/*
              The results are a region with a heading, which they were not.
              Job titles are h3, and with no h2 above them the page jumped from
              h1 to h3: a screen reader user navigating by heading level lands
              on the first advertisement having been told nothing about what
              they are in. The heading is hidden because the release strip
              directly under it already says the same thing in the visual
              hierarchy, and repeating it on screen would be furniture.
            */}
            <section aria-labelledby="results-heading">
              <h2 id="results-heading" className="sr-only">
                Matching advertisements
              </h2>

              <ReleaseStrip fields={fields} />

              {/*
                What this list is, in words, above the list itself.

                The area filter defaults to regional and removes roughly four
                listings in five. A default that large has to be stated rather
                than left for a reader to deduce from a select box they may
                never look at, and stated where they are already reading.
              */}
              <p className="text-ink-muted max-w-measure mt-4 text-sm leading-relaxed">
                {AREA_SUMMARY[area]}
              </p>

              <JobList jobs={result.value.jobs} />

              <nav
                className="print-hide mt-8 flex items-center justify-between text-sm"
                aria-label="Pagination"
              >
                {page > 1 ? (
                  <a href={hrefFor(filters, page - 1)} className={link()}>
                    Previous
                  </a>
                ) : (
                  <span className="text-ink-faint">Previous</span>
                )}
                <span className="text-ink-muted tabular">
                  Page {page} of {pages}
                </span>
                {page * result.value.pageSize < result.value.total ? (
                  <a href={hrefFor(filters, page + 1)} className={link()}>
                    Next
                  </a>
                ) : (
                  <span className="text-ink-faint">Next</span>
                )}
              </nav>
            </section>

            {/*
              What the area labels mean, and the document behind them.

              First, because it is the filter the product is built on. The
              instrument is named and linked so a reader can check any listing
              against it rather than take our word, which is the difference
              between reporting a published definition and asserting one.
            */}
            <section className="border-rule-strong mt-12 border-t pt-5">
              <Label as="h2">About the area labels</Label>
              <RegionalKey />
              <p className="text-ink-faint max-w-measure mt-4 text-xs leading-relaxed">
                Where a listing sits is decided by its postcode against the{' '}
                <a
                  href={regionalAreas.instrument.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={link()}
                >
                  {regionalAreas.instrument.title}
                </a>
                , which is the published definition of a designated regional area. These
                labels describe where a job is. They are not a statement about any
                person&rsquo;s visa position, and nothing here decides whether anyone may
                apply for or hold any visa.
              </p>
            </section>

            {/*
              What the sponsorship labels mean, shown once rather than repeated
              on every listing. "Not known" carries most of the weight: it is
              on the majority of listings, because most advertisements reach us
              as excerpts, and a reader has to understand it is a limit of what
              we hold rather than something the employer said.
            */}
            <section className="border-rule-strong mt-12 border-t pt-5">
              <Label as="h2">About the sponsorship labels</Label>
              <SponsorshipKey />
              <p className="text-ink-faint max-w-measure mt-4 text-xs leading-relaxed">
                These labels report what each advertisement says, quoted from the
                advertisement itself. They are not advice about any person&rsquo;s visa
                position or eligibility. For that, see the{' '}
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
            </section>

            {/*
              What the lines naming skills mean, and more importantly what a
              listing without any means.

              Last of the three keys because it is the least consequential of
              them: a misread area label sends somebody to the wrong side of a
              migration instrument and a misread sponsorship label misstates an
              employer, where a missed skill costs a reader one advertisement.
              It still needs saying, because absence here is systematically
              misleading in a way the other two are not. Six listings in
              seven carry no skill line, and usually because the advertisement
              reached us as an excerpt rather than because the job asks for
              nothing.
            */}
            <section className="border-rule-strong mt-12 border-t pt-5">
              <Label as="h2">About the skill lines</Label>
              <SkillKey />
              <p className="text-ink-faint max-w-measure mt-4 text-xs leading-relaxed">
                Skills are read from the advertisement&rsquo;s own text against a fixed
                list of things this product recognises, and every entry on that list was
                counted against the stored advertisements before it was added. The list is
                credentials and licences first because that is what this index is mostly
                made of. It is not an occupation classification and does not try to be
                one: see{' '}
                <a href="/methodology" className={link()}>
                  the methodology
                </a>{' '}
                for what is read and what is deliberately left alone.
              </p>
            </section>
          </>
        )}

        <Colophon sources={shownSources}>
          <p>
            Listings are advertisements collected from the sources named below and are a
            sample of what is advertised online, not a count of all vacancies in
            Australia. Salaries marked as an Adzuna Jobsworth estimate were predicted by
            Adzuna, not quoted by the employer.
          </p>
        </Colophon>
      </PageBody>
    </>
  );
}
