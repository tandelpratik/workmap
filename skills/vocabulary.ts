import type { SkillKind } from './kind';

/**
 * The controlled vocabulary of skills this product will recognise.
 *
 * Every entry was measured against the stored corpus before it was written
 * here, and the count beside each one is how many of the 2,713 listings held on
 * 2026-09-13 mention it. That is the whole method: a skill is in this file
 * because advertisements say it, and the number is kept so a later reader can
 * see which entries were carrying weight and which were nearly idle.
 *
 * The counts go stale. They are evidence of how the list was arrived at, not a
 * figure the product publishes anywhere, and nothing reads them at runtime.
 *
 * ## Why phrases with context, and never a bare word
 *
 * The same rule the sponsorship detector follows, for the same reason, and it
 * was not theoretical here either. Every one of these was found in the real
 * corpus while this file was being written:
 *
 *   - `excel` matches 47 listings, of which only 21 mean the spreadsheet.
 *     "Professionals who excel at critical thinking" is the verb, and a reader
 *     filtering for a Microsoft Excel skill does not want that job.
 *   - `R` as a language is one letter, and no amount of context makes it safe
 *     next to "R U OK Day" and a thousand initials. It was measured at three
 *     listings and left out.
 *   - `Auslan` matches six listings, and the ones inspected were describing the
 *     client's support team rather than requiring the language of the
 *     applicant. Left out until a pattern can tell those apart.
 *
 * ## What is deliberately absent
 *
 * **Soft skills.** "Leadership" appears in 776 listings, "communication skills"
 * in 212. They are not requirements in that text, they are the furniture of job
 * advertisements: "your next leadership opportunity", "a hands-on leadership
 * team", "this is an incredible leadership position". A filter matching 29 per
 * cent of the corpus separates nothing from nothing, and the matches are mostly
 * describing the role rather than asking anything of the applicant. The
 * `SOFT` kind stays in the schema because a later extraction may earn it.
 *
 * **Occupations.** "Registered nurse" is in 216 listings and is not a skill, it
 * is the job. Mapping listings to an occupation classification is a separate
 * problem blocked on an open licence question (ANZSCO against OSCA, recorded in
 * the source register), and quietly growing an occupation taxonomy in here
 * under another name would route around that.
 *
 * **Qualification levels.** "Bachelor", "diploma", "certificate III" say how
 * much study a role wants, not what the holder can do. Worth extracting one
 * day, as their own field rather than as skills.
 *
 * **Vaccination status.** The single most common requirement in this corpus,
 * 269 listings, and not a skill by any reading. It is a condition of
 * employment, it is health information about a person, and a product that
 * filters people by it would be doing something quite different from what this
 * one does.
 */

export interface SkillDefinition {
  /** Canonical display name. What a reader sees. */
  readonly name: string;

  /**
   * Stable identity, and the unique key in the database.
   *
   * Written out rather than derived from `name`, because renaming a skill for
   * readers must not silently create a second row and orphan every listing
   * already attached to the first.
   */
  readonly normalizedName: string;

  readonly kind: SkillKind;

  /**
   * The patterns that attach this skill, each carrying its own context.
   *
   * Authored without the global flag. The extractor recompiles them with it
   * rather than mutating shared `lastIndex` state across calls.
   */
  readonly patterns: readonly RegExp[];

  /**
   * Listings mentioning this skill when the vocabulary was written, out of
   * 2,713. Evidence of method. Nothing reads it.
   */
  readonly observed: number;

  /** Why this entry is worded the way it is, where that is not obvious. */
  readonly note?: string;
}

/**
 * Credentials, registrations and licences.
 *
 * The most useful kind in this corpus by a distance, and the reason skill
 * extraction is worth having at all here. Somebody searching regional
 * Australia for work needs to know whether a role is closed to them until they
 * hold a particular card, and these are the concrete, checkable, named things
 * that decide it. They are also the easiest to match honestly: an
 * advertisement that wants a Blue Card says "Blue Card".
 */
