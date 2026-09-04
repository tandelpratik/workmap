import { createHash } from 'node:crypto';
import { normalizeCompanyName, normalizeLocationKey } from './job';

/**
 * Cross-source duplicate detection.
 *
 * One vacancy advertised through two channels is one vacancy. A government
 * role listed on the employer's own portal and syndicated to an aggregator
 * should be one row to a reader, not two.
 *
 * The asymmetry of the mistakes decides the design. A missed duplicate shows a
 * reader the same job twice, which is untidy. A wrong merge hides a real
 * vacancy behind an unrelated one, which is a job somebody does not find. The
 * constitution forbids fabricating a listing, and asserting that two
 * advertisements are the same vacancy when they are not is a fabrication about
 * both. So this errs, deliberately and consistently, toward leaving things
 * apart.
 *
 * Three rules follow from that:
 *
 * 1. **Never group two listings from the same source.** Within a source the
 *    provider's own identifier is the identity, and an employer advertising
 *    three identical positions is publishing three vacancies, not one repeated.
 * 2. **Never group on partial evidence.** A signature needs every component it
 *    claims. A missing company or location makes a listing unmatchable rather
 *    than matchable against anything with the same gap.
 * 3. **Every decision is explainable.** The signature that produced a group is
 *    stored with it, so a grouping can be read, argued with and recomputed.
 */

/** How a pair was matched. Ordered strongest first. */
export const matchConfidences = ['CANONICAL_URL', 'IDENTITY_TRIPLE'] as const;
export type MatchConfidence = (typeof matchConfidences)[number];

/**
 * A URL reduced to what identifies the advertisement.
 *
 * Query strings on job links are overwhelmingly tracking parameters, and the
 * same advertisement arrives from two sources with different ones. The path is
 * what addresses the vacancy.
 *
 * Returns null rather than a guess when the input is not a usable absolute
 * URL, because a malformed link must not become a key that other malformed
 * links also produce.
 */
export function canonicalUrlKey(url: string | null): string | null {
  if (url === null || url.trim() === '') return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const path = parsed.pathname.replace(/\/+$/, '');
  // Scheme is dropped on purpose: http and https of the same address are the
  // same advertisement, and sources differ on which they publish.
  return `${host}${path}`;
}

/**
 * Title reduced for comparison, and no further.
 *
 * Case, punctuation and spacing differ between channels for the same
 * advertisement, so those go. Nothing else does. Stripping words that look
 * like noise is where this kind of function turns dangerous: "Senior Nurse"
 * and "Nurse" are different jobs, and a normaliser that removed seniority
 * would merge them and hide one.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export interface DuplicateCandidate {
  readonly id: string;
  readonly sourceKey: string;
  readonly title: string;
  /** Normalised company name, or null when the source named no employer. */
  readonly companyKey: string | null;
  /** Normalised location key, or null when the source gave no location. */
  readonly locationKey: string | null;
  readonly applyUrl: string | null;
  readonly sourceUrl: string | null;
  readonly hasDescription: boolean;
  readonly postedAt: Date | null;
}

/**
 * The signatures a listing can be matched by, strongest first.
 *
 * A listing may offer both. Matching happens on whichever signature two
 * listings share, and the strongest shared one is recorded as the reason.
 */
export function signaturesFor(
  candidate: DuplicateCandidate,
): readonly { readonly confidence: MatchConfidence; readonly signature: string }[] {
  const signatures: { confidence: MatchConfidence; signature: string }[] = [];

  // The same address is the same advertisement. Both fields are considered
  // because sources differ on which one they publish as the destination.
  const urlKey =
    canonicalUrlKey(candidate.applyUrl) ?? canonicalUrlKey(candidate.sourceUrl);
  if (urlKey !== null) {
    signatures.push({ confidence: 'CANONICAL_URL', signature: `url:${urlKey}` });
  }

  // Employer, role and place together. Any one missing makes this unusable:
  // "the same title in the same place at an unnamed employer" describes a
  // great many unrelated vacancies.
  const title = normalizeTitle(candidate.title);
  if (title !== '' && candidate.companyKey !== null && candidate.locationKey !== null) {
    const digest = createHash('sha256')
      .update(JSON.stringify([candidate.companyKey, title, candidate.locationKey]))
      .digest('hex')
      .slice(0, 32);
    signatures.push({ confidence: 'IDENTITY_TRIPLE', signature: `cta:${digest}` });
  }

  return signatures;
}

