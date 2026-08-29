import { describe, expect, it, vi } from 'vitest';
import * as prismaEnums from '@/db/generated/client/enums';
import { getDatabase } from '@/db/client';
import {
  contentHashOf,
  employmentTypes,
  jobStatuses,
  normalizeCompanyName,
  remoteTypes,
  salaryBases,
  salaryPeriods,
  type NormalizedJob,
} from '@/domain/job';
import { canPublishDerivedAggregates } from '@/domain/source';
import { findSourceDescriptor } from '@/config/sources';
import {
  createAdzunaClient,
  redactUrl,
  type FetchLike,
} from '@/integrations/adzuna/client';
import {
  ADZUNA_SOURCE_KEY,
  mapSearchResponse,
  toPlainText,
} from '@/integrations/adzuna/mapper';
import { adzunaSearchSchema } from '@/integrations/adzuna/types';
import { ingestAdzuna } from '@/ingestion/adzuna';
import { buildGeographyLookup, resolveGeographyAtLevel } from '@/ingestion/dimensions';

try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Database sections skip.
}

const withDatabase = describe.skipIf(!process.env['DATABASE_URL']);

const credentials = { appId: 'test-id', appKey: 'test-key', country: 'au' };

/** Distinct from any real advertisement identifier. */
const FIXTURE_SOURCE_ID = '129698749';

/**
 * A page shaped like the example in Adzuna's own documentation, moved to
 * Australia. The employers and figures are invented; only the shape is real.
 */
