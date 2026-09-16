import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDatabase } from '@/db/client';
import { searchJobs } from '@/db/repositories/job';

/**
 * That every filter on a job search narrows, and that two filters narrow
 * together.
 *
 * This file exists because they did not. `searchJobs` built its `where` clause
 * by spreading each filter into one object literal, so two filters reaching
 * for the same key overwrote each other silently, last one written winning:
 *
 *   - `regional` and `location` both wrote `location`. Every place search on
 *     the jobs page therefore threw the area filter away. Since that page
 *     defaults to regional and prints "Showing advertisements in a designated
 *     regional area" above its results, a search for Brisbane returned 887
 *     listings under a heading asserting they were regional, each carrying its
 *     own label saying they were not.
 *   - `regional: 'UNKNOWN'` and `text` both wrote `OR`, so a keyword search
 *     within the unplaced listings quietly widened to the whole corpus.
 *
 * Neither produced an error, a warning or an empty page. The collision yields
 * a perfectly valid query returning plausible rows, which is why it survived
 * five milestones of a product whose entire premise is the filter it was
 * dropping. The fix was structural, an array of independent conditions, and
 * these tests are the part that stays.
 *
 * Fixtures rather than assertions about the real corpus. What is being proved
 * is a property of the query, and a property test that needs a Queensland
 * advertisement to exist is one that goes green for the wrong reason the day
 * the corpus changes.
 */

try {
  process.loadEnvFile('.env');
} catch {
  // No .env. The tests below will skip.
}

const hasDatabase = Boolean(process.env['DATABASE_URL']);
const withDatabase = describe.skipIf(!hasDatabase);

const TEST_SOURCE = 'test-filter-source';
const TEST_SKILL = 'test-only-skill-key';
const OTHER_SKILL = 'test-only-other-key';

function prisma() {
  const database = getDatabase();
  if (!database.ok) throw new Error('database not configured');
  return database.value;
}

async function cleanup() {
  const db = prisma();
  await db.$executeRawUnsafe(
    `DELETE FROM job_skill WHERE job_id IN (SELECT id FROM job WHERE source_key = $1)`,
    TEST_SOURCE,
  );
  await db.$executeRawUnsafe(`DELETE FROM job WHERE source_key = $1`, TEST_SOURCE);
  await db.$executeRawUnsafe(`DELETE FROM source WHERE key = $1`, TEST_SOURCE);
  await db.$executeRawUnsafe(
    `DELETE FROM skill WHERE normalized_name IN ($1, $2)`,
    TEST_SKILL,
    OTHER_SKILL,
  );
  await db.$executeRawUnsafe(
    `DELETE FROM location WHERE normalized_key LIKE 'test-filter-%'`,
  );
}

