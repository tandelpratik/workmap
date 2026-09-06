import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  SmartJobsParseError,
  parseJobDetail,
  parseSearchResults,
  splitLocalities,
} from '@/integrations/smartjobs-qld/parser';
import {
  SOURCE_KEY,
  toEmploymentType,
  toNormalizedJob,
} from '@/integrations/smartjobs-qld/mapper';
import { findRegion, unrecognisedRegions } from '@/integrations/smartjobs-qld/regions';
import { SmartJobsClient } from '@/integrations/smartjobs-qld/client';
import { ingestSmartJobsQld } from '@/ingestion/smartjobs-qld';
import { getDatabase } from '@/db/client';
import type {
  SmartJobsJobDetail,
  SmartJobsSearchRow,
} from '@/integrations/smartjobs-qld/types';

/**
 * Smart Jobs adapter tests.
 *
 * The fixtures are real markup captured from the live portal on 2026-08-31,
 * trimmed to the structures the parser reads. Testing against invented HTML
 * would only prove the parser matches the test author's imagination.
 */

const fixture = (name: string): string =>
  readFileSync(join(__dirname, 'fixtures', 'smartjobs-qld', name), 'utf8');

const searchHtml = fixture('search-results.html');
const detailHtml = fixture('job-detail.html');

/** The fixture's first row, asserted present so each test can rely on it. */
function firstRow(): SmartJobsSearchRow {
  const [row] = parseSearchResults(searchHtml).rows;
  if (!row) throw new Error('the search fixture parsed to no rows');
  return row;
}

describe('Smart Jobs search results parsing', () => {
  it('reads the portal total rather than counting the rows on the page', () => {
    // The page shows 20 of 2038. Confusing the two would make ingestion stop
    // after one page and silently under-report the Queensland labour market.
    const page = parseSearchResults(searchHtml);
    expect(page.total).toBe(2038);
    expect(page.rows.length).toBeLessThan(page.total);
  });

  it('splits the heading into title and employer at the final comma', () => {
    // Titles contain commas of their own, so the split is from the right.
    const row = firstRow();
    expect(row.title).toBe('Health Practitioner - Reliever (Allied Health)');
    expect(row.employer).toBe('Queensland Health');
  });

  it('keeps every region a listing names', () => {
    // A relieving role covering ten regions is one listing in ten places.
    // Keeping only the first would erase most of the regional signal, which is
    // the entire point of the product.
    const row = firstRow();
    expect(row.localities).toContain('Cairns region');
    expect(row.localities).toContain('North West Qld');
    expect(row.localities.length).toBeGreaterThan(5);
  });

  it('follows both link forms the portal mixes into one page', () => {
    // Regression, and the expensive one. The portal links some results as
    // `jncustomsearch.viewFullSingle?...&in_jnCounter=N` and others as a
    // vanity path `/jobs/QLD-QLD-PTCAP2026`. The parser matched only the
    // first, so it dropped about 40% of the rows on a deep page in silence.
    // That read as the portal running out of results and made the source look
    // an order of magnitude smaller than it is.
    const vanity =
      '<h2 class="resultset-title">of <strong>2127</strong> matching jobs</h2>' +
      '<ol class="search-results jobs"><li><h3>' +
      '<A HREF="/jobs/QLD-QLD-PTCAP2026"><span class="result-title">' +
      '<strong>Public Trust Officers - multiple locations</strong>, Public Trust Office' +
      '</span></a><span class="type">Permanent</span></h3>' +
      '<ul class="location"><li><strong class="locality">Cairns region</strong></li></ul>' +
      '</li></ol>';

    const [row] = parseSearchResults(vanity).rows;
    expect(row).toBeDefined();
    expect(row?.title).toBe('Public Trust Officers - multiple locations');
    expect(row?.employer).toBe('Public Trust Office');
    // The slug identifies the row when there is no counter to read.
    expect(row?.rowRef).toBe('QLD-QLD-PTCAP2026');
    expect(row?.detailUrl).toBe('https://smartjobs.qld.gov.au/jobs/QLD-QLD-PTCAP2026');
  });

  it('carries the portal cursor forward instead of inventing an offset', () => {
    const page = parseSearchResults(searchHtml);
    expect(page.nextPageForm).not.toBeNull();
    expect(page.nextPageForm?.in_pg).toBe('20');
    expect(page.nextPageForm?.in_nav).toBe('next_set');
    expect(page.nextPageForm?.in_organid).toBe('14904');
  });

  it('stops paging once the cursor reaches the total', () => {
    // The portal keeps offering a cursor past the end, so the arithmetic is
    // what terminates the walk. Without this, ingestion loops forever.
    const lastPage = searchHtml
      .replace(/<strong>\s*2038\s*<\/strong>/, '<strong>20</strong>')
      .replace(/NAME="in_totalrows" VALUE="2038"/i, 'NAME="in_totalrows" VALUE="20"');
    expect(parseSearchResults(lastPage).nextPageForm).toBeNull();
  });

  it('throws rather than reporting an empty page when the markup moves', () => {
    // A layout change and a day with no vacancies must never look alike.
    expect(() => parseSearchResults('<html><body>redesigned</body></html>')).toThrow(
      SmartJobsParseError,
    );
  });

  it('reports zero honestly when the portal genuinely returns nothing', () => {
    const empty =
      '<h2>Displaying search results of <strong>0</strong> matching jobs</h2>';
    const page = parseSearchResults(empty);
    expect(page.total).toBe(0);
    expect(page.rows).toEqual([]);
    expect(page.nextPageForm).toBeNull();
  });
});

