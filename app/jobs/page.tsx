import type { Metadata } from 'next';
import { getAdzunaCredentials } from '@/config/env';
import { findSourceDescriptor } from '@/config/sources';
import {
  lastVerifiedBySource,
  listIndexedSources,
  searchJobs,
} from '@/db/repositories/job';
import { JobList } from '@/components/job-list';
import { SponsorshipKey } from '@/components/sponsorship-badge';
import { JobSearchForm } from '@/components/job-search-form';
import { sponsorshipSignals } from '@/domain/sponsorship';
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

export const metadata: Metadata = {
  title: 'Job advertisements',
  description:
    'Search Australian job advertisements, with the employer, location and salary exactly as the source published them.',
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
  sponsorship?: string | undefined;
  type?: string | undefined;
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
  const requestedSponsorship = first(params['sponsorship']);
  const sponsorship = sponsorshipSignals.find(
    (signal) => signal === requestedSponsorship,
  );
  // Bounded the same way, for the same reason: a query string is external
  // input, and an unrecognised value widens the search rather than erroring.
  const requestedType = first(params['type']);
  const employmentType = employmentTypes.find((value) => value === requestedType);

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
    ...(sponsorship ? { sponsorship } : {}),
    ...(employmentType ? { employmentType } : {}),
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
    ...(sponsorship === undefined ? {} : { sponsorship }),
    ...(employmentType === undefined ? {} : { type: employmentType }),
    ...(source === undefined ? {} : { source }),
    ...(postedWithinDays === undefined ? {} : { posted: String(postedWithinDays) }),
  };
  const activeFilters = Object.keys(filters).length;

  const credentialsConfigured = getAdzunaCredentials() !== null;
  const hasQuery = activeFilters > 0;

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
  const [verified, indexed] = await Promise.all([
    lastVerifiedBySource(shownSources),
    listIndexedSources(),
  ]);
  const indexedSources = indexed.ok ? indexed.value : [];

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
              label: `${findSourceDescriptor(key)?.displayName ?? key} verified`,
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
          <PageTitle>Job advertisements in Australia</PageTitle>
          <Lede>
            Advertised roles from the sources this product is licensed to republish, with
            the employer, location and salary exactly as each source published them.
          </Lede>
        </header>

        <JobSearchForm
          text={text}
          location={location}
          sponsorship={sponsorship}
          employmentType={employmentType}
          source={source}
          postedWithin={
            postedWithinDays === undefined ? undefined : String(postedWithinDays)
          }
          sources={indexedSources}
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
              Nothing in the index matches
              {text === undefined ? '' : ` “${text}”`}
              {text !== undefined && location !== undefined ? ' in' : ''}
              {location === undefined ? '' : ` ${location}`}. Try a broader term, or clear
              the location.
            </p>
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
