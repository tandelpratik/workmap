import { brand } from '@/config/brand';
import { parseJobDetail, parseSearchResults } from './parser';
import type { SmartJobsJobDetail, SmartJobsSearchPage } from './types';

/**
 * Smart Jobs and Careers HTTP client.
 *
 * The portal publishes no API, no rate limit and no `robots.txt` (it returns
 * 404), so there is no stated crawl policy to honour and none to hide behind.
 * The client therefore paces itself conservatively by default and runs strictly
 * sequentially. Absence of a published limit is not permission to hammer a
 * public service.
 *
 * Paging is a form replay. The portal carries its cursor in hidden fields, so
 * the client posts back what the server sent rather than constructing an offset
 * of its own.
 */

const SEARCH_URL = 'https://smartjobs.qld.gov.au/jobtools/jncustomsearch.searchResults';
const PAGE_URL = 'https://smartjobs.qld.gov.au/jobtools/jncustomsearch.searchAction';

/** The Queensland Government tenant on the shared NGA.NET installation. */
export const ORGAN_ID = '14904';

/**
 * Identifies the crawler honestly, with a contact route where one is set.
 *
 * A public service operator who wants this traffic to stop must be able to see
 * who it is and say so. The name is built from the brand configuration rather
 * than written out, so a rename stays a configuration change (ADR-0007).
 */
function userAgent(): string {
  const name = brand.shortName.replace(/\s+/g, '');
  const contact = brand.contactEmail ?? brand.domain ?? 'contact via site owner';
  return `${name}Bot/0.1 (+${contact}; job listing indexing)`;
}

/**
 * The run reached its own request ceiling and stopped.
 *
 * Deliberately its own type, and not a subclass of the transport error. A
 * budget is a decision we made about someone else's server, so reaching it is
 * a normal end to a run, not a failure of the source. Conflating the two made
 * a healthy bounded run report quarantined records, which is exactly the
 * signal that has to stay trustworthy: quarantine should mean "this data was
 * wrong", never "we chose to stop".
 */
export class SmartJobsBudgetReached extends Error {
  constructor(readonly budget: number) {
    super(`request budget of ${budget} reached; stopping this run`);
    this.name = 'SmartJobsBudgetReached';
  }
}

export class SmartJobsRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SmartJobsRequestError';
  }
}

export interface SmartJobsClientOptions {
  /** Milliseconds between requests. Deliberately generous by default. */
  readonly delayMs?: number;
  /** Hard ceiling on requests per run, so a paging bug cannot run away. */
  readonly maxRequests?: number;
  /** Extra attempts after a transient failure. Zero disables retrying. */
  readonly maxRetries?: number;
  /** Test seams. Neither is used in production. */
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class SmartJobsClient {
  private readonly delayMs: number;
  private readonly maxRequests: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private requestCount = 0;

  constructor(options: SmartJobsClientOptions = {}) {
    this.delayMs = options.delayMs ?? 1500;
    this.maxRequests = options.maxRequests ?? 200;
    this.maxRetries = options.maxRetries ?? 2;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** Requests made so far, for the ingestion log and the run budget. */
  get requestsMade(): number {
    return this.requestCount;
  }

  private async attempt(url: string, body?: Record<string, string>): Promise<string> {
    const response = await this.fetchImpl(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        'User-Agent': userAgent(),
        Accept: 'text/html',
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(body ? { body: new URLSearchParams(body).toString() } : {}),
    });

    if (!response.ok) {
      throw new SmartJobsRequestError(
        `Smart Jobs responded ${response.status} for ${url}`,
        response.status,
      );
    }
    return response.text();
  }

  /**
   * Whether a failure is worth trying again.
   *
   * A dropped connection or a 5xx is the network or the server having a
   * moment. A 4xx is the server declining, and repeating a request it has
   * already refused is both useless and rude.
   */
  private static isTransient(error: unknown): boolean {
    if (error instanceof SmartJobsRequestError) {
      return error.status === undefined || error.status >= 500;
    }
    // fetch rejects with a TypeError on a network failure.
    return error instanceof Error;
  }

  private async request(url: string, body?: Record<string, string>): Promise<string> {
    let lastError: unknown;

    // One try plus two retries. A single dropped connection used to end the
    // whole paging walk and leave most of the portal unread, which made a
    // transient network blip look like the source running out of results.
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (this.requestCount >= this.maxRequests) {
        throw new SmartJobsBudgetReached(this.maxRequests);
      }
      // Pace before every request after the first, so a caller cannot skip the
      // delay by interleaving search and detail calls. A retry waits longer
      // each time, because the polite response to a server having trouble is
      // to ask less often rather than to try harder.
      if (this.requestCount > 0) {
        await this.sleep(this.delayMs * (attempt + 1));
      }
      // Retries are real requests and count against the budget, so a failing
      // host cannot be hammered under cover of the ceiling.
      this.requestCount += 1;

      try {
        return await this.attempt(url, body);
      } catch (error) {
        if (!SmartJobsClient.isTransient(error)) throw error;
        lastError = error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new SmartJobsRequestError(`Smart Jobs request failed for ${url}`);
  }

  /** The first page of results, which also carries the total and the cursor. */
  async searchFirstPage(): Promise<SmartJobsSearchPage> {
    const html = await this.request(SEARCH_URL, {
      in_organid: ORGAN_ID,
      in_sessionid: '',
      in_skills: '',
      in_orderby: 'Relevance',
      in_exact_phrase_match: '',
    });
    return parseSearchResults(html);
  }

  /** The page the given cursor points at. */
  async searchNextPage(
    form: Readonly<Record<string, string>>,
  ): Promise<SmartJobsSearchPage> {
    const html = await this.request(PAGE_URL, { ...form });
    return parseSearchResults(html);
  }

  async fetchJobDetail(detailUrl: string): Promise<SmartJobsJobDetail> {
    // The portal is a single known host. Refusing anything else means a
    // malformed href in the markup cannot redirect the crawler elsewhere.
    const url = new URL(detailUrl);
    if (url.hostname !== 'smartjobs.qld.gov.au') {
      throw new SmartJobsRequestError(`refusing to fetch off-host URL ${detailUrl}`);
    }
    return parseJobDetail(await this.request(url.toString()));
  }

  /**
   * Walks the result pages in order, yielding each as it arrives.
   *
   * Yielding rather than accumulating keeps memory flat and lets ingestion
   * commit as it goes, so an interrupted run still leaves useful work behind.
   */
  async *searchPages(): AsyncGenerator<SmartJobsSearchPage> {
    let page = await this.searchFirstPage();
    yield page;

    const seenOffsets = new Set<string>();
    while (page.nextPageForm) {
      // The portal's cursor is server-controlled. If it ever repeats, or goes
      // missing, stop: a loop against a public service is the failure mode to
      // avoid, and it is worth stopping early to prevent.
      const offset = page.nextPageForm.in_pg;
      if (offset === undefined || seenOffsets.has(offset)) return;
      seenOffsets.add(offset);

      page = await this.searchNextPage(page.nextPageForm);
      yield page;
    }
  }
}
