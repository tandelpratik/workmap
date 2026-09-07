import type { Metadata } from 'next';
import { getAdzunaCredentials } from '@/config/env';
import { lastRetrievedAt, searchJobs } from '@/db/repositories/job';
import { JobList } from '@/components/job-list';
import { SponsorshipKey } from '@/components/sponsorship-badge';
import { JobSearchForm } from '@/components/job-search-form';
import { sponsorshipSignals } from '@/domain/sponsorship';
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

function pageHref(params: {
  q?: string | undefined;
  where?: string | undefined;
  sponsorship?: string | undefined;
  page: number;
}): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.where) search.set('where', params.where);
  // Carried through paging. Dropping it would quietly widen the result set on
  // page two, so a reader filtering for sponsorship would find listings that
  // do not match without being told the filter had gone.
  if (params.sponsorship) search.set('sponsorship', params.sponsorship);
  if (params.page > 1) search.set('page', String(params.page));
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
  const requestedPage = Number(first(params['page']) ?? '1');
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.trunc(requestedPage))
    : 1;

  const result = await searchJobs({
    ...(text ? { text } : {}),
    ...(location ? { location } : {}),
    ...(sponsorship ? { sponsorship } : {}),
    page,
    pageSize: PAGE_SIZE,
  });

  const freshness = await lastRetrievedAt('adzuna');
  const credentialsConfigured = getAdzunaCredentials() !== null;
  const hasQuery = text !== undefined || location !== undefined;

  // Only the sources that supplied a listing on this page. Adzuna's terms bind
  // "each displayed advert", so the obligation follows what is displayed.
  const shownSources = result.ok
    ? [...new Set(result.value.jobs.map((job) => job.sourceKey))]
    : [];

  const pages = result.ok
    ? Math.max(1, Math.ceil(result.value.total / result.value.pageSize))
    : 1;

  const fields: ReleaseField[] = result.ok
    ? [
        {
          label: hasQuery ? 'Matching' : 'In the index',
          value: `${result.value.total.toLocaleString('en-AU')} ${
            result.value.total === 1 ? 'listing' : 'listings'
          }`,
        },
        { label: 'Showing', value: `Page ${String(page)} of ${String(pages)}` },
        ...(freshness.ok && freshness.value !== null
          ? [{ label: 'Last retrieved', value: dateFormat.format(freshness.value) }]
          : []),
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

        <JobSearchForm text={text} location={location} sponsorship={sponsorship} />

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
            <ReleaseStrip fields={fields} />

            <JobList jobs={result.value.jobs} />

            <nav
              className="print-hide mt-8 flex items-center justify-between text-sm"
              aria-label="Pagination"
            >
              {page > 1 ? (
                <a
                  href={pageHref({
                    q: text,
                    where: location,
                    sponsorship,
                    page: page - 1,
                  })}
                  className={link()}
                >
                  Previous
                </a>
              ) : (
                <span className="text-ink-faint">Previous</span>
              )}
              <span className="text-ink-muted tabular">
                Page {page} of {pages}
              </span>
              {page * result.value.pageSize < result.value.total ? (
                <a
                  href={pageHref({
                    q: text,
                    where: location,
                    sponsorship,
                    page: page + 1,
                  })}
                  className={link()}
                >
                  Next
                </a>
              ) : (
                <span className="text-ink-faint">Next</span>
              )}
            </nav>

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