withDatabase('two filters narrow together', () => {
  beforeAll(async () => {
    await cleanup();
    const db = prisma();

    // Jobs carry a foreign key to the source registry, so the fixture source
    // has to exist before any listing can. Development-only and unverified,
    // which is what it is.
    await db.source.create({
      data: {
        key: TEST_SOURCE,
        displayName: 'Test filter source',
        kind: 'JOB_LISTING',
        activation: 'DEVELOPMENT_ONLY',
        complianceStatus: 'UNVERIFIED',
      },
    });

    /*
     * Three places sharing one searchable word, on the two sides of the
     * instrument and off it altogether. The shared word is what makes a
     * location search able to reach all three, which is the situation the
     * collision turned into a widened result.
     */
    const regional = await db.location.create({
      data: {
        rawText: 'Fixtureton Regional, QLD',
        normalizedKey: 'test-filter-regional',
        stateCode: 'QLD',
        postcode: '4870',
        regionalStatus: 'REGIONAL',
        regionalCategory: 'REGIONAL_CENTRE_OR_OTHER',
        regionalBasis: 'POSTCODE',
      },
    });
    const metro = await db.location.create({
      data: {
        rawText: 'Fixtureton Metro, QLD',
        normalizedKey: 'test-filter-metro',
        stateCode: 'QLD',
        postcode: '4000',
        regionalStatus: 'NOT_REGIONAL',
        regionalBasis: 'POSTCODE',
      },
    });

    const unsettled = await db.location.create({
      data: {
        rawText: 'Fixtureton Unsettled, QLD',
        normalizedKey: 'test-filter-unsettled',
        stateCode: 'QLD',
        regionalStatus: 'UNKNOWN',
        regionalBasis: 'NONE',
      },
    });

    const skill = await db.skill.create({
      data: { name: 'Fixture skill', normalizedName: TEST_SKILL, kind: 'CERTIFICATION' },
    });
    const other = await db.skill.create({
      data: { name: 'Other fixture skill', normalizedName: OTHER_SKILL, kind: 'TOOL' },
    });

    const common = {
      sourceKey: TEST_SOURCE,
      contentHash: 'fixture',
      title: 'Fixtureton probe officer',
      description: 'A fixture advertisement for the filter tests.',
      applyUrl: 'https://example.invalid/fixture',
    };

    await db.job.create({
      data: { ...common, sourceId: 'regional-1', locationId: regional.id },
    });
    await db.job.create({
      data: { ...common, sourceId: 'metro-1', locationId: metro.id },
    });
    await db.job.create({
      data: { ...common, sourceId: 'unsettled-1', locationId: unsettled.id },
    });
    // No location at all, which is the second way a listing is unplaced and
    // the one a relation-only filter silently drops.
    await db.job.create({ data: { ...common, sourceId: 'unplaced-1' } });

    // The skill sits on the metropolitan listing on purpose, so a regional
    // search for it has to come back empty rather than finding it anyway.
    await db.jobSkill.create({
      data: {
        job: {
          connect: {
            sourceKey_sourceId: { sourceKey: TEST_SOURCE, sourceId: 'metro-1' },
          },
        },
        skill: { connect: { id: skill.id } },
        matchedText: 'fixture wording',
      },
    });
    await db.jobSkill.create({
      data: {
        job: {
          connect: {
            sourceKey_sourceId: { sourceKey: TEST_SOURCE, sourceId: 'regional-1' },
          },
        },
        skill: { connect: { id: other.id } },
        matchedText: 'other fixture wording',
      },
    });
  });

  afterAll(cleanup);

  async function fixtures(query: Parameters<typeof searchJobs>[0]) {
    const result = await searchJobs({ ...query, pageSize: 50 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('search failed');
    return result.value.jobs.filter((job) => job.sourceKey === TEST_SOURCE);
  }

  it('keeps the area filter when a place is also searched for', async () => {
    const jobs = await fixtures({ regional: 'REGIONAL', location: 'Fixtureton' });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.locationLabel).toBe('Fixtureton Regional, QLD');
    expect(jobs.every((job) => job.place.status === 'REGIONAL')).toBe(true);
  });

  it('does not let a place search widen a regional search', async () => {
    /*
     * The shape of the original bug, stated as a comparison: filtering by
     * place as well as by area must return no more than filtering by place
     * alone, and here strictly fewer. Before the fix these two were equal.
     */
    const both = await fixtures({ regional: 'REGIONAL', location: 'Fixtureton' });
    const placeOnly = await fixtures({ location: 'Fixtureton' });

    expect(placeOnly.length).toBe(3);
    expect(both.length).toBeLessThan(placeOnly.length);
  });

  it('keeps the unplaced filter when a keyword is also searched for', async () => {
    /*
     * The second collision. `regional: 'UNKNOWN'` and `text` both wrote `OR`,
     * so this query used to return the regional and metropolitan fixtures too.
     */
    const jobs = await fixtures({ regional: 'UNKNOWN', text: 'Fixtureton probe' });

    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.place.status === 'UNKNOWN')).toBe(true);
  });

  it('reaches both kinds of unplaced listing at once', async () => {
    /*
     * A listing is unplaced either because the place it resolved to could not
     * be settled, or because it resolved to no place at all. Filtering only
     * through the relation drops the second kind, which is the group most in
     * need of being visible.
     */
    const jobs = await fixtures({ regional: 'UNKNOWN', text: 'Fixtureton probe' });

    expect(new Set(jobs.map((job) => job.locationLabel))).toEqual(
      new Set([null, 'Fixtureton Unsettled, QLD']),
    );
  });

  it('narrows to advertisements whose text named the skill', async () => {
    const jobs = await fixtures({ skill: TEST_SKILL });

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.locationLabel).toBe('Fixtureton Metro, QLD');
    expect(jobs[0]?.skills.map((skill) => skill.normalizedName)).toEqual([TEST_SKILL]);
  });

  it('applies the skill filter and the area filter together', async () => {
    /*
     * The skill sits on the metropolitan listing, so a regional search for it
     * has nothing to return. A collision here would have handed back the
     * metropolitan job under a regional heading, which is exactly what the
     * place filter was doing before this was restructured.
     */
    expect(await fixtures({ regional: 'REGIONAL', skill: TEST_SKILL })).toHaveLength(0);
    expect(await fixtures({ regional: 'NOT_REGIONAL', skill: TEST_SKILL })).toHaveLength(
      1,
    );
  });

  it('carries every attachment onto the listing, with its wording', async () => {
    const jobs = await fixtures({ skill: OTHER_SKILL });

    expect(jobs[0]?.skills).toEqual([
      {
        name: 'Other fixture skill',
        normalizedName: OTHER_SKILL,
        kind: 'TOOL',
        matchedText: 'other fixture wording',
      },
    ]);
  });

  it('gives a listing that names nothing an empty list, never null', async () => {
    const jobs = await fixtures({ regional: 'UNKNOWN', text: 'Fixtureton probe' });
    expect(jobs).not.toHaveLength(0);
    expect(jobs.every((job) => job.skills.length === 0)).toBe(true);
  });
});
