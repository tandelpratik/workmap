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

  readonly termsUrl?: string;
  readonly methodologyUrl?: string;
  readonly homepageUrl?: string;

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
