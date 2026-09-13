import { Prisma } from '@/db/generated/client/client';
import { getDatabase } from '@/db/client';
import { extractSkills } from '@/skills/extract';
import { skillVocabulary } from '@/skills/vocabulary';
import type { Failure } from '@/lib/errors';
import { ok, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';

/**
 * Reads every stored advertisement for the skills it names.
 *
 * The extraction itself is in `skills/`, which knows nothing about a database.
 * This is the part that knows: it reads listings out, asks that module what
 * each one says, and writes the difference.
 *
 * Idempotent, and cheap when there is nothing to do. A listing whose skills are
 * already exactly right costs one read and no write, so a second run reports
 * zero changes rather than rewriting the corpus. That property is the whole
 * reason the comparison below is done in memory rather than by deleting a
 * job's rows and reinserting them, which would be shorter, would look
 * identical from the outside, and would churn every row on every run.
 *
 * ## What this pass owns
 *
 * `JobSkill.method` distinguishes `DETERMINISTIC` from `MANUAL`, and this pass
 * owns only the first. A manually attached skill is never removed here, however
 * confident the extractor is that it does not belong: somebody put it there on
 * purpose, and a batch job silently reversing a human decision is the kind of
 * behaviour that makes people stop trusting the batch job. Manual rows are also
 * not re-derived, so a human attachment survives a vocabulary change.
 *
 * ## Why the vocabulary is synced first
 *
 * `Skill` rows mirror `skills/vocabulary.ts` exactly, including entries nothing
 * currently mentions. The alternative, creating a row the first time something
 * matches it, makes the taxonomy a function of whatever has been ingested so
 * far: the same vocabulary would produce different tables on two machines, and
 * "this skill has no listings" would be indistinguishable from "this skill is
 * not recognised". The vocabulary is the authority and the table follows it,
 * which is how the source registry works for the same reason.
 *
 * `contentHash` is left alone, exactly as the sponsorship reclassification and
 * the redaction sweep leave it alone. It hashes the provider's payload, not our
 * reading of it, and the payload has not changed.
 *
 * Expired and withdrawn listings are included. They are no longer shown and are
 * still held and still queried by the data quality checks, and a corpus whose
 * retired half disagrees with its live half about what a skill means is one
 * nobody can reason about.
 */

type Database = Prisma.TransactionClient;

/** Rows per pass. Bounded so a large catalogue does not arrive in one query. */
const BATCH_SIZE = 500;

export interface SkillExtractionSweep {
  readonly examined: number;
  /** Listings whose attachments changed. On a dry run, those that would. */
  readonly changed: number;
  /** Attachments added. On a dry run, those that would be. */
  readonly attached: number;
  /**
   * Attachments removed because the text no longer supports them.
   *
   * Non-zero only after a vocabulary change tightens a pattern, which is
   * exactly when it is worth seeing before it is applied.
   */
  readonly detached: number;
  /** Listings carrying at least one skill afterwards. */
  readonly withAnySkill: number;
  /** How the corpus reads afterwards, by skill. */
  readonly bySkill: Readonly<Record<string, number>>;
  readonly dryRun: boolean;
}

export interface SweepOptions {
  /**
   * Count without writing.
   *
   * The default, for the reason the sponsorship sweep defaults to it: this
   * decides what a reader can filter on, and a pattern change that quietly
   * moves a thousand listings is far easier to catch in a printed distribution
   * than in a database afterwards.
   */
  readonly dryRun?: boolean;
}

export async function extractStoredSkills(
  options: SweepOptions = {},
): Promise<Result<SkillExtractionSweep, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;
  const prisma = database.value;

  const dryRun = options.dryRun ?? false;

  // The taxonomy first, so every attachment below has a row to point at. Done
  // even on a dry run: it writes no attachment and leaves the corpus as it was,
  // and without it a dry run on a fresh database could not resolve a single id.
  const skillIds = await syncVocabulary(prisma);

  let examined = 0;
  let changed = 0;
  let attached = 0;
  let detached = 0;
  let withAnySkill = 0;
  const bySkill = new Map<string, number>();

  let cursor: string | undefined;

  for (;;) {
    const rows = await prisma.job.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        company: { select: { name: true } },
        skills: {
          select: { skillId: true, method: true, matchedText: true },
        },
      },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    });

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.id;

    for (const row of rows) {
      examined += 1;

      const matches = extractSkills({
        title: row.title,
        description: row.description,
        companyName: row.company?.name ?? null,
      });

      for (const match of matches) {
        bySkill.set(match.skill.name, (bySkill.get(match.skill.name) ?? 0) + 1);
      }
      if (matches.length > 0) withAnySkill += 1;

      // Only this pass's own rows are compared. Manual attachments are left
      // out of both sides, so they are neither removed nor counted as drift.
      const existing = new Map(
        row.skills
          .filter((link) => link.method === 'DETERMINISTIC')
          .map((link) => [link.skillId, link.matchedText]),
      );

      const wanted = new Map<string, string>();
      for (const match of matches) {
        const id = skillIds.get(match.skill.normalizedName);
        if (id !== undefined) wanted.set(id, match.matchedText);
      }

      const toAttach = [...wanted].filter(
        ([id, matchedText]) => !existing.has(id) || existing.get(id) !== matchedText,
      );
      const toDetach = [...existing.keys()].filter((id) => !wanted.has(id));

      if (toAttach.length === 0 && toDetach.length === 0) continue;

      changed += 1;
      // A row whose matched text moved is an update rather than an addition.
      // Counting it as attached would make the totals disagree with the table.
      attached += toAttach.filter(([id]) => !existing.has(id)).length;
      detached += toDetach.length;

      if (dryRun) continue;

      if (toDetach.length > 0) {
        await prisma.jobSkill.deleteMany({
          where: { jobId: row.id, skillId: { in: toDetach }, method: 'DETERMINISTIC' },
        });
      }

      for (const [skillId, matchedText] of toAttach) {
        await prisma.jobSkill.upsert({
          where: { jobId_skillId: { jobId: row.id, skillId } },
          create: { jobId: row.id, skillId, method: 'DETERMINISTIC', matchedText },
          update: { method: 'DETERMINISTIC', matchedText },
        });
      }
    }
  }

  logger.info(dryRun ? 'Skill extraction: dry run' : 'Skill extraction', {
    examined,
    changed,
    attached,
    detached,
    dryRun,
  });

  return ok({
    examined,
    changed,
    attached,
    detached,
    withAnySkill,
    bySkill: Object.fromEntries([...bySkill].sort(([, a], [, b]) => b - a)),
    dryRun,
  });
}

/**
 * Brings the `Skill` table into line with the vocabulary, and returns the ids.
 *
 * Upserted by `normalizedName`, which is the stable identity: renaming a skill
 * for readers updates the row rather than creating a second one and orphaning
 * every listing already attached to the first. That is why the vocabulary
 * carries an explicit key instead of deriving one from the display name.
 *
 * Rows not in the vocabulary are left alone rather than deleted. A skill
 * withdrawn from the vocabulary still has attachments pointing at it, and
 * cascading those away on the next unrelated run would destroy evidence
 * silently. `analytics/quality.ts` reports the orphan instead, which makes the
 * removal a decision somebody takes rather than a side effect.
 */
async function syncVocabulary(prisma: Database): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const skill of skillVocabulary) {
    const row = await prisma.skill.upsert({
      where: { normalizedName: skill.normalizedName },
      create: {
        name: skill.name,
        normalizedName: skill.normalizedName,
        kind: skill.kind,
      },
      update: { name: skill.name, kind: skill.kind },
      select: { id: true, normalizedName: true },
    });
    ids.set(row.normalizedName, row.id);
  }

  return ids;
}
