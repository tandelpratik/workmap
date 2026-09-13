import { normalizeCompanyName } from '@/domain/job';
import { plainText, sentenceAt } from '@/domain/text';
import { skillVocabulary, type SkillDefinition } from './vocabulary';

/**
 * Reading an advertisement for the skills it names.
 *
 * Deterministic, and the rule this module exists to enforce is that **a skill
 * is never attached to a listing that does not mention it**. There is no
 * inference from job title, no expansion from an occupation, no "roles like
 * this usually want". Every attachment carries the text that produced it, and
 * a reader can be shown the sentence the employer wrote.
 *
 * That is the same discipline the sponsorship detector follows, and it is here
 * for a stronger reason. A wrongly attached sponsorship label misrepresents an
 * employer; a wrongly attached skill quietly filters a real job out of a real
 * person's search, or puts one in front of them that they cannot do. Both
 * failures are silent, and the second is invisible even to us.
 *
 * ## What it does not do
 *
 * It does not decide whether the skill is required or merely desirable.
 * Advertisements are not consistent enough to support the distinction: the
 * corpus has mandatory requirements under a heading called "Highly Desirable"
 * and desirable ones in a list called "Your mandatory requirements". Attaching
 * the skill and quoting the sentence lets a reader judge, which is the same
 * settlement the sponsorship module reached for the same reason.
 *
 * It does not rank, weight or score. A skill is mentioned or it is not.
 */

/** One skill found in one advertisement, with the evidence for it. */
export interface SkillMatch {
  /** The vocabulary entry that matched. */
  readonly skill: SkillDefinition;

  /**
   * The words that matched, exactly as the advertisement wrote them.
   *
   * Stored on the join as `matchedText` so an extraction can be audited
   * without re-running it, and so a pattern that starts matching the wrong
   * thing can be found by looking at what it caught.
   */
  readonly matchedText: string;

  /** The whole sentence those words sit in. */
  readonly sentence: string;
}

export interface ExtractionInput {
  /** The advertisement's title. Read, because a title names skills too. */
  readonly title: string;

  /** The advertisement body. May be an excerpt, and may be absent. */
  readonly description: string | null;

  /**
   * The employer, where one is known.
   *
   * Supplied so that a tool sharing its name with the advertiser can be
   * suppressed. See `mentionsOwnName`.
   */
  readonly companyName: string | null;
}

/**
 * Whether a skill name is really just the advertiser's own name.
 *
 * ServiceNow, Inc. advertises jobs, and ServiceNow is also a platform that
 * other employers require. Of the twelve listings in the corpus mentioning it,
 * eleven are Queensland Health roles that want the platform and one is
 * ServiceNow describing itself as "the AI control tower for business
 * reinvention", which is a sentence about a company and not a skill anybody is
 * asking for.
 *
 * Attaching the skill there would put the advertiser's own name into the
 * requirements of its own job. The rule is narrow on purpose: it suppresses a
 * skill only for listings placed by an employer whose name contains it, so
 * every other employer requiring the tool keeps it. Salesforce, Amazon and
 * Microsoft have the same shape and the same treatment.
 *
 * Names are compared through the same normalisation the deduplicator uses, so
 * "ServiceNow, Inc." and "ServiceNow" are one name here as they are there.
 */
function mentionsOwnName(skill: SkillDefinition, companyName: string | null): boolean {
  if (companyName === null) return false;

  const employer = normalizeCompanyName(companyName);
  if (employer === '') return false;

  const skillWords = normalizeCompanyName(skill.name);
  if (skillWords === '') return false;

  // Word-boundary containment rather than equality: "servicenow inc" contains
  // "servicenow", and "microsoft" must not match an employer called
  // "Microsoft Partner Recruitment" by accident of substring.
  return ` ${employer} `.includes(` ${skillWords} `);
}

/** Every match of every pattern in a list, with its position. */
function findAll(
  text: string,
  patterns: readonly RegExp[],
): { readonly matchedText: string; readonly start: number; readonly end: number }[] {
  const found: { matchedText: string; start: number; end: number }[] = [];

  for (const pattern of patterns) {
    // Patterns are authored without the global flag and recompiled with it
    // here, rather than mutating shared lastIndex state across calls. The
    // same approach, and the same reason, as domain/sponsorship.ts.
    const scan = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
    let match = scan.exec(text);

    while (match !== null) {
      found.push({
        matchedText: match[0].trim(),
        start: match.index,
        end: match.index + match[0].length,
      });
      if (match.index === scan.lastIndex) scan.lastIndex += 1;
      match = scan.exec(text);
    }
  }

  return found;
}

/**
 * Reads an advertisement for every skill in the vocabulary.
 *
 * Returns at most one match per skill: the first occurrence, which carries the
 * sentence quoted to a reader. A listing that says "Excel" nine times has the
 * skill once, and the ninth sentence is no better evidence than the first.
 *
 * Title and description are read as one text so that a skill named only in the
 * title is still found, separated by a full stop so the title cannot run into
 * the first sentence of the body and produce a quotation spanning both.
 *
 * Excerpts are read. Unlike sponsorship, where silence in a fragment had to be
 * reported differently from silence in a whole advertisement, a skill found in
 * an excerpt is found: the evidence is present and quoted. What an excerpt
 * cannot support is the opposite claim, and this function never makes it.
 * Nothing here returns "this listing requires no skills".
 */
export function extractSkills(input: ExtractionInput): readonly SkillMatch[] {
  const combined = `${input.title} . ${input.description ?? ''}`;
  const text = plainText(combined);
  if (text === '') return [];

  const matches: SkillMatch[] = [];

  for (const skill of skillVocabulary) {
    if (mentionsOwnName(skill, input.companyName)) continue;

    const found = findAll(text, skill.patterns);
    if (found.length === 0) continue;

    // The earliest occurrence in the text, whichever pattern produced it.
    // Patterns are tried in authored order, so without this the quotation a
    // reader sees would depend on which alias happened to be listed first.
    const earliest = found.reduce(
      (lowest, candidate) => (candidate.start < lowest.start ? candidate : lowest),
      found[0] as (typeof found)[number],
    );

    matches.push({
      skill,
      matchedText: earliest.matchedText,
      sentence: sentenceAt(text, earliest.start, earliest.end).text,
    });
  }

  return matches;
}
