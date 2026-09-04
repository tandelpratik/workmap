import { describe, expect, it } from 'vitest';
import {
  canonicalUrlKey,
  candidateKeys,
  groupDuplicates,
  normalizeTitle,
  type DuplicateCandidate,
} from '@/domain/duplicate';
import { deduplicateJobs } from '@/ingestion/deduplicate';
import { getDatabase } from '@/db/client';

/**
 * Duplicate detection.
 *
 * The tests are written around the asymmetry of the mistakes. A missed
 * duplicate shows a reader the same job twice, which is untidy. A wrong merge
 * hides a real vacancy behind an unrelated one, which is a job somebody does
 * not find. So the false-positive cases below are the important half, and they
 * are written first.
 */

const base: DuplicateCandidate = {
  id: 'a1',
  sourceKey: 'adzuna',
  title: 'Registered Nurse',
  companyKey: 'queensland health',
  locationKey: 'cairns-region',
  applyUrl: null,
  sourceUrl: null,
  hasDescription: true,
  postedAt: new Date('2026-09-01T00:00:00.000Z'),
};

const candidate = (overrides: Partial<DuplicateCandidate>): DuplicateCandidate => ({
  ...base,
  ...overrides,
});

describe('what must never be merged', () => {
  it('leaves two listings from the same source apart', () => {
    // An employer advertising three identical positions is publishing three
    // vacancies. Merging them would delete two real jobs from the product.
    const groups = groupDuplicates([
      candidate({ id: 'a1', sourceKey: 'adzuna' }),
      candidate({ id: 'a2', sourceKey: 'adzuna' }),
      candidate({ id: 'a3', sourceKey: 'adzuna' }),
    ]);

    expect(groups).toEqual([]);
  });

  it('does not merge different employers advertising the same role', () => {
    const groups = groupDuplicates([
      candidate({ id: 'a1', sourceKey: 'adzuna', companyKey: 'queensland health' }),
      candidate({ id: 'q1', sourceKey: 'smartjobs-qld', companyKey: 'mater hospital' }),
    ]);

    expect(groups).toEqual([]);
  });

  it('does not merge across seniority', () => {
    // The trap a keen normaliser falls into. "Senior" is not noise, and a
    // reader searching for the senior role must still find it.
    const groups = groupDuplicates([
      candidate({ id: 'a1', sourceKey: 'adzuna', title: 'Registered Nurse' }),
      candidate({
        id: 'q1',
        sourceKey: 'smartjobs-qld',
        title: 'Senior Registered Nurse',
      }),
    ]);

    expect(groups).toEqual([]);
  });

  it('refuses to match on a gap that two listings happen to share', () => {
    // Both are missing an employer. That is not something in common: it
    // describes a great many unrelated vacancies.
    const groups = groupDuplicates([
      candidate({ id: 'a1', sourceKey: 'adzuna', companyKey: null }),
      candidate({ id: 'q1', sourceKey: 'smartjobs-qld', companyKey: null }),
    ]);

    expect(groups).toEqual([]);
  });

  it('does not match on an unusable URL', () => {
    // Two listings whose links could not be parsed must not both fall into a
    // bucket of unparseable links.
    expect(canonicalUrlKey('not a url')).toBeNull();
    expect(canonicalUrlKey('javascript:alert(1)')).toBeNull();
    expect(canonicalUrlKey('')).toBeNull();

    const groups = groupDuplicates([
      candidate({ id: 'a1', sourceKey: 'adzuna', companyKey: null, applyUrl: 'nope' }),
      candidate({
        id: 'q1',
        sourceKey: 'smartjobs-qld',
        companyKey: null,
        applyUrl: 'also nope',
      }),
    ]);

    expect(groups).toEqual([]);
  });
});

