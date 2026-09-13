/**
 * What kind of thing a skill is.
 *
 * Declared here rather than imported from the generated Prisma client, for the
 * reason every other vocabulary in this codebase is: the extraction module sits
 * outside persistence and must not know that a database exists. A test asserts
 * this list and the schema's `skill_kind` enum still agree, so the two cannot
 * drift apart quietly.
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
