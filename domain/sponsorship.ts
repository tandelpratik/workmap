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
 * Two rules follow from that, and both are enforced by the types:
 *
 *   1. Every finding carries the exact words that produced it. A label without
 *      its evidence is our claim about an employer rather than the employer's
 *      own statement, and a wrong one is a false representation about a real
 *      business that a reader may act on by relocating.
 *
 *   2. Absence of wording is only reported when the whole advertisement was
 *      read. An excerpt that does not mention sponsorship says nothing about
 *      whether the advertisement does.
 */

export const sponsorshipSignals = [
  /** The advertisement states sponsorship is offered or available. */
  'MENTIONED',
  /** The advertisement states sponsorship is not available. */
  'EXCLUDED',
  /** The whole advertisement was read and says nothing either way. */
  'NOT_MENTIONED',
  /**
   * Only part of the advertisement is held, so silence proves nothing.
   *
   * Adzuna returns a snippet rather than the full text, so every listing from
   * it lands here. Reporting "not mentioned" from a fragment would turn a gap
   * in our data into a statement about someone's job advertisement.
   */
  'INDETERMINATE',
] as const;
export type SponsorshipSignal = (typeof sponsorshipSignals)[number];

export interface SponsorshipEvidence {
  /** The phrase that matched, exactly as the advertisement wrote it. */
  readonly phrase: string;
  /** Surrounding words, so a reader can judge the phrase in context. */
  readonly context: string;
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
 * Phrases that assert sponsorship is on offer.
 *
 * Deliberately phrases, not keywords. "Visa" alone appears in job titles
 * ("HR Advisor (Visa and JEMS)") and in descriptions of who may apply
 * ("Skilled Regional Visa Holders are welcome"), neither of which is an offer
 * to sponsor anybody. Both were found in real advertisements already held, and
 * a bare keyword would have mislabelled both.
 */
const AFFIRMATIVE = [
  /\bvisa sponsorship\b/i,
  /\bsponsorship (?:is )?(?:available|offered|provided|considered|on offer)\b/i,
  /\b(?:we|employer|company) (?:can |will |may )?sponsor\b/i,
  /\bsponsorship (?:may be|can be|will be) (?:available|offered|provided)\b/i,
  /\b(?:willing|able|happy) to sponsor\b/i,
  /\bsponsor(?:ed|ship) (?:for )?(?:eligible |suitable )?(?:candidates?|applicants?|workers?)\b/i,
  /\b(?:482|494|491|186|187)\s*(?:visa|nomination|sponsorship)\b/i,
  /\b(?:TSS|DAMA)\b.{0,30}\bsponsor/i,
  /\bsponsor.{0,30}\b(?:TSS|DAMA)\b/i,
];

/**
 * Wording that turns a sponsorship phrase into a refusal.
 *
 * Checked against the words immediately around a match rather than the whole
 * advertisement, so a refusal in one paragraph does not negate an offer in
 * another.
 */
const NEGATORS =
  /\b(?:not|no|never|unable|cannot|can't|won't|will not|does not|do not|isn't|is not|are not|without|ineligible for|unavailable)\b/i;

/** How much text either side of a match is kept as context. */
const CONTEXT_RADIUS = 90;

/**
 * Strips markup and collapses whitespace.
 *
 * Advertisements arrive as HTML. A phrase split by a tag ("visa<b>
 * sponsorship</b>") must still match, so tags become spaces rather than
 * being deleted, which would fuse the words either side of them.
 */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function contextAround(text: string, start: number, end: number): string {
  const from = Math.max(0, start - CONTEXT_RADIUS);
  const to = Math.min(text.length, end + CONTEXT_RADIUS);
  const prefix = from > 0 ? '…' : '';
  const suffix = to < text.length ? '…' : '';
  return `${prefix}${text.slice(from, to).trim()}${suffix}`;
}

/**
 * Whether the words just before a match refuse it.
 *
 * Only the run-up is inspected. "Visa sponsorship is not available" negates;
 * "visa sponsorship available. Applicants without AHPRA need not apply" does
 * not, because the negator belongs to a later clause.
 */
function isNegated(text: string, matchStart: number, matchEnd: number): boolean {
  const before = text.slice(Math.max(0, matchStart - 60), matchStart);
  const after = text.slice(matchEnd, Math.min(text.length, matchEnd + 40));
  // A clause boundary between a negator and the match usually means the
  // negator governs something else, so only the current clause is considered.
  const clause = before.split(/[.;:!?]/).pop() ?? '';
  const trailing = after.split(/[.;:!?]/)[0] ?? '';
  return NEGATORS.test(clause) || NEGATORS.test(trailing);
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
  const affirmative: SponsorshipEvidence[] = [];
  const excluded: SponsorshipEvidence[] = [];

  for (const pattern of AFFIRMATIVE) {
    const match = pattern.exec(text);
    if (match === null) continue;
    const start = match.index;
    const end = start + match[0].length;
    const evidence: SponsorshipEvidence = {
      phrase: match[0].trim(),
      context: contextAround(text, start, end),
    };
    if (isNegated(text, start, end)) excluded.push(evidence);
    else affirmative.push(evidence);
  }

  // A refusal outranks an offer when an advertisement contains both. The two
  // errors are not symmetrical: telling a reader an employer sponsors when it
  // does not may send them to relocate or apply on a false basis, while the
  // reverse costs them an opportunity they can still find at the source, which
  // every listing links to.
  if (excluded.length > 0) return { signal: 'EXCLUDED', evidence: excluded };
  if (affirmative.length > 0) return { signal: 'MENTIONED', evidence: affirmative };

  // Silence. Only reportable when the whole advertisement was read.
  return { signal: options.isExcerpt ? 'INDETERMINATE' : 'NOT_MENTIONED', evidence: [] };
}

/**
 * How a finding is worded to a reader.
 *
 * Every label describes the advertisement, never the employer and never the
 * reader. "Not mentioned in this advertisement" is a statement about a
 * document; "this employer does not sponsor" would be a claim about a business
 * that nothing in the text supports.
 */
export function sponsorshipLabel(signal: SponsorshipSignal): string {
  switch (signal) {
    case 'MENTIONED':
      return 'Sponsorship mentioned in this advertisement';
    case 'EXCLUDED':
      return 'This advertisement states sponsorship is not available';
    case 'NOT_MENTIONED':
      return 'Not mentioned in this advertisement';
    case 'INDETERMINATE':
      return 'Not known: only part of this advertisement is held';
  }
}
