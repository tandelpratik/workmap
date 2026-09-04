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
  /** Test seams. Neither is used in production. */
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class SmartJobsClient {
  private readonly delayMs: number;
  private readonly maxRequests: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private requestCount = 0;

  constructor(options: SmartJobsClientOptions = {}) {
    this.delayMs = options.delayMs ?? 1500;
    this.maxRequests = options.maxRequests ?? 200;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? defaultSleep;
  }

  /** Requests made so far, for the ingestion log and the run budget. */
  get requestsMade(): number {
    return this.requestCount;
  }

  private async request(url: string, body?: Record<string, string>): Promise<string> {
    if (this.requestCount >= this.maxRequests) {
      throw new SmartJobsRequestError(
        `request budget of ${this.maxRequests} reached; refusing to continue`,
      );
    }
    // Pace before every request after the first, so a caller cannot skip the
    // delay by interleaving search and detail calls.
    if (this.requestCount > 0) {
      await this.sleep(this.delayMs);
    }
    this.requestCount += 1;

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
