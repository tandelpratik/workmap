/**
 * What kind of thing a skill is.
 *
 * Declared here rather than imported from the generated Prisma client, for the
 * reason every other vocabulary in this codebase is: nothing above persistence
 * should have to know that a database exists to name a category. A test asserts
 * this list and the schema's `skill_kind` enum still agree, so the two cannot
 * drift apart quietly.
 *
 * In `domain/` rather than in `skills/`, where it started, and the move is
 * about direction rather than tidiness. `skills/` reads advertisement text and
 * depends on the domain; the domain does not depend on it. A listing carries
 * skill attachments, so `domain/job.ts` needs to name a kind, and leaving the
 * vocabulary in `skills/` would have made the centre of the dependency graph
 * import from a module that imports it back. The layout now matches
 * `domain/sponsorship.ts` and `domain/regional.ts` exactly: the vocabulary, its
 * reader-facing wording and the shape a listing carries live together in the
 * domain, and the code that reads English against them lives outside it.
 *
 * Two of the six are unused by the current vocabulary and are kept anyway.
 * `SOFT` and `DOMAIN` are in the schema, a migration to remove them would be
 * churn, and both describe real categories that a later extraction may earn.
 * `skills/vocabulary.ts` says why neither is populated today.
 */

export const skillKinds = [
  /** A technical practice rather than a named product: SQL, Python. */
  'TECHNICAL',
  /** A named piece of software or equipment: Microsoft Excel, a forklift. */
  'TOOL',
  /** A credential, registration or licence: AHPRA, a Blue Card. */
  'CERTIFICATION',
  /** A spoken or signed language. */
  'LANGUAGE',
  /** Subject-matter knowledge of a field. */
  'DOMAIN',
  /** An interpersonal or general working capability. */
  'SOFT',
] as const;

export type SkillKind = (typeof skillKinds)[number];

/**
 * How a kind is worded to a reader.
 *
 * Singular, and describing the thing rather than the person. "Certification"
 * is what the advertisement asks for; "certified" would be a claim about an
 * applicant.
 */
export function skillKindLabel(kind: SkillKind): string {
  switch (kind) {
    case 'TECHNICAL':
      return 'Technical';
    case 'TOOL':
      return 'Tool';
    case 'CERTIFICATION':
      return 'Certification or licence';
    case 'LANGUAGE':
      return 'Language';
    case 'DOMAIN':
      return 'Field';
    case 'SOFT':
      return 'General';
  }
}

/**
 * A skill one advertisement named, with the words that named it.
 *
 * The type lives in the domain and the vocabulary lives in `skills/`, which is
 * the same split as the sponsorship finding: what a listing carries is domain
 * shape, and what counts as a skill is a reading of text. `skills/` is
 * forbidden from importing the domain, so the dependency only points this way
 * and the extraction module stays a thing that reads a string and returns what
 * it found.
 *
 * **It is a mention, not a requirement.** The corpus files mandatory
 * requirements under headings reading "Highly Desirable" and desirable ones
 * under "Your mandatory requirements", so the two cannot be told apart
 * honestly and this product does not try. The matched words travel with the
 * attachment so a reader can judge, which is the settlement the sponsorship
 * evidence reached for the same reason.
 *
 * **An empty list is not a claim about the job.** It says this product's
 * reading of the text it holds found nothing, and for most listings the text
 * it holds is an excerpt: every one of the 500 Adzuna listings is one, and
 * they carry a skill a quarter as often as the listings that arrive whole.
 */
export interface SkillAttachment {
  /** Canonical display name, from the vocabulary. What a reader sees. */
  readonly name: string;
  /** The vocabulary's stable key, and what a filter is keyed by. */
  readonly normalizedName: string;
  readonly kind: SkillKind;
  /**
   * The advertisement's own words, exactly as it wrote them.
   *
   * Nullable because the column is: an attachment made before the evidence
   * rule existed, or by hand, may carry none. Shown when it adds something to
   * the label and omitted when it merely repeats it.
   */
  readonly matchedText: string | null;
}