export interface DuplicateGroup {
  /** The signature every member shares. Stored, so a group can be explained. */
  readonly signature: string;
  readonly confidence: MatchConfidence;
  /** Member ids, the canonical one first. */
  readonly memberIds: readonly string[];
  readonly canonicalId: string;
}

/**
 * Which listing represents the group.
 *
 * Preference order, and each step is a judgement worth stating:
 *
 * 1. **A listing with a description.** An entry a reader can actually read
 *    beats one that only has a title.
 * 2. **The earliest posting.** The first channel to carry the advertisement is
 *    the closest thing to its origin that this data offers.
 * 3. **The lowest source key, then the lowest id.** Not meaningful, and that
 *    is the point: the tie has to break the same way on every run or the
 *    canonical choice would drift between imports for no reason.
 */
function chooseCanonical(members: readonly DuplicateCandidate[]): DuplicateCandidate {
  return [...members].sort((a, b) => {
    if (a.hasDescription !== b.hasDescription) return a.hasDescription ? -1 : 1;

    const aTime = a.postedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const bTime = b.postedAt?.getTime() ?? Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime - bTime;

    if (a.sourceKey !== b.sourceKey) return a.sourceKey.localeCompare(b.sourceKey);
    return a.id.localeCompare(b.id);
  })[0]!;
}

/**
 * Groups listings that describe the same vacancy.
 *
 * Pure, and therefore testable against the fixtures that matter: the pairs
 * that must group and the pairs that must not.
 *
 * A listing is placed in at most one group. Where a listing could join two, the
 * stronger signature wins, and the order of the input does not change the
 * outcome.
 */
export function groupDuplicates(
  candidates: readonly DuplicateCandidate[],
): readonly DuplicateGroup[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const claimed = new Set<string>();
  const groups: DuplicateGroup[] = [];

  for (const confidence of matchConfidences) {
    const buckets = new Map<string, string[]>();

    for (const candidate of candidates) {
      if (claimed.has(candidate.id)) continue;
      for (const entry of signaturesFor(candidate)) {
        if (entry.confidence !== confidence) continue;
        buckets.set(entry.signature, [
          ...(buckets.get(entry.signature) ?? []),
          candidate.id,
        ]);
      }
    }

    for (const [signature, ids] of [...buckets.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const members = ids
        .map((id) => byId.get(id))
        .filter((member): member is DuplicateCandidate => member !== undefined);

      // Two listings from one source are two vacancies. This is the guard that
      // stops an employer advertising four identical positions from being
      // collapsed into one.
      const sources = new Set(members.map((member) => member.sourceKey));
      if (members.length < 2 || sources.size < 2) continue;

      const canonical = chooseCanonical(members);
      for (const member of members) claimed.add(member.id);

      groups.push({
        signature,
        confidence,
        canonicalId: canonical.id,
        memberIds: [
          canonical.id,
          ...members
            .filter((member) => member.id !== canonical.id)
            .map((member) => member.id)
            .sort(),
        ],
      });
    }
  }

  return groups;
}

/** Convenience for callers holding raw source values rather than keys. */
export function candidateKeys(input: {
  readonly companyName: string | null;
  readonly locationText: string | null;
}): { companyKey: string | null; locationKey: string | null } {
  const companyKey =
    input.companyName === null ? null : normalizeCompanyName(input.companyName);
  const locationKey =
    input.locationText === null ? null : normalizeLocationKey(input.locationText);

  return {
    companyKey: companyKey === '' ? null : companyKey,
    locationKey: locationKey === '' ? null : locationKey,
  };
}