describe('what must be merged', () => {
  it('matches the same advertisement behind different tracking parameters', () => {
    const groups = groupDuplicates([
      candidate({
        id: 'a1',
        sourceKey: 'adzuna',
        applyUrl: 'https://www.smartjobs.qld.gov.au/jobs/QLD-164089?utm_source=adzuna',
      }),
      candidate({
        id: 'q1',
        sourceKey: 'smartjobs-qld',
        applyUrl: 'http://smartjobs.qld.gov.au/jobs/QLD-164089/',
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.confidence).toBe('CANONICAL_URL');
    expect([...groups[0]!.memberIds].sort()).toEqual(['a1', 'q1']);
    expect(groups[0]!.signature).toBe('url:smartjobs.qld.gov.au/jobs/QLD-164089');
  });

  it('matches on employer, role and place together', () => {
    const groups = groupDuplicates([
      candidate({ id: 'a1', sourceKey: 'adzuna', title: 'Registered  Nurse!' }),
      candidate({ id: 'q1', sourceKey: 'smartjobs-qld', title: 'REGISTERED NURSE' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.confidence).toBe('IDENTITY_TRIPLE');
    expect(groups[0]!.memberIds).toHaveLength(2);
  });

  it('normalises a title without discarding its words', () => {
    expect(normalizeTitle('Registered  Nurse!')).toBe('registered nurse');
    expect(normalizeTitle('Senior Registered Nurse')).not.toBe(
      normalizeTitle('Registered Nurse'),
    );
  });
});

describe('choosing which listing represents a group', () => {
  it('prefers a listing a reader can actually read', () => {
    const groups = groupDuplicates([
      candidate({ id: 'a1', sourceKey: 'adzuna', hasDescription: false }),
      candidate({ id: 'q1', sourceKey: 'smartjobs-qld', hasDescription: true }),
    ]);

    expect(groups[0]!.canonicalId).toBe('q1');
    // The canonical member is listed first, so a caller need not re-sort.
    expect(groups[0]!.memberIds[0]).toBe('q1');
  });

  it('prefers the earliest posting when both can be read', () => {
    const groups = groupDuplicates([
      candidate({
        id: 'a1',
        sourceKey: 'adzuna',
        postedAt: new Date('2026-09-03T00:00:00.000Z'),
      }),
      candidate({
        id: 'q1',
        sourceKey: 'smartjobs-qld',
        postedAt: new Date('2026-09-01T00:00:00.000Z'),
      }),
    ]);

    expect(groups[0]!.canonicalId).toBe('q1');
  });

  it('gives the same answer whatever order the listings arrive in', () => {
    // Grouping runs on every ingest. A canonical choice that drifted with the
    // order rows came back in would rewrite the product's front page for no
    // reason at all.
    const one = candidate({ id: 'a1', sourceKey: 'adzuna' });
    const two = candidate({ id: 'q1', sourceKey: 'smartjobs-qld' });

    const forwards = groupDuplicates([one, two]);
    const backwards = groupDuplicates([two, one]);

    expect(forwards).toEqual(backwards);
  });
});

describe('keys from raw source values', () => {
  it('treats an empty name or location as absent, not as a key', () => {
    expect(candidateKeys({ companyName: '', locationText: '   ' })).toEqual({
      companyKey: null,
      locationKey: null,
    });
  });

  it('derives the keys the rest of the system already uses', () => {
    expect(
      candidateKeys({ companyName: 'Queensland Health', locationText: 'Cairns region' }),
    ).toEqual({ companyKey: 'queensland health', locationKey: 'cairns-region' });
  });
});

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Database sections skip.
}

const withDatabase = describe.skipIf(!process.env['DATABASE_URL']);

class Rollback extends Error {}

withDatabase('grouping duplicates in the database', () => {
  it('hides the duplicate from search and keeps its record intact', async () => {
    const database = getDatabase();
    if (!database.ok) throw new Error('no database');

    let outcome: Awaited<ReturnType<typeof deduplicateJobs>> | null = null;
    let repeat: Awaited<ReturnType<typeof deduplicateJobs>> | null = null;
    let canonicalVisible = false;
    let duplicateHidden = false;
    let duplicateStillStored = false;
    let sharedGroup = false;
    let releasedIsVisibleAgain = false;

    try {
      await database.value.$transaction(
        async (tx) => {
          // Two listings for one vacancy, from two sources, sharing an apply
          // URL. Written directly because the point under test is the grouping,
          // not the importers that would normally produce these rows.
          const company = await tx.company.create({
            data: { name: 'Fixture Health', normalizedName: 'fixture health dedupe' },
            select: { id: true },
          });

          const shared = {
            companyId: company.id,
            title: 'Fixture Registered Nurse',
            applyUrl: 'https://example.test/vacancies/FIXTURE-1',
            status: 'ACTIVE' as const,
            isSynthetic: false,
            lastSeenAt: new Date(),
            retrievedAt: new Date(),
          };

          const first = await tx.job.create({
            data: {
              ...shared,
              sourceKey: 'adzuna',
              sourceId: 'dedupe-fixture-adzuna',
              description: 'Full text of the advertisement.',
              contentHash: 'dedupe-fixture-hash-1',
              postedAt: new Date('2026-09-02T00:00:00.000Z'),
            },
            select: { id: true },
          });

          const second = await tx.job.create({
            data: {
              ...shared,
              sourceKey: 'smartjobs-qld',
              sourceId: 'dedupe-fixture-qld',
              description: 'Full text of the advertisement.',
              contentHash: 'dedupe-fixture-hash-2',
              postedAt: new Date('2026-09-01T00:00:00.000Z'),
            },
            select: { id: true },
          });

          outcome = await deduplicateJobs({ db: tx });
          repeat = await deduplicateJobs({ db: tx });

          const rows = await tx.job.findMany({
            where: { id: { in: [first.id, second.id] } },
            select: {
              id: true,
              sourceKey: true,
              isCanonical: true,
              duplicateGroupId: true,
              description: true,
            },
          });

          const adzuna = rows.find((row) => row.sourceKey === 'adzuna');
          const qld = rows.find((row) => row.sourceKey === 'smartjobs-qld');

          // The earlier posting represents the pair, both being readable.
          canonicalVisible = qld?.isCanonical === true;
          duplicateHidden = adzuna?.isCanonical === false;
          // The hidden one is still a full record, not a tombstone.
          duplicateStillStored = adzuna?.description !== null;
          sharedGroup =
            adzuna?.duplicateGroupId !== null &&
            adzuna?.duplicateGroupId === qld?.duplicateGroupId;

          // Break the match and the grouping must be withdrawn, not remembered.
          await tx.job.update({
            where: { id: first.id },
            data: { applyUrl: 'https://example.test/vacancies/SOMETHING-ELSE' },
          });
          await deduplicateJobs({ db: tx });

          const released = await tx.job.findUnique({
            where: { id: first.id },
            select: { isCanonical: true, duplicateGroupId: true },
          });
          releasedIsVisibleAgain =
            released?.isCanonical === true && released.duplicateGroupId === null;

          throw new Rollback();
        },
        { timeout: 120_000, maxWait: 30_000 },
      );
    } catch (error) {
      if (!(error instanceof Rollback)) throw error;
    }

    const run = outcome as Awaited<ReturnType<typeof deduplicateJobs>> | null;
    if (run === null || !run.ok) throw new Error('grouping failed');

    expect(run.value.groups).toBeGreaterThanOrEqual(1);
    expect(run.value.byConfidence['CANONICAL_URL']).toBeGreaterThanOrEqual(1);

    expect(canonicalVisible).toBe(true);
    expect(duplicateHidden).toBe(true);
    expect(duplicateStillStored).toBe(true);
    expect(sharedGroup).toBe(true);

    // Running twice must not create a second group for the same vacancy.
    const second = repeat as Awaited<ReturnType<typeof deduplicateJobs>> | null;
    if (second === null || !second.ok) throw new Error('second grouping failed');
    expect(second.value.groups).toBe(run.value.groups);
    expect(second.value.ungrouped).toBe(0);

    expect(releasedIsVisibleAgain).toBe(true);
  }, 180_000);
});