describe('Smart Jobs detail parsing', () => {
  it('takes the stable Queensland reference as the identity', () => {
    // in_jnCounter addresses a row in a result set. QLD/164089 addresses the
    // vacancy, so it is the only safe idempotency key.
    const detail = parseJobDetail(detailHtml);
    expect(detail.reference).toBe('QLD/164089');
    expect(detail.title).toBe('Health Practitioner - Reliever (Allied Health)');
    expect(detail.employer).toBe('Queensland Health');
  });

  it('reads real dates from the structured data', () => {
    const detail = parseJobDetail(detailHtml);
    expect(detail.datePosted).toBe('2025-11-17');
    expect(detail.validThrough).toBe('2049-12-31');
  });

  it('records the licence the page itself declares', () => {
    // This is the compliance evidence, asserted rather than assumed. The page
    // declares CC BY 3.0 AU, which is what governs, not the 4.0 the
    // whole-of-government policy page states by default.
    const detail = parseJobDetail(detailHtml);
    expect(detail.declaredLicence).toBe('http://creativecommons.org/licenses/by/3.0/au/');
  });

  it('stops the location field at the next label, whichever it is', () => {
    // Regression. A live run against the portal returned
    // "Townsville region Job ad reference QLD/164089" as a region, because the
    // terminator only knew about "Closing date". Any unlisted label is
    // swallowed into the final region name, which silently invents a place.
    const labels = [
      'Job ad reference QLD/164089',
      'Closing date Ongoing',
      'Yearly salary $1',
      'Contact person Rebecca Lloyd',
      'Classification HP3',
    ];
    for (const label of labels) {
      const html = `<div>Workplace Location Cairns region,Townsville region ${label}</div>`;
      const detail = parseJobDetail(
        detailHtml.replace(/<!-- detail block -->[\s\S]*/, html),
      );
      expect(detail.localities, `terminator failed for "${label}"`).toEqual([
        'Cairns region',
        'Townsville region',
      ]);
    }
  });

  it('refuses a listing with no identifier', () => {
    const broken = detailHtml.replace(/"value": "QLD\/164089"/, '"value": ""');
    expect(() => parseJobDetail(broken)).toThrow(/identifier/i);
  });
});

describe('Smart Jobs region vocabulary', () => {
  it('matches the portal names exactly, suffix included', () => {
    // "Cairns region" is the portal's name. Trimming the suffix to reach the
    // SA4 "Cairns" would be inventing a mapping.
    expect(findRegion('Cairns region')?.sa4Name).toBe('Cairns');
    expect(findRegion('Cairns')).toBeUndefined();
  });

  it('recognises the three outback regions as distinct portal names', () => {
    for (const name of ['Central West Qld', 'North West Qld', 'South West Qld']) {
      expect(findRegion(name)?.sa4Name).toBe('Queensland - Outback');
      expect(findRegion(name)?.isRegional).toBe(true);
    }
  });

  it('recognises non-places without mapping them to a location', () => {
    expect(findRegion('Flexible')).toBeDefined();
    expect(findRegion('Flexible')?.sa4Name).toBeNull();
  });

  it('reports unknown regions instead of dropping them', () => {
    expect(unrecognisedRegions(['Cairns region', 'Atlantis'])).toEqual(['Atlantis']);
  });

  it('places every region named in the fixture', () => {
    // Guards the vocabulary against the live data actually in hand.
    const page = parseSearchResults(searchHtml);
    const named = page.rows.flatMap((row) => row.localities);
    expect(named.length).toBeGreaterThan(0);
    expect(unrecognisedRegions(named)).toEqual([]);
  });
});

