import { extractStoredSkills } from '@/ingestion/extract-skills';

/**
 * Reads every stored advertisement for the skills it names.
 *
 *   npm run skills:extract                counts, and writes no attachment
 *   npm run skills:extract -- --apply     writes them
 *
 * Run it once after deploying a change to `skills/vocabulary.ts`. Nothing else
 * populates these rows yet: ingestion does not call the extractor, because a
 * listing arrives before anyone has decided the vocabulary is right for it, and
 * a pattern that turns out to be wrong is far cheaper to fix in one pass than
 * in a hook that has already run on every import.
 *
 * The default is the dry run because this decides what a reader can filter on.
 * The dry run prints the distribution it would produce, and the shape of that
 * distribution is known: a pattern change that quietly moves a few hundred
 * listings shows up there as a number that looks wrong, and nowhere else.
 *
 * `detached` is the number to watch after tightening a pattern. It counts
 * attachments the text no longer supports, which is the intended effect of a
 * tightening and an alarming thing to discover afterwards.
 *
 * Safe to repeat. A listing whose skills are already right is not written.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env. Variables may come from the shell or the platform.
}

const dryRun = !process.argv.includes('--apply');

void extractStoredSkills({ dryRun })
  .then((result) => {
    if (!result.ok) {
      console.error(`${result.error.code}: ${result.error.message}`);
      process.exit(1);
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          level: 'info',
          message: dryRun
            ? 'Skill extraction: dry run, no attachment written'
            : 'Skill extraction complete',
          ...result.value,
        },
        null,
        2,
      ),
    );
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
