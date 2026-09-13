/**
 * What an advertisement says about visa sponsorship.
 *
 * This module reports wording. It does not assess eligibility, and nothing
 * here concerns a reader's circumstances, visa subclass or prospects. That
 * boundary is deliberate and legal as much as editorial: passing on what a
 * third party published, without substantial comment on it, is a different act
 * from advising someone about their own migration position. The product stays
 * on the first side of that line, links to the original advertisement, and
 * sends readers to official government sources for anything further.
 *
 * Three rules follow from that, and all three are enforced by the types:
 *
 *   1. Every finding carries the exact sentence that produced it. A label
 *      without its evidence is our claim about an employer rather than the
 *      employer's own statement, and a wrong one is a false representation
 *      about a real business that a reader may act on by relocating.
 *
 *   2. Absence of wording is only reported when the whole advertisement was
 *      read. An excerpt that does not mention sponsorship says nothing about
 *      whether the advertisement does.
 *
 *   3. Where the wording is capable of more than one strength, the weaker
 *      reading is published. See the resolution rules below.
 *
 * ## How the strength of an offer is decided
 *
 * The six signals below distinguish an employer who states sponsorship is
 * available from one who says it might be considered for the right person.
 * Those are different statements and collapsing them into "mentioned" lost the
 * difference that matters most to somebody deciding whether to apply.
 *
 * Strength is read per sentence, and then across sentences, and the two
 * directions deliberately disagree:
 *
 *   - **Within one sentence, the strongest wording wins.** "Visa sponsorship is
 *     available for the right candidate" says available; the qualifier narrows
 *     who, not whether.
 *
 *   - **Across sentences, the weakest wins.** An advertisement whose benefits
 *     list says "visa sponsorship" and whose body says "sponsorship may be
 *     considered case by case" is making the second claim, and the first is a
 *     headline for it.
 *
 * The asymmetry is the point, and it is not a matter of taste. Telling a reader
 * an employer offers sponsorship when the advertisement only floated the
 * possibility may send them to relocate or resign on a false basis. The
 * reverse understates an employer whose own sentence is printed directly
 * beneath the label, where the reader can see it and judge for themselves. The
 * two errors are not the same size, so the tie is broken towards the smaller
 * one.
 *
 * A refusal outranks everything, for the same reason.
 *
 * ## Why phrases and not keywords
 *
 * Nothing here matches a bare word. "Visa" alone appears in job titles
 * ("HR Advisor (Visa and JEMS)") and in descriptions of who may apply
 * ("Skilled Regional Visa Holders are welcome"), neither of which is an offer
 * to sponsor anybody; both were found in real advertisements already held.
 * "Sponsorship" alone is worse, because a marketing or events role can be
 * entirely about sponsorship agreements and have nothing to do with visas.
 *
 * So every pattern below is a phrase, and every phrase carries its own visa
 * context. An advertisement that says only "manage sponsorship and partnership
 * agreements" matches nothing and is reported as not mentioning sponsorship,
 * which is true.
 */

import { plainText, sentenceAt } from './text';

export const sponsorshipSignals = [
  /** The advertisement states sponsorship is available, offered or provided. */
  'OFFERED',
  /** The employer states a willingness to sponsor: "happy to sponsor". */
  'OPEN_TO',
  /**
   * The advertisement raises sponsorship as a possibility rather than a fact:
   * "may be considered", "case by case", "for the right candidate".
   *
   * Also where sponsorship is mentioned with no indication of strength at all,
   * such as a bare "visa sponsorship" in a list of benefits. That is the
   * weakest affirmative reading, and taking it is how rule 3 above is applied
   * to wording that does not commit either way.
   */
  'MAY_BE_CONSIDERED',
  /** The advertisement states sponsorship is not available. */
  'EXCLUDED',
  /** The whole advertisement was read and says nothing either way. */
  'NOT_MENTIONED',
  /**
   * Only part of the advertisement is held, so silence proves nothing.
   *
   * Adzuna returns a snippet rather than the full text, so every listing from
   * it lands here unless its snippet happens to mention sponsorship. Reporting
   * "not mentioned" from a fragment would turn a gap in our data into a
   * statement about someone's job advertisement.
   */
  'INDETERMINATE',
] as const;
export type SponsorshipSignal = (typeof sponsorshipSignals)[number];

