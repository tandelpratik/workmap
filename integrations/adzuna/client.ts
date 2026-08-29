import type { AdzunaCredentials } from '@/config/env';
import { failure, type Failure } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';
import { adzunaSearchSchema, type AdzunaSearchResponse } from './types';

/**
 * Adzuna HTTP client.
 *
 * The only module that knows their URL shape or that credentials travel in the
 * query string. That last detail is why nothing here ever logs a URL: the key
 * is in it, and a request log would publish the credential to whatever
 * aggregator collects it (ADR-0008).
 *
 * Their documented default allowance is 25 hits/minute, 250/day, 1000/week and
 * 2500/month. The per-minute bound is enforced here. The longer bounds are a
 * budget, not a throttle, and belong to the caller that decides how often to
 * run: see ingestion/adzuna.ts.
 */

const BASE_URL = 'https://api.adzuna.com/v1/api/jobs';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 3;

/** Adzuna caps a page at 50 results. */
export const MAX_RESULTS_PER_PAGE = 50;

export type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<Response>;

export interface AdzunaSearchParams {
  readonly page: number;
  readonly resultsPerPage?: number;
  /** Free-text query. */
  readonly what?: string;
  readonly where?: string;
  /** Restrict to ads created in the last N days. */
  readonly maxDaysOld?: number;
  readonly sortBy?: 'date' | 'salary' | 'relevance';
  readonly category?: string;
}

export interface AdzunaClientOptions {
  readonly credentials: AdzunaCredentials;
  /** Injected in tests so the adapter is exercised without a network. */
  readonly fetchImpl?: FetchLike;
  readonly maxAttempts?: number;
  readonly timeoutMs?: number;
  readonly requestsPerWindow?: number;
  readonly windowMs?: number;
  /** Test seam: waiting is skipped so the limiter can be asserted quickly. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Test seam, paired with sleep. A stub that does not advance the clock
   * would leave the limiter spinning, so time is injectable alongside it. */
  readonly now?: () => number;
}

export interface AdzunaClient {
  search(params: AdzunaSearchParams): Promise<Result<AdzunaSearchResponse, Failure>>;
  /** Requests actually issued, so a run can report against the daily budget. */
  readonly requestCount: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sliding window limiter.
 *
 * In-process and in-memory, which is correct for a single ingestion process
 * and costs nothing. A distributed limiter would need shared state, and the
 * free-tier rules forbid adding infrastructure before evidence demands it.
 */
class SlidingWindow {
  private readonly hits: number[] = [];

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly sleep: (ms: number) => Promise<void>,
    private readonly clock: () => number,
  ) {}

  async acquire(): Promise<void> {
    for (;;) {
      const now = this.clock();
      while (this.hits.length > 0 && now - (this.hits[0] ?? 0) >= this.windowMs) {
        this.hits.shift();
      }
      if (this.hits.length < this.max) {
        this.hits.push(now);
        return;
      }
      const oldest = this.hits[0] ?? now;
      await this.sleep(Math.max(0, this.windowMs - (now - oldest)) + 10);
    }
  }
}

/** A URL safe to log: the credentials are removed, not merely truncated. */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete('app_id');
    parsed.searchParams.delete('app_key');
    return parsed.toString();
  } catch {
    return '(unparseable url)';
  }
}