describe('Smart Jobs mapping to the domain', () => {
  const row = firstRow();
  const detail = parseJobDetail(detailHtml);

  it('produces a normalized job keyed on the portal reference', () => {
    const job = toNormalizedJob(row, detail);
    expect(job.sourceKey).toBe(SOURCE_KEY);
    expect(job.sourceId).toBe('QLD/164089');
    expect(job.applyUrl).toContain('smartjobs.qld.gov.au');
    expect(job.postedAt).toEqual(new Date('2025-11-17'));
  });

  it('records the state and every named region, broadest first', () => {
    const job = toNormalizedJob(row, detail);
    expect(job.location?.area[0]).toBe('Queensland');
    expect(job.location?.area).toContain('Cairns region');
    expect(job.location?.rawText).toContain('Cairns region');
  });

  it('never invents coordinates the portal does not publish', () => {
    const job = toNormalizedJob(row, detail);
    expect(job.location?.latitude).toBeNull();
    expect(job.location?.longitude).toBeNull();
  });

  it('leaves salary null rather than parsing free text into a number', () => {
    expect(toNormalizedJob(row, detail).salary).toBeNull();
  });

  it('keeps the portal contract wording beside the mapped type', () => {
    const job = toNormalizedJob(row, detail);
    expect(job.employmentType).toBe('FULL_TIME');
    expect(job.sourceContractType).toContain('Fixed Term Temporary');
  });

  it('returns null for an employment token it does not recognise', () => {
    expect(toEmploymentType(['SEASONAL_HARVEST'])).toBeNull();
    expect(toEmploymentType([])).toBeNull();
  });

  it('falls back to the row regions when the detail page omits them', () => {
    // The portal's JSON-LD publishes an empty jobLocation, so the row is the
    // only geography for any listing whose detail block does not render one.
    const withoutRegions: SmartJobsJobDetail = { ...detail, localities: [] };
    const job = toNormalizedJob(row, withoutRegions);
    expect(job.location?.area).toContain('Cairns region');
  });

  it('reports no location rather than a blank one', () => {
    const bareRow: SmartJobsSearchRow = { ...row, localities: [] };
    const bareDetail: SmartJobsJobDetail = { ...detail, localities: [] };
    expect(toNormalizedJob(bareRow, bareDetail).location).toBeNull();
  });
});

