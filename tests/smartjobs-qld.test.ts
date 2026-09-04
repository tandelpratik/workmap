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