export function createAdzunaClient(options: AdzunaClientOptions): AdzunaClient {
  const {
    credentials,
    fetchImpl = fetch as unknown as FetchLike,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    requestsPerWindow = 25,
    windowMs = 60_000,
    sleep = defaultSleep,
    now = Date.now,
  } = options;

  const limiter = new SlidingWindow(requestsPerWindow, windowMs, sleep, now);
  let requestCount = 0;

  function buildUrl(params: AdzunaSearchParams): string {
    const page = Math.max(1, Math.trunc(params.page));
    const url = new URL(`${BASE_URL}/${credentials.country}/search/${String(page)}`);

    url.searchParams.set('app_id', credentials.appId);
    url.searchParams.set('app_key', credentials.appKey);
    url.searchParams.set('content-type', 'application/json');
    url.searchParams.set(
      'results_per_page',
      String(
        Math.min(params.resultsPerPage ?? MAX_RESULTS_PER_PAGE, MAX_RESULTS_PER_PAGE),
      ),
    );

    if (params.what) url.searchParams.set('what', params.what);
    if (params.where) url.searchParams.set('where', params.where);
    if (params.category) url.searchParams.set('category', params.category);
    if (params.sortBy) url.searchParams.set('sort_by', params.sortBy);
    if (params.maxDaysOld !== undefined) {
      url.searchParams.set('max_days_old', String(params.maxDaysOld));
    }

    return url.toString();
  }

  async function attempt(
    url: string,
  ): Promise<
    | { readonly kind: 'ok'; readonly body: unknown }
    | { readonly kind: 'retry'; readonly afterMs: number; readonly failure: Failure }
    | { readonly kind: 'fatal'; readonly failure: Failure }
  > {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });

      if (response.ok) {
        try {
          return { kind: 'ok', body: (await response.json()) as unknown };
        } catch {
          return {
            kind: 'fatal',
            failure: failure(
              'SOURCE_UNAVAILABLE',
              'Adzuna returned a response that could not be read as JSON.',
            ),
          };
        }
      }

      if (response.status === 401 || response.status === 403) {
        // Not retried: a rejected credential will be rejected again, and
        // hammering an authentication endpoint is exactly the behaviour the
        // rate limits exist to prevent.
        return {
          kind: 'fatal',
          failure: failure(
            'FORBIDDEN',
            'Adzuna rejected the API credentials. Check ADZUNA_APP_ID and ADZUNA_APP_KEY.',
          ),
        };
      }

      if (response.status === 429) {
        // Honoured rather than worked around. Rate limits are never
        // circumvented (ADR-0005).
        const retryAfter = Number(response.headers.get('retry-after'));
        return {
          kind: 'retry',
          afterMs: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0,
          failure: failure(
            'RATE_LIMITED',
            'Adzuna rate limit reached. The request will be retried after the interval they asked for.',
          ),
        };
      }

      if (response.status >= 500) {
        return {
          kind: 'retry',
          afterMs: 0,
          failure: failure('SOURCE_UNAVAILABLE', 'Adzuna is temporarily unavailable.'),
        };
      }

      return {
        kind: 'fatal',
        failure: failure(
          'SOURCE_UNAVAILABLE',
          `Adzuna refused the request with status ${String(response.status)}.`,
        ),
      };
    } catch {
      // Network error or timeout. The message deliberately carries no detail:
      // the underlying error can contain the request URL, and the URL carries
      // the key.
      return {
        kind: 'retry',
        afterMs: 0,
        failure: failure('SOURCE_UNAVAILABLE', 'Adzuna could not be reached.'),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    get requestCount() {
      return requestCount;
    },

    async search(params) {
      const url = buildUrl(params);
      let lastFailure = failure('SOURCE_UNAVAILABLE', 'Adzuna could not be reached.');

      for (let tries = 0; tries < maxAttempts; tries += 1) {
        await limiter.acquire();
        requestCount += 1;

        const result = await attempt(url);

        if (result.kind === 'ok') {
          const parsed = adzunaSearchSchema.safeParse(result.body);
          if (!parsed.success) {
            return err(
              failure(
                'SOURCE_UNAVAILABLE',
                'Adzuna returned a payload that does not match the documented search response.',
              ),
            );
          }
          return ok(parsed.data);
        }

        if (result.kind === 'fatal') return err(result.failure);

        lastFailure = result.failure;
        logger.warn('Adzuna request failed, retrying', {
          attempt: tries + 1,
          maxAttempts,
          reason: result.failure.code,
          endpoint: redactUrl(url),
        });

        // Exponential backoff with jitter, or the interval the provider asked
        // for when they asked for one.
        const backoff =
          result.afterMs > 0
            ? result.afterMs
            : 2 ** tries * 1000 + Math.floor(Math.random() * 250);
        if (tries < maxAttempts - 1) await sleep(backoff);
      }

      return err(lastFailure);
    },
  };
}