describe('Smart Jobs client', () => {
  const okResponse = (body: string): Response =>
    new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' } });

  it('paces itself between requests', async () => {
    const waits: number[] = [];
    const client = new SmartJobsClient({
      delayMs: 1500,
      fetch: async () => okResponse(searchHtml),
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    await client.searchFirstPage();
    await client.searchNextPage({ in_pg: '20' });

    // No wait before the first request, one before the second.
    expect(waits).toEqual([1500]);
    expect(client.requestsMade).toBe(2);
  });

  it('refuses to exceed its request budget', async () => {
    const client = new SmartJobsClient({
      maxRequests: 1,
      fetch: async () => okResponse(searchHtml),
      sleep: async () => {},
    });
    await client.searchFirstPage();
    await expect(client.searchNextPage({ in_pg: '20' })).rejects.toThrow(/budget/i);
  });

  it('retries a dropped connection rather than abandoning the crawl', async () => {
    // A live run lost its connection at page three and ended there, leaving
    // most of the portal unread. One blip should not look like the source
    // running out of results.
    let calls = 0;
    const client = new SmartJobsClient({
      fetch: async () => {
        calls += 1;
        if (calls === 1) throw new TypeError('fetch failed');
        return okResponse(searchHtml);
      },
      sleep: async () => {},
    });

    const page = await client.searchFirstPage();
    expect(page.total).toBe(2038);
    expect(calls).toBe(2);
    // The retry was a real request and is counted, so a failing host cannot be
    // hammered under cover of the budget.
    expect(client.requestsMade).toBe(2);
  });

  it('backs off further on each retry', async () => {
    const waits: number[] = [];
    const client = new SmartJobsClient({
      delayMs: 1000,
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    await expect(client.searchFirstPage()).rejects.toThrow(/fetch failed/);
    // No wait before the very first attempt; each retry waits longer, because
    // the polite answer to a struggling server is to ask less often.
    expect(waits).toEqual([2000, 3000]);
  });

  it('does not retry a refusal', async () => {
    // A 4xx is the server declining. Repeating a request it has already
    // refused is useless and rude.
    let calls = 0;
    const client = new SmartJobsClient({
      fetch: async () => {
        calls += 1;
        return new Response('no', { status: 403 });
      },
      sleep: async () => {},
    });

    await expect(client.searchFirstPage()).rejects.toThrow(/403/);
    expect(calls).toBe(1);
  });

  it('refuses to follow a link off the portal host', async () => {
    const client = new SmartJobsClient({
      fetch: async () => okResponse(detailHtml),
      sleep: async () => {},
    });
    await expect(client.fetchJobDetail('https://example.com/job/1')).rejects.toThrow(
      /off-host/i,
    );
  });

  it('surfaces an HTTP failure instead of returning an empty page', async () => {
    const client = new SmartJobsClient({
      fetch: async () => new Response('nope', { status: 503 }),
      sleep: async () => {},
    });
    await expect(client.searchFirstPage()).rejects.toThrow(/503/);
  });

  it('stops walking if the portal ever repeats a cursor', async () => {
    // The cursor is server-controlled, so a stuck one is possible. Looping
    // against a public service is the failure to avoid.
    const client = new SmartJobsClient({
      fetch: async () => okResponse(searchHtml),
      sleep: async () => {},
      maxRequests: 50,
    });

    let pages = 0;
    for await (const _page of client.searchPages()) {
      pages += 1;
    }
    // Page one, then the cursor at in_pg=20 repeats and the walk stops.
    expect(pages).toBe(2);
  });
});

describe('splitLocalities', () => {
  it('splits on commas only, so hyphenated region names survive', () => {
    expect(splitLocalities('Darling Downs - Maranoa,Logan - Beaudesert')).toEqual([
      'Darling Downs - Maranoa',
      'Logan - Beaudesert',
    ]);
  });

  it('drops empty segments from trailing separators', () => {
    expect(splitLocalities('Cairns region,,')).toEqual(['Cairns region']);
  });
});

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

class Rollback extends Error {}

/**
 * A stub portal, built from the captured fixtures.
 *
 * The adapter is covered above, so what these tests exercise is the ingestion
 * path: the gates, the write, the idempotency and, most importantly, how many
 * requests a run is willing to make of somebody else's public service.
 */
function stubSource(options: { pages?: number } = {}) {
  const page = parseSearchResults(searchHtml);
  const detail = parseJobDetail(detailHtml);
  const pages = options.pages ?? 1;

  let searches = 0;
  let details = 0;

  return {
    get requestsMade() {
      return searches + details;
    },
    get searchCount() {
      return searches;
    },
    get detailCount() {
      return details;
    },
    searchFirstPage: () => {
      searches += 1;
      return Promise.resolve({
        ...page,
        nextPageForm: pages > 1 ? { in_page: '2' } : null,
      });
    },
    searchNextPage: () => {
      searches += 1;
      return Promise.resolve({ ...page, nextPageForm: null });
    },
    fetchJobDetail: (url: string) => {
      details += 1;
      // A distinct reference per URL, because that is what the portal does.
      // Returning one detail for every row would make every listing the same
      // vacancy, and the idempotency assertions below would be measuring the
      // stub rather than the ingestion.
      const counter = /jncounter=(d+)/i.exec(url)?.[1] ?? String(details);
      return Promise.resolve({ ...detail, reference: `QLD/${counter}` });
    },
  };
}

try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Database sections skip.
}

const withDatabase = describe.skipIf(!process.env['DATABASE_URL']);

withDatabase('Smart Jobs ingestion', () => {
  it('refuses to ingest while the source is not activated', async () => {
    // Activation is the product owner's decision and the gate enforces it
    // rather than warning about it (ADR-0009). The source is set back to
    // PENDING inside a rolled-back transaction rather than relying on the
    // registry's current state: this test is about the gate, and it has to
    // keep proving the gate works after the source is switched on for real.
    const database = getDatabase();
    if (!database.ok) throw new Error('no database');

    let result: Awaited<ReturnType<typeof ingestSmartJobsQld>> | null = null;
    try {
      await database.value.$transaction(
        async (tx) => {
          await tx.source.update({
            where: { key: SOURCE_KEY },
            data: { activation: 'PENDING' },
          });

          result = await ingestSmartJobsQld({
            db: tx,
            client: stubSource(),
            triggeredBy: 'test',
          });

          throw new Rollback();
        },
        { timeout: 120_000, maxWait: 30_000 },
      );
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    const outcome = result as Awaited<ReturnType<typeof ingestSmartJobsQld>> | null;
    expect(outcome).not.toBeNull();
    expect(outcome?.ok).toBe(false);
    if (outcome === null || outcome.ok) return;
    expect(outcome.error.code).toBe('FORBIDDEN');
    expect(outcome.error.message).toContain('PENDING');
  });

  it('stores listings once, and makes no requests for ones it already has', async () => {
    const database = getDatabase();
    if (!database.ok) throw new Error('no database');

    const client = stubSource();
    let first: Awaited<ReturnType<typeof ingestSmartJobsQld>> | null = null;
    let second: Awaited<ReturnType<typeof ingestSmartJobsQld>> | null = null;
    let storedTitle: string | null = null;
    let storedState: string | null = null;
    let placed = false;
    let detailsAfterFirst = 0;

    try {
      await database.value.$transaction(
        async (tx) => {
          // Activated inside the transaction, so the run can be exercised
          // without turning the source on for the whole product. The rollback
          // puts it back to PENDING.
          await tx.source.update({
            where: { key: SOURCE_KEY },
            data: { activation: 'ACTIVE' },
          });

          // Ingested listings from a real run are a normal state for this
          // database. This test is about what one ingestion does, so it starts
          // from a known empty state for this source. Inside the rolled-back
          // transaction, so no real listing is lost.
          await tx.job.deleteMany({ where: { sourceKey: SOURCE_KEY } });

          first = await ingestSmartJobsQld({
            db: tx,
            client,
            maxRequests: 30,
            triggeredBy: 'test',
          });
          detailsAfterFirst = client.detailCount;

          second = await ingestSmartJobsQld({
            db: tx,
            client,
            maxRequests: 30,
            triggeredBy: 'test',
          });

          const stored = await tx.job.findFirst({
            where: { sourceKey: SOURCE_KEY, sourceUrl: firstRow().detailUrl },
            select: {
              title: true,
              location: { select: { stateCode: true, geographyId: true } },
            },
          });
          storedTitle = stored?.title ?? null;
          storedState = stored?.location?.stateCode ?? null;
          placed = Boolean(stored?.location?.geographyId);

          throw new Rollback();
        },
        { timeout: 120_000, maxWait: 30_000 },
      );
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    const firstRun = first as Awaited<ReturnType<typeof ingestSmartJobsQld>> | null;
    if (firstRun === null || !firstRun.ok) {
      throw new Error(
        `first ingest failed: ${firstRun === null ? 'not run' : firstRun.error.message}`,
      );
    }

    expect(firstRun.value.reportedTotal).toBe(2038);
    expect(firstRun.value.seen).toBeGreaterThan(0);
    expect(firstRun.value.created).toBeGreaterThan(0);
    expect(storedTitle).toBe('Health Practitioner - Reliever (Allied Health)');

    // Every listing is a Queensland Government vacancy, and the portal's
    // closed region vocabulary places it on a real ASGS area.
    expect(storedState).toBe('QLD');
    expect(placed).toBe(true);

    const secondRun = second as Awaited<ReturnType<typeof ingestSmartJobsQld>> | null;
    if (secondRun === null || !secondRun.ok) throw new Error('second ingest failed');

    // The point of the whole design. A re-run reads the search page and stops:
    // it already holds these listings, so it asks the portal for nothing more.
    expect(secondRun.value.detailsFetched).toBe(0);
    expect(secondRun.value.skippedFresh).toBeGreaterThan(0);
    expect(secondRun.value.created).toBe(0);
    expect(client.detailCount).toBe(detailsAfterFirst);
  }, 180_000);

  it('keeps the listings it fetched when a run dies part way through', async () => {
    // The property that matters most on an unreliable connection. Runs used to
    // hold every fetched listing in memory and write once at the end, so a
    // dropped connection threw away the whole run: twice, an hour of polite
    // crawling produced nothing and the next run refetched the same pages.
    const database = getDatabase();
    if (!database.ok) throw new Error('no database');

    const client = stubSource();
    // The fixture yields three rows, so the batch size is set to one: the
    // point is to prove a flush happened before the failure, not to move a
    // large volume. An earlier version of this test asked for a failure after
    // thirty details against a three-row fixture, so the failure never fired
    // and the test passed by never reaching what it was checking.
    const failAfter = 2;
    let fetched = 0;
    const flaky = {
      ...client,
      fetchJobDetail: (url: string) => {
        fetched += 1;
        if (fetched > failAfter) return Promise.reject(new Error('connection lost'));
        return client.fetchJobDetail(url);
      },
    };

    let stored = -1;
    try {
      await database.value.$transaction(
        async (tx) => {
          await tx.source.update({
            where: { key: SOURCE_KEY },
            data: { activation: 'ACTIVE' },
          });
          await tx.job.deleteMany({ where: { sourceKey: SOURCE_KEY } });

          await expect(
            ingestSmartJobsQld({
              db: tx,
              client: flaky,
              writeBatchSize: 1,
              triggeredBy: 'test',
            }),
          ).rejects.toThrow(/connection lost/);

          stored = await tx.job.count({ where: { sourceKey: SOURCE_KEY } });
          throw new Rollback();
        },
        { timeout: 120_000, maxWait: 30_000 },
      );
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    // The run failed, and the work it had already done survived it.
    expect(stored).toBeGreaterThan(0);
    expect(stored).toBeLessThanOrEqual(failAfter);
  }, 180_000);

  it('stops at the request budget rather than finishing the crawl', async () => {
    const database = getDatabase();
    if (!database.ok) throw new Error('no database');

    const client = stubSource();
    let outcome: Awaited<ReturnType<typeof ingestSmartJobsQld>> | null = null;

    try {
      await database.value.$transaction(
        async (tx) => {
          await tx.source.update({
            where: { key: SOURCE_KEY },
            data: { activation: 'ACTIVE' },
          });

          // Ingested listings from a real run are a normal state for this
          // database. This test is about what one ingestion does, so it starts
          // from a known empty state for this source. Inside the rolled-back
          // transaction, so no real listing is lost.
          await tx.job.deleteMany({ where: { sourceKey: SOURCE_KEY } });

          // One search page plus two details, and no more. A crawler that
          // treats its budget as a target rather than a ceiling is how a
          // polite client becomes an incident on someone else's server.
          outcome = await ingestSmartJobsQld({
            db: tx,
            client,
            maxRequests: 3,
            triggeredBy: 'test',
          });

          throw new Rollback();
        },
        { timeout: 120_000, maxWait: 30_000 },
      );
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    const run = outcome as Awaited<ReturnType<typeof ingestSmartJobsQld>> | null;
    if (run === null || !run.ok) throw new Error('budgeted ingest failed');

    expect(run.value.requests).toBeLessThanOrEqual(3);
    expect(run.value.detailsFetched).toBe(2);
    // It saw a full page of rows and deliberately left most of them.
    expect(run.value.seen).toBeGreaterThan(run.value.detailsFetched);

    // The run says it stopped early, so a partial crawl is legible as partial.
    expect(run.value.stoppedOnBudget).toBe(true);

    // And nothing is quarantined for it. Regression: the budget error was a
    // SmartJobsRequestError, so ingestion could not tell "we chose to stop"
    // from "the source returned something wrong", and a healthy bounded run
    // reported two quarantined records. Quarantine has to mean bad data or it
    // is not worth watching.
    expect(run.value.quarantined).toBe(0);
  }, 180_000);
});
