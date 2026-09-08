/**
 * Source contracts (ADR-0001, ADR-0009).
 *
 * The domain owns these definitions. Adapters implement them and persistence
 * stores them, but neither gets to decide what a source is.
 *
 * The unions below intentionally do not import Prisma's generated enums.
 * Importing them would make the domain depend on the persistence layer, which
 * is the coupling ADR-0001 exists to prevent. A test asserts the two agree, so
 * the duplication cannot drift silently.
 */

export const sourceKinds = [
  'JOB_LISTING',
  'MARKET_INDICATOR',
  'GEOGRAPHY',
  'CLASSIFICATION',
] as const;
export type SourceKind = (typeof sourceKinds)[number];

/** Is the source turned on? */
export const sourceActivations = [
  'ACTIVE',
  'PENDING',
  'BLOCKED',
  'DEVELOPMENT_ONLY',
] as const;
export type SourceActivation = (typeof sourceActivations)[number];

/** Are we permitted to use it? */
export const complianceStatuses = [
  'VERIFIED',
  'UNVERIFIED',
  'RESTRICTED',
  'PROHIBITED',
] as const;
export type ComplianceStatus = (typeof complianceStatuses)[number];

export interface RateLimit {
  readonly requests: number;
  readonly perSeconds: number;
}

/**
 * What a licence permits, stated as a fact rather than as prose.
 *
 * These permissions were readable only inside a `notes` paragraph before, which
 * meant no test could assert them and no deployment gate could check them. A
 * permission only a human can read is a permission that drifts.
 *
 * `UNVERIFIED` is not a middle setting between yes and no. It means the question
 * has not been answered, and every gate here treats it as a refusal.
 */
export const permissions = ['PERMITTED', 'PROHIBITED', 'UNVERIFIED'] as const;
export type Permission = (typeof permissions)[number];

/**
 * Whether the right to use a source has been established, and on what evidence.
 *
 * Deliberately distinct from `complianceStatus`. That field is the operational
 * answer to "may this run in production?"; this one travels with the licence
 * itself and records whether the document behind that answer was actually read.
 */
export const rightsStatuses = ['ESTABLISHED', 'NEEDS_VERIFICATION', 'REFUSED'] as const;
export type RightsStatus = (typeof rightsStatuses)[number];

/** How the material physically arrives. */
export const retrievalMethods = [
  'API',
  'FILE_DOWNLOAD',
  'CRAWL',
  'MANUAL',
  'NONE',
] as const;
export type RetrievalMethod = (typeof retrievalMethods)[number];

/**
 * The licence, named and linked.
 *
 * Separated from `termsUrl`, which had been carrying two different kinds of
 * document: a Creative Commons deed for the open sources and a terms-of-service
 * contract for Adzuna. A reader following a link deserves to be told which of
 * those they are about to read, and an attribution line cannot name a licence
 * it was never given.
 */
export interface Licence {
  /** As the licensor names it, for example "CC BY 4.0". */
  readonly name: string;
  /** The deed or licence text itself. */
  readonly url: string;
  /** The copyright holder, worded as they require it to be stated. */
  readonly holder: string;
}

/**
 * What may be done with the material, and when that was last checked.
 *
 * Every field here is a claim this project would have to defend. None of it is
 * inferred from a publisher's general open-data policy: a policy covering a
 * website does not automatically cover every item published on it, which is the
 * distinction that keeps `iworkfor-nsw` unverified despite nsw.gov.au being
 * open.
 */
export interface SourceRights {
  readonly status: RightsStatus;
  readonly commercialUse: Permission;
  readonly redistribution: Permission;
  readonly adaptation: Permission;
  /**
   * Material the licence explicitly does not cover: coats of arms, logos, trade
   * marks, photographs, third-party content. Recorded because reproducing one
   * of these is a breach even when the dataset around it is entirely open.
   */
  readonly exclusions: readonly string[];
  /** ISO date the terms were last read. Null means never. */
  readonly lastVerified: string | null;
}

export interface Retrieval {
  readonly method: RetrievalMethod;
  /** How often, in a reader's words: "Monthly, on publication." */
  readonly frequency: string;
}

/**
 * The fields of a job advertisement, as rights are granted over them.
 *
 * A licence covering a page does not automatically cover every component
 * printed on it. An employer logo is a trade mark, a named contact with a direct
 * line is personal information, and application instructions may belong to the
 * platform rather than to the advertiser. Recording the position field by field
 * is what lets the product publish the parts it is sure of and withhold the
 * parts it is not, rather than making one all-or-nothing decision about the
 * whole advertisement.
 */
export const jobContentFields = [
  'title',
  'employer',
  'location',
  'salary',
  'employmentType',
  'postedAt',
  'closingDate',
  'description',
  'benefits',
  'contactDetails',
  'logo',
  'applicationInstructions',
] as const;
export type JobContentField = (typeof jobContentFields)[number];

/**
 * What may be done with one field of an advertisement.
 *
 *   PERMITTED           reproduce as the source published it
 *   SUMMARY_ONLY        describe in our own words; do not reproduce
 *   WITHHELD            do not publish, whatever the licence would allow
 *   NEEDS_VERIFICATION  the question is open, so nothing is published
 *
 * The last two reach the same outcome by different routes, and the difference
 * matters to whoever reads this next. `WITHHELD` is a decision someone made.
 * `NEEDS_VERIFICATION` is a decision nobody has made yet.
 */
export const contentRights = [
  'PERMITTED',
  'SUMMARY_ONLY',
  'WITHHELD',
  'NEEDS_VERIFICATION',
] as const;
export type ContentRight = (typeof contentRights)[number];

export type JobContentRights = Readonly<Partial<Record<JobContentField, ContentRight>>>;