/**
 * The affirmative signals, weakest first.
 *
 * The order is the resolution order and is used rather than restated: adding a
 * tier means adding it here, not remembering to update a comparison somewhere
 * else.
 */
export const affirmativeSignals = ['MAY_BE_CONSIDERED', 'OPEN_TO', 'OFFERED'] as const;
export type AffirmativeSignal = (typeof affirmativeSignals)[number];

/** Whether a signal reports wording that was actually found in the text. */
export function isEvidenced(signal: SponsorshipSignal): boolean {
  return (
    signal === 'EXCLUDED' || affirmativeSignals.includes(signal as AffirmativeSignal)
  );
}

export interface SponsorshipEvidence {
  /** The phrase that matched, exactly as the advertisement wrote it. */
  readonly phrase: string;
  /**
   * The whole sentence the phrase sits in, exactly as the advertisement wrote
   * it.
   *
   * A sentence rather than a window of characters either side. A window cuts
   * mid-clause and can sever the very qualifier that decides what the sentence
   * means: "sponsorship is available" and "sponsorship is available only to
   * applicants already holding full work rights" differ in the part a fixed
   * window is most likely to lose.
   */
  readonly sentence: string;
}

export interface SponsorshipFinding {
  readonly signal: SponsorshipSignal;
  /**
   * What was found. Empty for NOT_MENTIONED and INDETERMINATE, which are
   * statements about our reading rather than about the advertisement.
   */
  readonly evidence: readonly SponsorshipEvidence[];
}

/**
 * Wording that refuses sponsorship outright.
 *
 * Matched first, and stated as its own patterns rather than inferred by
 * negating an affirmative one. "Sponsorship is not available for this role"
 * contains no affirmative phrase to negate: the word "not" sits between
 * "sponsorship" and "available", so no affirmative pattern matches it at all,
 * and an approach built only on negation reported it as not mentioning
 * sponsorship. It is the clearest statement an employer can make on the
 * subject and it was being dropped.
 */
