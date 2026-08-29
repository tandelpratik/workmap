import { brand } from '@/config/brand';
import { getAdzunaCredentials } from '@/config/env';
import { lastRetrievedAt, searchJobs } from '@/db/repositories/job';
import { AdzunaAttribution } from '@/components/adzuna-attribution';
import { JobList } from '@/components/job-list';
import { JobSearchForm } from '@/components/job-search-form';

/**
 * Job search.
 *
 * Rendered on the server from the URL, so a search is shareable and works
 * without client JavaScript.
 *
 * Every state a reader can land in is handled explicitly, because "no results"
 * and "no provider configured" are different facts and collapsing them into one
 * empty page would misrepresent the product (ADR-0008).
 */

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

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
  page: number;
}): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.where) search.set('where', params.where);
  if (params.page > 1) search.set('page', String(params.page));
  const query = search.toString();
  return query === '' ? '/' : `/?${query}`;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const text = first(params['q']);
  const location = first(params['where']);
  const requestedPage = Number(first(params['page']) ?? '1');
  const page = Number.isFinite(requestedPage)
    ? Math.max(1, Math.trunc(requestedPage))
    : 1;

  const result = await searchJobs({
    ...(text ? { text } : {}),
    ...(location ? { location } : {}),
    page,
    pageSize: PAGE_SIZE,
  });

  const freshness = await lastRetrievedAt('adzuna');
  const credentialsConfigured = getAdzunaCredentials() !== null;
  const hasQuery = text !== undefined || location !== undefined;

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
      <header>
        <p className="text-ink-faint font-mono text-xs tracking-widest uppercase">
          {brand.shortName}
        </p>
        <h1 className="text-ink mt-4 font-serif text-4xl leading-tight font-semibold sm:text-5xl">
          Job advertisements in Australia
        </h1>
        <p className="text-ink-muted max-w-measure mt-3 text-base leading-relaxed">
          Search advertised roles, with the employer, location and salary exactly as the
          source published them.
        </p>
      </header>

      <JobSearchForm text={text} location={location} />

      {!result.ok ? (
        <Notice title="Search is unavailable">
          <p>{result.error.message}</p>
          {result.error.code === 'NOT_CONFIGURED' ? (
            <p>
              This deployment is missing configuration.{' '}
              <a href="/api/health" className="text-ink underline underline-offset-4">
                /api/health
              </a>{' '}
              names the variables at fault. Guessing at{' '}
              <code className="font-mono text-xs">DATABASE_URL</code> here would be wrong
              as often as right: any invalid variable produces this state.
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
            The index holds advertisements collected from Adzuna, which is a sample of
            what is advertised online rather than every vacancy in Australia.
          </p>
        </Notice>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <p className="text-ink-muted text-sm">
              <span className="tabular text-ink font-medium">
                {result.value.total.toLocaleString('en-AU')}
              </span>{' '}
              {result.value.total === 1 ? 'listing' : 'listings'}
              {hasQuery ? ' matching this search' : ' in the index'}
            </p>
            {freshness.ok && freshness.value !== null ? (
              <p className="text-ink-faint font-mono text-xs tracking-wide uppercase">
                Updated{' '}
                {new Intl.DateTimeFormat('en-AU', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'Australia/Sydney',
                }).format(freshness.value)}
              </p>
            ) : null}
          </div>

          <JobList jobs={result.value.jobs} />

          <nav
            className="mt-8 flex items-center justify-between text-sm"
            aria-label="Pagination"
          >
            {page > 1 ? (
              <a
                href={pageHref({ q: text, where: location, page: page - 1 })}
                className="text-ink hover:text-accent underline underline-offset-4"
              >
                Previous
              </a>
            ) : (
              <span className="text-ink-faint">Previous</span>
            )}
            <span className="text-ink-muted tabular">
              Page {page} of{' '}
              {Math.max(1, Math.ceil(result.value.total / result.value.pageSize))}
            </span>
            {page * result.value.pageSize < result.value.total ? (
              <a
                href={pageHref({ q: text, where: location, page: page + 1 })}
                className="text-ink hover:text-accent underline underline-offset-4"
              >
                Next
              </a>
            ) : (
              <span className="text-ink-faint">Next</span>
            )}
          </nav>
        </>
      )}

      <footer className="border-rule mt-14 border-t pt-6">
        {/*
          Required by the Adzuna terms on every page displaying their adverts.
          A licence condition, so it is not optional and not decorative.
        */}
        <AdzunaAttribution />
        <p className="text-ink-faint max-w-measure mt-4 text-sm leading-relaxed">
          Listings are advertisements collected from Adzuna and are a sample of what is
          advertised online, not a count of all vacancies in Australia. Salaries marked as
          an Adzuna Jobsworth estimate were predicted by Adzuna, not quoted by the
          employer.
        </p>
      </footer>
    </main>
  );
}
