import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDatabase } from '@/db/client';
import { sourceDescriptors } from '@/config/sources';

/**
 * Database tests.
 *
 * These run against a real PostgreSQL instance and are skipped when none is
 * configured, so the suite stays green without a database. Environment loading
 * is explicit here rather than global, so the unit tests stay pure.
 *
 * Several tests insert through raw SQL instead of the Prisma client. That is
 * deliberate: the point is to prove the database itself rejects bad data. Going
 * through the typed client would only prove TypeScript rejects it, which says
 * nothing about what a future raw query or a different service could write.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. The tests below will skip.
}

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const withDatabase = describe.skipIf(!hasDatabase);

const TEST_SOURCE = 'test-fixture-source';
const TEST_EDITION = 'TEST-EDITION';

function prisma() {
  const database = getDatabase();
  if (!database.ok) throw new Error('database not configured');
  return database.value;
}

async function cleanup() {
  const db = prisma();
  // Reverse dependency order.
  await db.$executeRawUnsafe(
    `DELETE FROM ingestion_error WHERE source_key = $1`,
    TEST_SOURCE,
  );
  await db.$executeRawUnsafe(
    `DELETE FROM ingestion_run WHERE source_key = $1`,
    TEST_SOURCE,
  );
  await db.$executeRawUnsafe(`DELETE FROM job WHERE source_key = $1`, TEST_SOURCE);
  await db.$executeRawUnsafe(
    `DELETE FROM geography_metric WHERE source_key = $1`,
    TEST_SOURCE,
  );
  await db.$executeRawUnsafe(
    `DELETE FROM labour_market_metric WHERE series_id IN (SELECT id FROM labour_market_series WHERE source_key = $1)`,
    TEST_SOURCE,
  );
  await db.$executeRawUnsafe(
    `DELETE FROM labour_market_series WHERE source_key = $1`,
    TEST_SOURCE,
  );
  await db.$executeRawUnsafe(`DELETE FROM geography WHERE source_key = $1`, TEST_SOURCE);
  await db.$executeRawUnsafe(`DELETE FROM source WHERE key = $1`, TEST_SOURCE);
}

withDatabase('schema safety mechanisms', () => {
  let geographyId: string;

  beforeAll(async () => {
    await cleanup();
    const db = prisma();

    await db.source.create({
      data: {
        key: TEST_SOURCE,
        displayName: 'Test fixture source',
        kind: 'JOB_LISTING',
        activation: 'DEVELOPMENT_ONLY',
        complianceStatus: 'UNVERIFIED',
      },
    });

    const geography = await db.geography.create({
      data: {
        code: 'TEST-1',
        name: 'Test Region',
        level: 'SA4',
        asgsEdition: TEST_EDITION,
        sourceKey: TEST_SOURCE,
      },
    });
    geographyId = geography.id;
  });

  afterAll(cleanup);

  describe('job idempotency (ADR-0005)', () => {
    it('rejects a second row with the same source identifier', async () => {
      const db = prisma();
      const base = {
        sourceKey: TEST_SOURCE,
        sourceId: 'dup-1',
        contentHash: 'hash-a',
        title: 'Analyst',
        applyUrl: 'https://example.invalid/1',
      };

      await db.job.create({ data: base });
      // The same listing seen again must collide, which is what makes an
      // upsert safe and a blind insert impossible.
      await expect(
        db.job.create({ data: { ...base, contentHash: 'hash-b' } }),
      ).rejects.toThrow();
    });
  });

  describe('synthetic containment (ADR-0009)', () => {
    it('defaults is_synthetic to false, so a forgotten field means real', async () => {
      const db = prisma();
      const job = await db.job.create({
        data: {
          sourceKey: TEST_SOURCE,
          sourceId: 'default-check',
          contentHash: 'h',
          title: 'Analyst',
          applyUrl: 'https://example.invalid/2',
        },
      });
      expect(job.isSynthetic).toBe(false);
      expect(job.syntheticFixtureVersion).toBeNull();
    });

    it('rejects a synthetic row that does not name its fixture', async () => {
      const db = prisma();
      await expect(
        db.$executeRawUnsafe(
          `INSERT INTO job (id, source_key, source_id, content_hash, is_synthetic, title, apply_url, updated_at)
           VALUES ('t-sc-1', $1, 'sc-1', 'h', true, 'Analyst', 'https://example.invalid/3', now())`,
          TEST_SOURCE,
        ),
      ).rejects.toThrow();
    });

    it('rejects a real row that claims a fixture version', async () => {
      const db = prisma();
      await expect(
        db.$executeRawUnsafe(
          `INSERT INTO job (id, source_key, source_id, content_hash, is_synthetic, synthetic_fixture_version, title, apply_url, updated_at)
           VALUES ('t-sc-2', $1, 'sc-2', 'h', false, 'v1', 'Analyst', 'https://example.invalid/4', now())`,
          TEST_SOURCE,
        ),
      ).rejects.toThrow();
    });

    it('excludes synthetic rows from the job_real view', async () => {
      const db = prisma();
      await db.job.create({
        data: {
          sourceKey: TEST_SOURCE,
          sourceId: 'synthetic-1',
          contentHash: 'h',
          title: 'Synthetic Analyst',
          applyUrl: 'https://example.invalid/5',
          isSynthetic: true,
          syntheticFixtureVersion: 'test-v1',
        },
      });

      const inTable = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM job WHERE source_key = $1 AND is_synthetic = true`,
        TEST_SOURCE,
      );
      const inView = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM job_real WHERE source_key = $1 AND is_synthetic = true`,
        TEST_SOURCE,
      );

      expect(Number(inTable[0]?.n)).toBeGreaterThan(0);
      // Analytics read the view, so a summary can never include a fixture.
      expect(Number(inView[0]?.n)).toBe(0);
    });
  });

  describe('salary honesty', () => {
    it('rejects an inverted salary range', async () => {
      const db = prisma();
      await expect(
        db.job.create({
          data: {
            sourceKey: TEST_SOURCE,
            sourceId: 'sal-1',
            contentHash: 'h',
            title: 'Analyst',
            applyUrl: 'https://example.invalid/6',
            salaryMin: 200000,
            salaryMax: 100000,
            salaryBasis: 'REPORTED',
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects a salary that does not say whether it was reported or estimated', async () => {
      const db = prisma();
      await expect(
        db.job.create({
          data: {
            sourceKey: TEST_SOURCE,
            sourceId: 'sal-2',
            contentHash: 'h',
            title: 'Analyst',
            applyUrl: 'https://example.invalid/7',
            salaryMin: 100000,
            salaryMax: 120000,
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('missing data never becomes zero (ADR-0002)', () => {
    let seriesId: string;

    beforeAll(async () => {
      const db = prisma();
      const series = await db.labourMarketSeries.create({
        data: {
          sourceKey: TEST_SOURCE,
          dataset: 'Test dataset',
          measure: 'Test measure',
          unit: 'advertisements',
          basis: 'OFFICIAL',
          granularity: 'MONTH',
          seriesKey: 'test-series-1',
        },
      });
      seriesId = series.id;
    });

    it('rejects PRESENT with no value', async () => {
      const db = prisma();
      await expect(
        db.labourMarketMetric.create({
          data: { seriesId, periodStart: new Date('2026-01-01'), valueState: 'PRESENT' },
        }),
      ).rejects.toThrow();
    });

    it('rejects UNAVAILABLE carrying a value', async () => {
      const db = prisma();
      await expect(
        db.labourMarketMetric.create({
          data: {
            seriesId,
            periodStart: new Date('2026-02-01'),
            valueState: 'UNAVAILABLE',
            value: 0,
          },
        }),
      ).rejects.toThrow();
    });

    it('rejects ZERO carrying a non-zero value', async () => {
      const db = prisma();
      await expect(
        db.labourMarketMetric.create({
          data: {
            seriesId,
            periodStart: new Date('2026-03-01'),
            valueState: 'ZERO',
            value: 5,
          },
        }),
      ).rejects.toThrow();
    });

    it('accepts a genuine measurement and a genuine zero', async () => {
      const db = prisma();
      const present = await db.labourMarketMetric.create({
        data: {
          seriesId,
          periodStart: new Date('2026-04-01'),
          valueState: 'PRESENT',
          value: 1234,
        },
      });
      const zero = await db.labourMarketMetric.create({
        data: {
          seriesId,
          periodStart: new Date('2026-05-01'),
          valueState: 'ZERO',
          value: 0,
        },
      });

      expect(Number(present.value)).toBe(1234);
      expect(Number(zero.value)).toBe(0);
    });

    it('accepts suppression with no value', async () => {
      const db = prisma();
      const suppressed = await db.labourMarketMetric.create({
        data: { seriesId, periodStart: new Date('2026-06-01'), valueState: 'SUPPRESSED' },
      });
      expect(suppressed.value).toBeNull();
    });
  });

  describe('geography metric uniqueness', () => {
    it('prevents duplicate all-occupation rows despite the null occupation', async () => {
      const db = prisma();
      const row = {
        geographyId,
        sourceKey: TEST_SOURCE,
        measure: 'Online job advertisements',
        basis: 'OFFICIAL' as const,
        periodStart: new Date('2026-07-01'),
        granularity: 'MONTH' as const,
        valueState: 'PRESENT' as const,
        value: 100,
      };

      await db.geographyMetric.create({ data: row });
      // Postgres treats NULLs as distinct, so the generated unique index does
      // not cover this case. A partial index added in the migration does.
      await expect(db.geographyMetric.create({ data: row })).rejects.toThrow();
    });

    it('keeps official and derived figures as separate rows', async () => {
      const db = prisma();
      const base = {
        geographyId,
        sourceKey: TEST_SOURCE,
        measure: 'Listing count',
        periodStart: new Date('2026-08-01'),
        granularity: 'MONTH' as const,
        valueState: 'PRESENT' as const,
        value: 10,
      };

      // The two lineages must never collapse into one number (ADR-0002).
      await db.geographyMetric.create({ data: { ...base, basis: 'OFFICIAL' } });
      await expect(
        db.geographyMetric.create({ data: { ...base, basis: 'DERIVED' } }),
      ).resolves.toBeTruthy();
    });
  });

  describe('ingestion run concurrency (ADR-0005)', () => {
    it('permits only one running import per source and dataset', async () => {
      const db = prisma();
      await db.ingestionRun.create({
        data: { sourceKey: TEST_SOURCE, dataset: 'concurrency', status: 'RUNNING' },
      });

      // An overlapping cron firing must become a no-op, not a double import.
      await expect(
        db.ingestionRun.create({
          data: { sourceKey: TEST_SOURCE, dataset: 'concurrency', status: 'RUNNING' },
        }),
      ).rejects.toThrow();
    });

    it('allows many completed runs for the same dataset', async () => {
      const db = prisma();
      await db.ingestionRun.create({
        data: { sourceKey: TEST_SOURCE, dataset: 'history', status: 'COMPLETED' },
      });
      await expect(
        db.ingestionRun.create({
          data: { sourceKey: TEST_SOURCE, dataset: 'history', status: 'COMPLETED' },
        }),
      ).resolves.toBeTruthy();
    });

    it('starts every counter at zero', async () => {
      const db = prisma();
      const run = await db.ingestionRun.create({
        data: { sourceKey: TEST_SOURCE, dataset: 'counters' },
      });
      expect(run.status).toBe('PENDING');
      expect(run.recordsSeen).toBe(0);
      expect(run.recordsQuarantined).toBe(0);
      expect(run.cursor).toBeNull();
    });
  });
});

withDatabase('seeded source registry', () => {
  it('contains every source declared in code', async () => {
    const db = prisma();
    const rows = await db.source.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row]));

    for (const descriptor of sourceDescriptors) {
      const row = byKey.get(descriptor.key);
      expect(
        row,
        `source "${descriptor.key}" is missing from the database`,
      ).toBeDefined();
      // Code and database must not disagree about whether a source may be used.
      expect(row?.activation).toBe(descriptor.activation);
      expect(row?.complianceStatus).toBe(descriptor.complianceStatus);
    }
  });

  it('has no source marked production eligible yet', async () => {
    const db = prisma();
    const eligible = await db.source.findMany({
      where: { activation: 'ACTIVE', complianceStatus: 'VERIFIED' },
    });
    // No licence has been read. Anything here would be a compliance failure.
    expect(eligible).toEqual([]);
  });
});