function samplePage(overrides: Record<string, unknown>[] = []) {
  return {
    results: [
      {
        id: FIXTURE_SOURCE_ID,
        title: ' <strong>Registered</strong> Nurse ',
        description: 'Caring for patients in a busy ward. &amp; more.',
        created: '2026-08-20T18:07:39Z',
        redirect_url: 'https://www.adzuna.com.au/land/ad/129698749?v=ABC&utm_medium=api',
        company: { display_name: 'Example Health' },
        location: {
          area: ['Australia', 'New South Wales', 'Sydney'],
          display_name: 'Sydney, New South Wales',
        },
        category: { label: 'Healthcare & Nursing Jobs', tag: 'healthcare-nursing-jobs' },
        latitude: -33.86,
        longitude: 151.2,
        salary_min: 80000,
        salary_max: 95000,
        salary_is_predicted: 0,
        contract_type: 'permanent',
        contract_time: 'full_time',
      },
      ...overrides,
    ],
    count: 1234,
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------

describe('job domain and persistence enums agree', () => {
  const cases: ReadonlyArray<[string, readonly string[], Record<string, string>]> = [
    ['EmploymentType', employmentTypes, prismaEnums.EmploymentType],
    ['RemoteType', remoteTypes, prismaEnums.RemoteType],
    ['SalaryPeriod', salaryPeriods, prismaEnums.SalaryPeriod],
    ['SalaryBasis', salaryBases, prismaEnums.SalaryBasis],
    ['JobStatus', jobStatuses, prismaEnums.JobStatus],
  ];

  for (const [name, domainValues, prismaEnum] of cases) {
    it(`${name} matches the database enum`, () => {
      expect([...domainValues].sort()).toEqual(Object.values(prismaEnum).sort());
    });
  }
});

describe('content hash', () => {
  const base = (): NormalizedJob => ({
    sourceKey: 'adzuna',
    sourceId: '1',
    title: 'Nurse',
    description: 'text',
    descriptionFormat: 'TEXT',
    descriptionIsExcerpt: true,
    company: { name: 'Example Health' },
    location: { rawText: 'Sydney', area: [], latitude: null, longitude: null },
    employmentType: 'FULL_TIME',
    sourceContractType: 'permanent',
    remoteType: null,
    salary: null,
    applyUrl: 'https://example.test/1',
    sourceUrl: null,
    postedAt: null,
    category: null,
  });

  it('is stable for identical content', () => {
    expect(contentHashOf(base())).toBe(contentHashOf(base()));
  });

  it('changes when something a reader would see changes', () => {
    expect(contentHashOf(base())).not.toBe(
      contentHashOf({ ...base(), title: 'Senior Nurse' }),
    );
  });

  it('normalises an employer name for matching', () => {
    expect(normalizeCompanyName('Example Health Pty. Ltd.')).toBe(
      'example health pty ltd',
    );
  });
});

describe('the licence gate on aggregation', () => {
  it('refuses derived aggregates for Adzuna even though it is verified', () => {
    const adzuna = findSourceDescriptor('adzuna');
    expect(adzuna?.complianceStatus).toBe('VERIFIED');
    expect(adzuna?.activation).toBe('ACTIVE');
    // Their terms permit publishing listings and reserve aggregation for a
    // written licence. Verified is not the same as unrestricted.
    expect(adzuna && canPublishDerivedAggregates(adzuna)).toBe(false);
  });

  it('permits them for the CC BY sources', () => {
    const jsa = findSourceDescriptor('jsa-ivi');
    expect(jsa && canPublishDerivedAggregates(jsa)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

describe('mapping an Adzuna payload', () => {
  function mapSample(extra: Record<string, unknown>[] = []) {
    const parsed = adzunaSearchSchema.parse(samplePage(extra));
    return mapSearchResponse(parsed, 'au');
  }

  it('reduces provider markup to plain text', () => {
    expect(toPlainText('<strong>Registered</strong> Nurse')).toBe('Registered Nurse');
    expect(toPlainText('Ward &amp; theatre')).toBe('Ward & theatre');
  });

  it('maps a listing onto domain fields', () => {
    const [job] = mapSample().jobs;

    expect(job?.sourceKey).toBe(ADZUNA_SOURCE_KEY);
    expect(job?.sourceId).toBe(FIXTURE_SOURCE_ID);
    expect(job?.title).toBe('Registered Nurse');
    expect(job?.company?.name).toBe('Example Health');
    expect(job?.location?.rawText).toBe('Sydney, New South Wales');
    expect(job?.location?.area[1]).toBe('New South Wales');
    expect(job?.category?.tag).toBe('healthcare-nursing-jobs');
    expect(job?.postedAt?.toISOString()).toBe('2026-08-20T18:07:39.000Z');
  });

  it('records that the description is only an excerpt', () => {
    // Adzuna returns a snippet, and presenting one as a whole advert would
    // misrepresent an employer's listing.
    expect(mapSample().jobs[0]?.descriptionIsExcerpt).toBe(true);
  });

  it('keeps the destination URL and its tracking parameters intact', () => {
    expect(mapSample().jobs[0]?.applyUrl).toContain('utm_medium=api');
  });

  it('treats a quoted salary as reported', () => {
    const salary = mapSample().jobs[0]?.salary;
    expect(salary?.basis).toBe('REPORTED');
    expect(salary?.currency).toBe('AUD');
    expect(salary?.min).toBe(80000);
  });

  it('marks a predicted salary as the provider estimate it is', () => {
    const parsed = adzunaSearchSchema.parse({
      results: [{ ...samplePage().results[0], salary_is_predicted: 1 }],
    });
    expect(mapSearchResponse(parsed, 'au').jobs[0]?.salary?.basis).toBe(
      'SOURCE_ESTIMATED',
    );
  });

  it('drops a salary whose currency cannot be established', () => {
    const parsed = adzunaSearchSchema.parse(samplePage());
    // A country with no known currency: a number with no unit is not a salary.
    expect(mapSearchResponse(parsed, 'zz').jobs[0]?.salary).toBeNull();
  });

  it('keeps the schedule and the contract relationship separately', () => {
    // A real listing on the first live call was a part-time contract role.
    // Collapsing the two axes into one column dropped one of them, which
    // misdescribed the job.
    const parsed = adzunaSearchSchema.parse({
      results: [
        {
          ...samplePage().results[0],
          contract_type: 'contract',
          contract_time: 'part_time',
        },
      ],
    });
    const [job] = mapSearchResponse(parsed, 'au').jobs;
    expect(job?.employmentType).toBe('PART_TIME');
    expect(job?.sourceContractType).toBe('contract');
  });

  it('falls back to the contract relationship when no schedule is stated', () => {
    const parsed = adzunaSearchSchema.parse({
      results: [
        {
          ...samplePage().results[0],
          contract_type: 'contract',
          contract_time: undefined,
        },
      ],
    });
    expect(mapSearchResponse(parsed, 'au').jobs[0]?.employmentType).toBe('CONTRACT');
  });

  it('never invents a remote type', () => {
    expect(mapSample().jobs[0]?.remoteType).toBeNull();
  });

  it('quarantines a listing with no destination, and keeps the rest', () => {
    const result = mapSample([
      { id: '999', title: 'Broken listing' /* no redirect_url */ },
    ]);

    expect(result.jobs).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.sourceId).toBe('999');
    expect(result.rejected[0]?.reason).toContain('redirect_url');
  });

  it('accepts their loose booleans and numeric identifiers', () => {
    const parsed = adzunaSearchSchema.parse({
      results: [{ ...samplePage().results[0], id: 42, salary_is_predicted: '1' }],
    });
    const [job] = mapSearchResponse(parsed, 'au').jobs;
    expect(job?.sourceId).toBe('42');
    expect(job?.salary?.basis).toBe('SOURCE_ESTIMATED');
  });
});

describe('resolving a location at a known level', () => {
  // The real registry shape that broke every Canberra advertisement: the ACT
  // exists as a state and as the single SA4 inside it, with the same name.
  const lookup = buildGeographyLookup([
    { id: 'aus', code: 'AUS', name: 'Australia', level: 'COUNTRY' },
    { id: 'act-state', code: '8', name: 'Australian Capital Territory', level: 'STATE' },
    { id: 'act-sa4', code: '801', name: 'Australian Capital Territory', level: 'SA4' },
    { id: 'nsw', code: '1', name: 'New South Wales', level: 'STATE' },
  ]);

  it('picks the state when the provider placed the name at state level', () => {
    expect(
      resolveGeographyAtLevel(lookup, 'Australian Capital Territory', 'STATE'),
    ).toEqual({ status: 'RESOLVED', id: 'act-state', level: 'STATE' });
  });

  it('picks the SA4 of the same name when asked for that level', () => {
    expect(
      resolveGeographyAtLevel(lookup, 'Australian Capital Territory', 'SA4'),
    ).toEqual({ status: 'RESOLVED', id: 'act-sa4', level: 'SA4' });
  });

  it('resolves an abbreviation at the level asked for', () => {
    expect(resolveGeographyAtLevel(lookup, 'ACT', 'STATE')).toEqual({
      status: 'RESOLVED',
      id: 'act-state',
      level: 'STATE',
    });
  });

  it('links a nationwide advertisement to the country', () => {
    expect(resolveGeographyAtLevel(lookup, 'Australia', 'COUNTRY')).toEqual({
      status: 'RESOLVED',
      id: 'aus',
      level: 'COUNTRY',
    });
  });

  it('still refuses a name that is not in the registry at that level', () => {
    expect(resolveGeographyAtLevel(lookup, 'Victoria', 'STATE').status).toBe(
      'UNRESOLVED',
    );
  });
});

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

describe('the Adzuna client', () => {
  it('strips credentials from anything loggable', () => {
    const redacted = redactUrl(
      'https://api.adzuna.com/v1/api/jobs/au/search/1?app_id=abc&app_key=secret&what=nurse',
    );
    expect(redacted).not.toContain('secret');
    expect(redacted).not.toContain('abc');
    expect(redacted).toContain('what=nurse');
  });

  it('sends the credentials and the documented parameters', async () => {
    let requested = '';
    const fetchImpl: FetchLike = (url) => {
      requested = url;
      return Promise.resolve(jsonResponse(samplePage()));
    };

    const client = createAdzunaClient({ credentials, fetchImpl });
    const result = await client.search({ page: 2, what: 'nurse', resultsPerPage: 50 });

    expect(result.ok).toBe(true);
    expect(requested).toContain('/jobs/au/search/2');
    expect(requested).toContain('app_id=test-id');
    expect(requested).toContain('app_key=test-key');
    expect(requested).toContain('results_per_page=50');
    expect(requested).toContain('what=nurse');
  });

  it('caps the page size at the documented maximum', async () => {
    let requested = '';
    const client = createAdzunaClient({
      credentials,
      fetchImpl: (url) => {
        requested = url;
        return Promise.resolve(jsonResponse(samplePage()));
      },
    });

    await client.search({ page: 1, resultsPerPage: 500 });
    expect(requested).toContain('results_per_page=50');
  });

  it('does not retry rejected credentials', async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({}, 401)));
    const client = createAdzunaClient({
      credentials,
      fetchImpl: fetchImpl as unknown as FetchLike,
      sleep: () => Promise.resolve(),
    });

    const result = await client.search({ page: 1 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('FORBIDDEN');
    // Hammering an auth endpoint is what the rate limits exist to prevent.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('honours a Retry-After interval rather than backing off on its own', async () => {
    const waits: number[] = [];
    const fetchImpl = vi.fn(() =>
      Promise.resolve(jsonResponse({}, 429, { 'retry-after': '7' })),
    );

    const client = createAdzunaClient({
      credentials,
      fetchImpl: fetchImpl as unknown as FetchLike,
      maxAttempts: 2,
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });

    const result = await client.search({ page: 1 });
    expect(!result.ok && result.error.code).toBe('RATE_LIMITED');
    expect(waits).toContain(7000);
  });

  it('retries a server error and succeeds', async () => {
    let call = 0;
    const client = createAdzunaClient({
      credentials,
      fetchImpl: () => {
        call += 1;
        return Promise.resolve(
          call === 1 ? jsonResponse({}, 503) : jsonResponse(samplePage()),
        );
      },
      sleep: () => Promise.resolve(),
    });

    const result = await client.search({ page: 1 });
    expect(result.ok).toBe(true);
    expect(call).toBe(2);
  });

  it('waits rather than exceeding the documented rate limit', async () => {
    const waits: number[] = [];
    // A controlled clock, advanced by the sleep double. Without it the limiter
    // would spin: it waits for the window to move, and a no-op sleep never
    // moves it.
    let clock = 1_000_000;

    const client = createAdzunaClient({
      credentials,
      fetchImpl: () => Promise.resolve(jsonResponse(samplePage())),
      requestsPerWindow: 2,
      windowMs: 60_000,
      now: () => clock,
      sleep: (ms) => {
        waits.push(ms);
        clock += ms;
        return Promise.resolve();
      },
    });

    await client.search({ page: 1 });
    await client.search({ page: 2 });
    expect(waits).toHaveLength(0);

    // The third request in a window of two has to wait for the window to move.
    await client.search({ page: 3 });
    expect(waits.length).toBeGreaterThan(0);
    expect(client.requestCount).toBe(3);
  });

  it('reports a payload that does not match the documented shape', async () => {
    const client = createAdzunaClient({
      credentials,
      fetchImpl: () => Promise.resolve(jsonResponse({ unexpected: true })),
    });

    const result = await client.search({ page: 1 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('SOURCE_UNAVAILABLE');
  });
});

// ---------------------------------------------------------------------------
// Ingestion, end to end
// ---------------------------------------------------------------------------

class Rollback extends Error {}

withDatabase('ingesting into the database', () => {
  it('stores listings once, and writes nothing on an unchanged re-run', async () => {
    const database = getDatabase();
    if (!database.ok) throw new Error('no database');

    // A stub client: the adapter is already covered above, and this proves
    // the ingestion path without spending a request from the daily budget.
    const stubClient = {
      requestCount: 0,
      search: () =>
        Promise.resolve({
          ok: true as const,
          value: adzunaSearchSchema.parse(samplePage()),
        }),
    };

    let first: Awaited<ReturnType<typeof ingestAdzuna>> | null = null;
    let second: Awaited<ReturnType<typeof ingestAdzuna>> | null = null;
    let storedTitle: string | null = null;
    let storedState: string | null = null;
    let linkedToGeography = false;

    try {
      await database.value.$transaction(
        async (tx) => {
          first = await ingestAdzuna({
            db: tx,
            client: stubClient,
            maxRequests: 1,
            triggeredBy: 'test',
          });
          second = await ingestAdzuna({
            db: tx,
            client: stubClient,
            maxRequests: 1,
            triggeredBy: 'test',
          });

          // Scoped to this fixture's own identifier. The table holds real
          // ingested advertisements, so "the first adzuna job" is not this one.
          const stored = await tx.job.findFirst({
            where: { sourceKey: 'adzuna', sourceId: FIXTURE_SOURCE_ID },
            select: {
              title: true,
              descriptionIsExcerpt: true,
              location: { select: { stateCode: true, geographyId: true } },
            },
          });
          storedTitle = stored?.title ?? null;
          storedState = stored?.location?.stateCode ?? null;
          linkedToGeography = Boolean(stored?.location?.geographyId);

          throw new Rollback();
        },
        { timeout: 120_000, maxWait: 30_000 },
      );
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    const firstRun = first as Awaited<ReturnType<typeof ingestAdzuna>> | null;
    if (firstRun === null || !firstRun.ok) {
      throw new Error(
        `first ingest failed: ${firstRun === null ? 'not run' : firstRun.error.message}`,
      );
    }
    expect(firstRun.value.created).toBe(1);
    expect(firstRun.value.unchanged).toBe(0);
    expect(firstRun.value.quarantined).toBe(0);

    const secondRun = second as Awaited<ReturnType<typeof ingestAdzuna>> | null;
    if (secondRun === null || !secondRun.ok) throw new Error('second ingest failed');
    // The content hash means an unchanged advert costs a comparison, not a write.
    expect(secondRun.value.created).toBe(0);
    expect(secondRun.value.updated).toBe(0);
    expect(secondRun.value.unchanged).toBe(1);

    expect(storedTitle).toBe('Registered Nurse');
    // The provider's own hierarchy named a state, so it resolved to the ABS
    // registry loaded at milestone 04.
    expect(storedState).toBe('NSW');
    expect(linkedToGeography).toBe(true);

    // Rolled back: the fixture reached the constraints and not the database.
    // Asserted by identifier rather than by an empty table, because real
    // advertisements live alongside it.
    const remaining = await database.value.job.count({
      where: { sourceKey: 'adzuna', sourceId: FIXTURE_SOURCE_ID },
    });
    expect(remaining).toBe(0);
  }, 180_000);
});
