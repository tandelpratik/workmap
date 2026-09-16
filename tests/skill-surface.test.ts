import { describe, expect, it } from 'vitest';
import { compareSkills, skillVocabulary } from '@/skills/vocabulary';
import { quotationAddsSomething } from '@/components/skill-note';

/**
 * The reader-facing half of skill extraction: the order skills are shown in,
 * and the rule deciding whether the advertisement's own words are worth
 * printing beside the label we chose for them.
 *
 * Both are small, and both are shared by three surfaces. The order is used by
 * the repository, the listing lines and the filter control, so a bug in it
 * shows up as three surfaces disagreeing about a question no reader asked. The
 * quotation rule decides whether a reader can check our reading against the
 * employer's wording, which is the whole basis on which a skill line is
 * allowed to make a claim at all.
 */

describe('the order skills are shown in', () => {
  it('follows the vocabulary rather than the alphabet', () => {
    const shuffled = [...skillVocabulary].reverse();
    const sorted = [...shuffled].sort(compareSkills);
    expect(sorted.map((skill) => skill.normalizedName)).toEqual(
      skillVocabulary.map((skill) => skill.normalizedName),
    );
  });

  it('puts credentials before tools, which is not alphabetical', () => {
    const sorted = [
      { normalizedName: 'sql', name: 'SQL' },
      { normalizedName: 'ahpra-registration', name: 'AHPRA registration' },
      { normalizedName: 'microsoft-excel', name: 'Microsoft Excel' },
    ].sort(compareSkills);

    expect(sorted.map((skill) => skill.normalizedName)).toEqual([
      'ahpra-registration',
      'microsoft-excel',
      'sql',
    ]);
  });

  it('sorts a withdrawn entry last rather than first', () => {
    /*
     * The failure this guards against is specific. Looking a key up in a
     * position map and defaulting a miss to -1, or to 0, puts every attachment
     * whose vocabulary entry has been retired at the head of every list. Those
     * rows are kept on purpose (the extraction pass reports them instead of
     * cascading them away), so the wrong default would promote exactly the
     * entries the product can no longer explain.
     */
    const sorted = [
      { normalizedName: 'no-longer-recognised', name: 'Something withdrawn' },
      { normalizedName: 'sql', name: 'SQL' },
      { normalizedName: 'ahpra-registration', name: 'AHPRA registration' },
    ].sort(compareSkills);

    expect(sorted.at(-1)?.normalizedName).toBe('no-longer-recognised');
    expect(sorted[0]?.normalizedName).toBe('ahpra-registration');
  });

  it('breaks a tie between two unknown entries by name', () => {
    const sorted = [
      { normalizedName: 'gone-b', name: 'Zebra' },
      { normalizedName: 'gone-a', name: 'Aardvark' },
    ].sort(compareSkills);

    expect(sorted.map((skill) => skill.name)).toEqual(['Aardvark', 'Zebra']);
  });

  it('is stable enough to give the same answer twice', () => {
    const once = [...skillVocabulary].sort(compareSkills);
    const twice = [...once].sort(compareSkills);
    expect(twice.map((skill) => skill.normalizedName)).toEqual(
      once.map((skill) => skill.normalizedName),
    );
  });
});

describe('whether to quote the advertisement beside the label', () => {
  it('quotes wording the label does not already contain', () => {
    expect(
      quotationAddsSomething({ name: 'AHPRA registration', matchedText: 'AHPRA' }),
    ).toBe(true);
    expect(
      quotationAddsSomething({
        name: 'Working with Children Check',
        matchedText: 'blue card',
      }),
    ).toBe(true);
    expect(
      quotationAddsSomething({
        name: "Driver's licence",
        matchedText: "C class driver's licence",
      }),
    ).toBe(true);
  });

  it('does not print the same string twice', () => {
    expect(
      quotationAddsSomething({
        name: 'Working with Children Check',
        matchedText: 'Working with Children Check',
      }),
    ).toBe(false);
  });

  it('treats a shouting source as the same words, not different ones', () => {
    /*
     * "FIRST AID CERTIFICATE" under "First aid certificate" tells a reader
     * nothing except that an employer used capitals. Case and run-together
     * whitespace are the two differences that carry no meaning.
     */
    expect(
      quotationAddsSomething({
        name: 'First aid certificate',
        matchedText: 'FIRST AID CERTIFICATE',
      }),
    ).toBe(false);
    expect(
      quotationAddsSomething({
        name: 'First aid certificate',
        matchedText: '  First  aid\ncertificate ',
      }),
    ).toBe(false);
  });

  it('prints nothing where there is nothing to print', () => {
    expect(quotationAddsSomething({ name: 'SQL', matchedText: null })).toBe(false);
    expect(quotationAddsSomething({ name: 'SQL', matchedText: '   ' })).toBe(false);
  });
});