/**
 * Everything the system needs to know about a source without talking to it.
 *
 * Compliance and activation are separate fields on purpose. Adzuna is the case
 * that proves they are different questions: nothing is known to be wrong with
 * its terms, and access is unavailable regardless.
 */
export interface SourceDescriptor {
  /** Stable identifier, used as the foreign key everywhere. */
  readonly key: string;
  /** Name shown when attributing the source to a reader. */
  readonly displayName: string;
  readonly kind: SourceKind;

  readonly activation: SourceActivation;
  readonly complianceStatus: ComplianceStatus;

  readonly attributionRequired: boolean;
  /** Required wording, stored verbatim so the UI cannot paraphrase a licence. */
  readonly attributionText?: string;

  /**
   * The terms of service or copyright statement governing use.
   *
   * Distinct from `licence`. This is the contract; that is the grant. For the
   * Creative Commons sources they are close to the same document, and for
   * Adzuna they are emphatically not.
   */
  readonly termsUrl?: string;
  readonly methodologyUrl?: string;
  readonly homepageUrl?: string;

  /** The grant itself. Absent where no licence has been established. */
  readonly licence?: Licence;

  /** What the grant permits, and when it was last read. */
  readonly rights?: SourceRights;

  /** How the material arrives, and how often. */
  readonly retrieval?: Retrieval;

  /**
   * Which fields of a job advertisement from this source may be republished.
   *
   * Only meaningful for `JOB_LISTING` sources. An unstated field is treated as
   * `NEEDS_VERIFICATION` and is therefore not published, so a source added
   * without this matrix publishes nothing rather than everything.
   */
  readonly jobContentRights?: JobContentRights;

  /** Absent means no documented limit, which is not the same as unlimited. */
  readonly rateLimit?: RateLimit;

  /**
   * Whether the licence permits publishing statistics derived from this
   * source: counts, averages, trends, anything aggregated.
   *
   * Separate from compliance status because it is a different question. Adzuna
   * is the case that proves it: its terms permit publishing individual ad
   * listings and, in the same breath, forbid using the data "in aggregation
   * (including but not limited to vacancy counts, average salaries etc) to
   * deliver any ongoing work" without written consent. A source can therefore
   * be fully verified and still be unusable for the heatmap.
   */
  readonly permitsDerivedAggregates: boolean;

  /** Why a source is blocked or restricted, for operators. */
  readonly notes?: string;
}

/**
 * The single gate. Both axes must permit use.
 *
 * No call site evaluates this itself. A source is eligible or it is not, and
 * the answer comes from here (ADR-0009).
 */
export function isProductionEligible(descriptor: SourceDescriptor): boolean {
  return descriptor.activation === 'ACTIVE' && descriptor.complianceStatus === 'VERIFIED';
}

/**
 * Whether a source may be used at all in the current process.
 *
 * Development-only sources are usable outside production and never inside it.
 * Everything else follows the production gate.
 */
export function isUsable(
  descriptor: SourceDescriptor,
  options: { readonly isProduction: boolean },
): boolean {
  if (descriptor.activation === 'DEVELOPMENT_ONLY') {
    return !options.isProduction;
  }
  return options.isProduction ? isProductionEligible(descriptor) : true;
}

/**
 * Whether aggregate figures may be computed from this source and published.
 *
 * Both gates apply: a source must be usable in production at all, and its
 * licence must permit aggregation. No call site decides this for itself, for
 * the same reason no call site evaluates production eligibility (ADR-0009).
 */
export function canPublishDerivedAggregates(descriptor: SourceDescriptor): boolean {
  return isProductionEligible(descriptor) && descriptor.permitsDerivedAggregates;
}

/**
 * The recorded position on one field of an advertisement from this source.
 *
 * An unstated field is `NEEDS_VERIFICATION` rather than permitted. That is the
 * direction which fails safely: adding a source and forgetting its rights
 * matrix withholds the advertisement's content rather than republishing an
 * employer's words on a basis nobody established.
 */
export function contentRightFor(
  descriptor: SourceDescriptor,
  field: JobContentField,
): ContentRight {
  return descriptor.jobContentRights?.[field] ?? 'NEEDS_VERIFICATION';
}

/**
 * Whether a field may be reproduced as the source published it.
 *
 * Both gates apply, for the same reason `canPublishDerivedAggregates` applies
 * both: a field-level grant means nothing if the source itself is not eligible
 * to be used at all. No call site evaluates either half for itself (ADR-0009).
 */
export function mayRepublishField(
  descriptor: SourceDescriptor,
  field: JobContentField,
): boolean {
  return (
    isProductionEligible(descriptor) && contentRightFor(descriptor, field) === 'PERMITTED'
  );
}

/**
 * Fields of an advertisement from this source that are not reproduced.
 *
 * Used to tell a reader what has been left out and why, rather than presenting
 * a withheld field as one the employer never filled in. The two are different
 * facts and the product must not collapse them (ADR-0002).
 */
export function withheldFields(descriptor: SourceDescriptor): readonly JobContentField[] {
  return jobContentFields.filter(
    (field) => contentRightFor(descriptor, field) !== 'PERMITTED',
  );
}

/** Explains, in one line, why a source cannot be used. Null when it can. */
export function ineligibilityReason(descriptor: SourceDescriptor): string | null {
  if (descriptor.activation === 'DEVELOPMENT_ONLY') {
    return 'Development fixture. Never eligible in production.';
  }
  if (descriptor.activation !== 'ACTIVE') {
    return `Activation is ${descriptor.activation}.`;
  }
  if (descriptor.complianceStatus !== 'VERIFIED') {
    return `Compliance status is ${descriptor.complianceStatus}. Terms must be verified before production use.`;
  }
  return null;
}