const CERTIFICATIONS: readonly SkillDefinition[] = [
  {
    name: 'AHPRA registration',
    normalizedName: 'ahpra-registration',
    kind: 'CERTIFICATION',
    observed: 138,
    patterns: [/\bAHPRA\b/i, /\bAustralian Health Practitioner Regulation Agency\b/i],
    note:
      'Registration with the national health practitioner regulator. The ' +
      'acronym is unambiguous in Australian job advertisements and needs no ' +
      'further context.',
  },
  {
    name: 'Working with Children Check',
    normalizedName: 'working-with-children-check',
    kind: 'CERTIFICATION',
    observed: 65,
    patterns: [
      /\bblue card\b/i,
      /\bWWCC\b/,
      /\bworking with children(?:'?s)? (?:check|card|clearance|screening)\b/i,
      // "QLD Working with Children Blue Cardare a person who resides…", from a
      // real listing whose source fused the words either side of a list item.
      // The bounded gap catches it without letting the phrase reach across a
      // clause to find an unrelated "blue".
      /\bworking with children\b[^.!?]{0,12}\bblue\b/i,
    ],
    note:
      'One credential under several names. Queensland calls it a Blue Card and ' +
      'the corpus contains "Queensland Working with children check (Blue ' +
      'Card)" in a single sentence, which is the clearest possible evidence ' +
      'they are the same requirement. They resolve to one skill so that a ' +
      'reader filtering on it gets both, rather than having to know which ' +
      'word their state uses.\n\n' +
      'The bare phrase is deliberately not a pattern. "Are you passionate ' +
      'about working with children?" is an early-childhood advertisement ' +
      'describing the work, not a role asking for the card, and it was ' +
      'attaching the credential to a listing that never mentioned it.',
  },
  {
    name: "Driver's licence",
    normalizedName: 'drivers-licence',
    kind: 'CERTIFICATION',
    observed: 97,
    patterns: [
      /\b(?:driver'?s?|drivers) (?:licence|license)\b/i,
      /\b(?:open )?["'“‘]?C["'”’]? ?class (?:driver'?s? )?(?:licence|license)\b/i,
      // No trailing \b. A word boundary after ")" demands a word character
      // next, and the real sentence reads "Class C (car) motor vehicle", so
      // the pattern matched nothing on its own. It looked correct because the
      // one listing containing it also says "Driver Licence" earlier.
      /\bclass C \(car\)/i,
    ],
    note:
      'The class is not split out. A C class car licence is what almost every ' +
      'one of these means, and the few that want something heavier say so in ' +
      'wording this does not match.',
  },
  {
    name: 'Criminal history check',
    normalizedName: 'criminal-history-check',
    kind: 'CERTIFICATION',
    observed: 29,
    patterns: [
      /\b(?:criminal history|police|national police) (?:check|clearance|screening)\b/i,
    ],
    note:
      'Usually something the employer undertakes rather than something the ' +
      'applicant must already hold. Still worth attaching: it tells a reader ' +
      'the role is subject to one.',
  },
  {
    name: 'First aid certificate',
    normalizedName: 'first-aid-certificate',
    kind: 'CERTIFICATION',
    observed: 13,
    patterns: [/\bfirst aid\b/i],
  },
  {
    name: 'Forklift licence',
    normalizedName: 'forklift-licence',
    kind: 'CERTIFICATION',
    observed: 9,
    patterns: [/\bforklift\b/i],
  },
  {
    name: 'NDIS Worker Screening Check',
    normalizedName: 'ndis-worker-screening-check',
    kind: 'CERTIFICATION',
    observed: 5,
    patterns: [/\bNDIS worker(?:s)? (?:screening|check)\b/i],
  },
  {
    name: 'Responsible Service of Alcohol',
    normalizedName: 'responsible-service-of-alcohol',
    kind: 'CERTIFICATION',
    observed: 4,
    patterns: [/\bresponsible service of alcohol\b/i, /\bRSA\b/],
  },
  {
    name: 'Yellow Card',
    normalizedName: 'yellow-card',
    kind: 'CERTIFICATION',
    observed: 3,
    patterns: [/\byellow card\b/i],
    note:
      "Queensland's disability worker screening, and a different credential " +
      'from the Blue Card rather than a variant of it. Kept separate for that ' +
      'reason.',
  },
  {
    name: 'CPR certificate',
    normalizedName: 'cpr-certificate',
    kind: 'CERTIFICATION',
    observed: 2,
    patterns: [/\bCPR\b/, /\bcardiopulmonary resuscitation\b/i],
  },
  {
    name: 'Heavy vehicle licence',
    normalizedName: 'heavy-vehicle-licence',
    kind: 'CERTIFICATION',
    observed: 1,
    patterns: [
      /\b(?:HR|MR|HC|MC) (?:class )?(?:truck )?(?:licence|license)\b/,
      /\bheavy (?:rigid|combination) (?:licence|license)\b/i,
    ],
  },
  {
    name: 'Construction White Card',
    normalizedName: 'construction-white-card',
    kind: 'CERTIFICATION',
    observed: 1,
    patterns: [/\bwhite card\b/i, /\bconstruction induction (?:card|training)\b/i],
  },
];

/**
 * Named software and equipment.
 *
 * A tool is a proper noun, which makes it matchable, and the two entries below
 * that are not carry their own context to compensate.
 */
const TOOLS: readonly SkillDefinition[] = [
  {
    name: 'Microsoft Excel',
    normalizedName: 'microsoft-excel',
    kind: 'TOOL',
    observed: 21,
    patterns: [
      /\bmicrosoft excel\b/i,
      /\bMS ?Excel\b/i,
      // Bare "Excel" only where a neighbouring word settles that the
      // spreadsheet is meant. 47 listings contain the word; 21 mean the
      // program, and the rest are the verb.
      /\bexcel\b(?=[^.!?]{0,60}\b(?:word|outlook|powerpoint|spreadsheets?|microsoft|office)\b)/i,
      /\b(?:word|outlook|powerpoint|spreadsheets?|microsoft|office)\b[^.!?]{0,60}\bexcel\b/i,
    ],
    note: 'See the file header. This is the entry that proves bare words do not work.',
  },
  {
    name: 'Microsoft Office',
    normalizedName: 'microsoft-office',
    kind: 'TOOL',
    observed: 39,
    patterns: [/\bmicrosoft office\b/i, /\bMS ?Office\b/i, /\bOffice 365\b/i],
  },
  {
    name: 'SAP',
    normalizedName: 'sap',
    kind: 'TOOL',
    observed: 13,
    patterns: [/\bSAP\b/],
    note:
      'Case-sensitive on purpose. Lower-case "sap" is a different word, and ' +
      'this corpus includes outdoor and agricultural roles.',
  },
  {
    name: 'ServiceNow',
    normalizedName: 'servicenow',
    kind: 'TOOL',
    observed: 12,
    patterns: [/\bServiceNow\b/i],
    note:
      'Also the name of a company that advertises jobs. Eleven of the twelve ' +
      'listings are Queensland Health roles requiring the platform and the ' +
      'twelfth is ServiceNow, Inc. describing itself. The employer-name rule ' +
      'in extract.ts exists for this.',
  },
  {
    name: 'Power BI',
    normalizedName: 'power-bi',
    kind: 'TOOL',
    observed: 11,
    patterns: [/\bpower ?BI\b/i],
  },
  {
    name: 'Microsoft Azure',
    normalizedName: 'microsoft-azure',
    kind: 'TOOL',
    observed: 6,
    patterns: [/\bAzure\b/i],
  },
  {
    name: 'Salesforce',
    normalizedName: 'salesforce',
    kind: 'TOOL',
    observed: 2,
    patterns: [/\bSalesforce\b/i],
    note: 'Also an employer name. Same rule as ServiceNow.',
  },
  {
    name: 'Amazon Web Services',
    normalizedName: 'amazon-web-services',
    kind: 'TOOL',
    observed: 1,
    patterns: [/\bAWS\b/, /\bAmazon Web Services\b/i],
  },
];

/**
 * Technical practice rather than a named product.
 *
 * Thin, and honestly so. This corpus is public-sector health, care and trades;
 * it is not a technology job board, and a vocabulary pretending otherwise
 * would produce a facet that is empty on almost every search.
 */
const TECHNICAL: readonly SkillDefinition[] = [
  {
    name: 'SQL',
    normalizedName: 'sql',
    kind: 'TECHNICAL',
    observed: 10,
    patterns: [/\bSQL\b/],
  },
  {
    name: 'Python',
    normalizedName: 'python',
    kind: 'TECHNICAL',
    observed: 6,
    patterns: [/\bPython\b/],
  },
];

/**
 * Every skill this product recognises.
 *
 * Order is display order within a kind: most frequently observed first, which
 * is also roughly most useful first.
 */
export const skillVocabulary: readonly SkillDefinition[] = [
  ...CERTIFICATIONS,
  ...TOOLS,
  ...TECHNICAL,
];

/** Lookup by the stable key, built once. */
export const skillsByNormalizedName: ReadonlyMap<string, SkillDefinition> = new Map(
  skillVocabulary.map((skill) => [skill.normalizedName, skill]),
);