const REFUSAL = [
  /\bno (?:visa )?sponsorship\b/i,
  /\bsponsorship (?:is |will )?(?:not|un)[- ]?(?:available|offered|provided|possible)\b/i,
  /\bsponsorship (?:is )?not (?:being )?(?:offered|provided|available|considered)\b/i,
  /\b(?:cannot|can not|can't|unable to|not able to|do not|does not|don't|will not|won't|not in a position to) sponsor\b/i,
  /\b(?:cannot|can't|unable to|not able to|do not|does not|don't|will not|won't) (?:offer|provide) (?:visa )?sponsorship\b/i,
  /\bnot (?:offering|providing) (?:visa )?sponsorship\b/i,
  /\bsponsorship (?:is )?unavailable\b/i,
];

/**
 * The advertisement states sponsorship is available, offered or provided.
 *
 * Present indicative, or a plain future. Nothing conditional belongs here.
 */
const OFFERED = [
  /\bsponsorship (?:is |are )?(?:available|offered|provided|included|supported)\b/i,
  /\bsponsorship (?:is )?on offer\b/i,
  /\bsponsorship will be (?:available|offered|provided)\b/i,
  /\b(?:we|employer|company|organisation|client) (?:offer|offers|provide|provides) (?:full |visa )*sponsorship\b/i,
  /\b(?:visa )?sponsorship (?:is )?(?:fully )?(?:available|provided) (?:for|to)\b/i,
];

/**
 * The employer states a willingness to sponsor.
 *
 * Weaker than an offer and stronger than a possibility: the employer has said
 * it will do the thing, without stating the thing is already on the table.
 */
const OPEN_TO = [
  /\b(?:willing|able|happy|prepared|keen|ready) to sponsor\b/i,
  /\bopen to (?:sponsor|sponsoring|sponsorship)\b/i,
  /\b(?:we|employer|company|organisation|client) (?:can|will) sponsor\b/i,
  /\b(?:we|employer|company|organisation|client) sponsor\b/i,
  /\bcan (?:offer|provide) (?:visa )?sponsorship\b/i,
  /\bsponsorship can be (?:available|offered|provided|arranged)\b/i,
  /\bwill (?:offer|provide) (?:visa )?sponsorship\b/i,
];

/**
 * The advertisement raises sponsorship as a possibility.
 *
 * Conditional, hedged, or contingent on the applicant. The difference between
 * this and an offer is the whole reason the label was split, and it is the one
 * distinction a reader deciding whether to move house actually needs.
 */
const MAY_BE_CONSIDERED = [
  /\bsponsorship (?:may|might|could) be (?:available|offered|provided|considered|discussed|arranged|possible)\b/i,
  /\bsponsorship (?:will |may |can |would )?be considered\b/i,
  /\bsponsorship (?:is |are )?(?:being )?considered\b/i,
  /\b(?:may|might|could|would) (?:be able to |consider(?:ing)? )?sponsor\b/i,
  /\b(?:consider|considering|consideration of) (?:visa )?sponsorship\b/i,
  /\bsponsorship (?:is )?(?:possible|negotiable|an option)\b/i,
  /\bsponsorship\b[^.!?]{0,40}\bcase[- ]by[- ]case\b/i,
  /\bsponsor(?:ship)?\b[^.!?]{0,60}\bfor the right (?:candidate|person|applicant|individual)\b/i,
  /\bfor the right (?:candidate|person|applicant|individual)\b[^.!?]{0,60}\bsponsor(?:ship)?\b/i,
];

/**
 * Sponsorship mentioned with no indication of strength.
 *
 * A bare "visa sponsorship" in a benefits list, or a subclass number beside
 * the word. The advertisement has raised the subject and has not said how
 * firmly, so it is read at the weakest affirmative strength and the sentence
 * is printed so a reader can form their own view. Reading it as an offer would
 * be us supplying a commitment the employer did not write.
 *
 * Every pattern carries its own visa context, which is what keeps a marketing
 * role's sponsorship agreements out of the results.
 */
const MENTIONED_WITHOUT_STRENGTH = [
  /\bvisa sponsorship\b/i,
  /\bsponsorship (?:of |for )?(?:a )?(?:visa|482|494|491|186|187|485)\b/i,
  /\b(?:482|494|491|186|187)\s*(?:visa )?(?:nomination|sponsorship)\b/i,
  /\bsponsor(?:ed|ship) (?:for )?(?:eligible |suitable |skilled )?(?:candidates?|applicants?|workers?|migrants?)\b/i,
  /\b(?:TSS|DAMA|ENS|RSMS)\b[^.!?]{0,30}\bsponsor/i,
  /\bsponsor[^.!?]{0,30}\b(?:TSS|DAMA|ENS|RSMS)\b/i,
];

/**
 * Wording that turns a sponsorship phrase into a refusal.
 *
 * A second net, behind the explicit refusal patterns above. Checked against the
 * words immediately around a match rather than the whole advertisement, so a
 * refusal in one paragraph does not negate an offer in another.
 */
const NEGATORS =
  /\b(?:not|no|never|unable|cannot|can't|won't|will not|does not|do not|isn't|is not|are not|without|ineligible for|unavailable)\b/i;

/*
 * Text handling moved to domain/text.ts when skill extraction came to need the
 * same two functions. Re-exported here because the sponsorship tests and the
 * detector below are their oldest callers, and because what a sentence is was
 * worked out for this module even though it does not belong to it.
 */
export { plainText, sentenceAt } from './text';

/**
 * Whether the words just before a match refuse it.
 *
 * Only the run-up and the immediate continuation are inspected. "Visa
 * sponsorship is not available" negates; "visa sponsorship available.
 * Applicants without AHPRA need not apply" does not, because the negator
 * belongs to a later clause.
 */
function isNegated(text: string, matchStart: number, matchEnd: number): boolean {
  const before = text.slice(Math.max(0, matchStart - 60), matchStart);
  const after = text.slice(matchEnd, Math.min(text.length, matchEnd + 40));
  const clause = before.split(/[.;:!?]/).pop() ?? '';
  const trailing = after.split(/[.;:!?]/)[0] ?? '';
  return NEGATORS.test(clause) || NEGATORS.test(trailing);
}

/** Every match of every pattern in a list, with its position. */
function findAll(
  text: string,
  patterns: readonly RegExp[],
): { readonly phrase: string; readonly start: number; readonly end: number }[] {
  const found: { phrase: string; start: number; end: number }[] = [];
  for (const pattern of patterns) {
    // Patterns are authored without the global flag, so they are re-created
    // here with it rather than mutating shared state through lastIndex.
    const scan = new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`);
    let match = scan.exec(text);
    while (match !== null) {
      found.push({
        phrase: match[0].trim(),
        start: match.index,
        end: match.index + match[0].length,
      });
      if (match.index === scan.lastIndex) scan.lastIndex += 1;
      match = scan.exec(text);
    }
  }
  return found;
}

/** What one sentence of the advertisement was found to say. */
interface SentenceFinding {
  readonly signal: SponsorshipSignal;
  readonly evidence: SponsorshipEvidence;
}

/**
 * Reads an advertisement for sponsorship wording.
 *
 * `isExcerpt` is not optional, because getting it wrong is the failure that
 * matters: it is the difference between "this advertisement does not mention
 * sponsorship" and "we have not read this advertisement".
 */
export function detectSponsorship(options: {
  readonly text: string | null;
  readonly isExcerpt: boolean;
}): SponsorshipFinding {
  // Nothing to read. Not the same as an advertisement that says nothing.
  if (options.text === null || options.text.trim() === '') {
    return { signal: 'INDETERMINATE', evidence: [] };
  }

  const text = plainText(options.text);

  const tiers: readonly { signal: SponsorshipSignal; patterns: readonly RegExp[] }[] = [
    { signal: 'EXCLUDED', patterns: REFUSAL },
    { signal: 'OFFERED', patterns: OFFERED },
    { signal: 'OPEN_TO', patterns: OPEN_TO },
    { signal: 'MAY_BE_CONSIDERED', patterns: MAY_BE_CONSIDERED },
    { signal: 'MAY_BE_CONSIDERED', patterns: MENTIONED_WITHOUT_STRENGTH },
  ];

  /*
   * Findings collapsed onto the sentence they were found in, keyed by that
   * sentence's span.
   *
   * Within a sentence the strongest reading wins, and a refusal wins outright.
   * A sentence reading "visa sponsorship is available for the right candidate"
   * matches an offer, a possibility and a bare mention; it says available, and
   * the qualifier narrows who rather than whether.
   */
  const bySentence = new Map<string, SentenceFinding>();

  const rank = (signal: SponsorshipSignal): number => {
    if (signal === 'EXCLUDED') return 100;
    const index = affirmativeSignals.indexOf(signal as AffirmativeSignal);
    return index === -1 ? -1 : index;
  };

  for (const tier of tiers) {
    for (const match of findAll(text, tier.patterns)) {
      const sentence = sentenceAt(text, match.start, match.end);
      // The explicit refusal patterns already say what they mean. Everything
      // else is checked against the words around it as a second net.
      const signal =
        tier.signal === 'EXCLUDED'
          ? 'EXCLUDED'
          : isNegated(text, match.start, match.end)
            ? 'EXCLUDED'
            : tier.signal;

      const key = `${String(sentence.from)}:${String(sentence.to)}`;
      const existing = bySentence.get(key);
      if (existing === undefined || rank(signal) > rank(existing.signal)) {
        bySentence.set(key, {
          signal,
          evidence: { phrase: match.phrase, sentence: sentence.text },
        });
      }
    }
  }

  const findings = [...bySentence.values()];
  if (findings.length === 0) {
    // Silence. Only reportable when the whole advertisement was read.
    return {
      signal: options.isExcerpt ? 'INDETERMINATE' : 'NOT_MENTIONED',
      evidence: [],
    };
  }

  /*
   * A refusal outranks an offer when an advertisement contains both. The two
   * errors are not symmetrical: telling a reader an employer sponsors when it
   * does not may send them to relocate or apply on a false basis, while the
   * reverse costs them an opportunity they can still find at the source, which
   * every listing links to.
   */
  const refusals = findings.filter((finding) => finding.signal === 'EXCLUDED');
  if (refusals.length > 0) {
    return { signal: 'EXCLUDED', evidence: refusals.map((finding) => finding.evidence) };
  }

  /*
   * Across sentences the weakest affirmative wins. See the asymmetry argument
   * at the top of this file: an advertisement whose benefits list says "visa
   * sponsorship" and whose body says "may be considered case by case" is making
   * the second claim.
   *
   * Only the evidence at the chosen strength is returned, so the label and the
   * quotation beneath it always say the same thing.
   */
  const weakest = findings.reduce(
    (lowest, finding) => (rank(finding.signal) < rank(lowest.signal) ? finding : lowest),
    findings[0] as SentenceFinding,
  );

  return {
    signal: weakest.signal,
    evidence: findings
      .filter((finding) => finding.signal === weakest.signal)
      .map((finding) => finding.evidence),
  };
}

/**
 * How a finding is worded to a reader.
 *
 * Every label describes the advertisement, never the employer and never the
 * reader. "Not mentioned" is a statement about a document; "this employer does
 * not sponsor" would be a claim about a business that nothing in the text
 * supports.
 */
export function sponsorshipLabel(signal: SponsorshipSignal): string {
  switch (signal) {
    case 'OFFERED':
      return 'Sponsorship offered';
    case 'OPEN_TO':
      return 'Open to sponsorship';
    case 'MAY_BE_CONSIDERED':
      return 'Sponsorship may be considered';
    case 'EXCLUDED':
      return 'Sponsorship not available';
    case 'NOT_MENTIONED':
      return 'Not mentioned';
    case 'INDETERMINATE':
      return 'Description incomplete';
  }
}

/**
 * The same finding, said in full.
 *
 * The short labels above are what a card can carry. Each one is a summary of a
 * longer statement, and the longer statement is what actually keeps the product
 * inside its boundary: every one of these is about a document, and the two
 * absences are explicitly about the limits of our reading rather than about the
 * employer.
 */
export function sponsorshipMeaning(signal: SponsorshipSignal): string {
  switch (signal) {
    case 'OFFERED':
      return 'This advertisement states that sponsorship is available.';
    case 'OPEN_TO':
      return 'This advertisement states that the employer is willing to sponsor.';
    case 'MAY_BE_CONSIDERED':
      return (
        'This advertisement raises sponsorship as a possibility rather than ' +
        'stating it is available, or mentions it without saying how firmly.'
      );
    case 'EXCLUDED':
      return 'This advertisement states that sponsorship is not available.';
    case 'NOT_MENTIONED':
      return (
        'The whole advertisement was read and says nothing either way. It does ' +
        'not mean the employer never sponsors.'
      );
    case 'INDETERMINATE':
      return (
        'Only part of this advertisement is held, so its silence proves ' +
        'nothing. Open the original to read it in full.'
      );
  }
}
