import type { PrismaClient } from '@/db/generated/client/client';
import { getDatabase } from '@/db/client';
import { regionalAreas } from '@/config/regional-areas';
import { classifyPlace } from '@/domain/regional';
import { listUnresolvedGeographies } from '@/db/repositories/labour-market';
import { lifecycle } from '@/config/lifecycle';
import { findSourceDescriptor, sourceDescriptors } from '@/config/sources';
import { containsPersonalInformation } from '@/domain/personal-information';
import {
  contentRightFor,
  isProductionEligible,
  mayRepublishField,
  type JobContentField,
} from '@/domain/source';
import type { Failure } from '@/lib/errors';
import { ok, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';

/**
 * Data quality checks.
 *
 * Every invariant the product depends on but the schema cannot express. The
 * database already refuses a null value with a PRESENT state and a duplicate
 * `(source_key, source_id)`; those are constraints and they hold. These are the
 * rules that live above the schema: that a figure is not negative, that a date
 * is not in the future, that a listing's source is one we are permitted to
 * publish, that a sponsorship label has the words behind it.
 *
 * Each check answers one question and reports the count that failed plus a few
 * identifiers, never the offending content. A quality report is read in a
 * terminal and pasted into an issue, so it must not become a second copy of the
 * data it is checking.
 *
 * The point is that a source changing shape, or an import going subtly wrong,
 * shows up as a failed check rather than as a wrong number nobody notices. This
 * is also the first half of the deployment gate: a check that fails here is a
 * deployment that should not proceed.
 */

export type CheckStatus = 'PASS' | 'FAIL' | 'SKIPPED';

export interface CheckResult {
  readonly name: string;
  /** What the check would prove if it passed, in one line. */
  readonly asserts: string;
  readonly status: CheckStatus;
  /** Rows failing. Zero on a pass. */
  readonly failures: number;
  /** A handful of identifiers, so a failure can be investigated. Never content. */
  readonly examples: readonly string[];
  /** Why a check was skipped, or what a failure means. */
  readonly detail?: string;
}

export interface QualityReport {
  readonly checks: readonly CheckResult[];
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly ok: boolean;
}

/** Identifiers carried into a report, so one bad import is not a wall of text. */
const MAX_EXAMPLES = 5;

function pass(name: string, asserts: string, detail?: string): CheckResult {
  return {
    name,
    asserts,
    status: 'PASS',
    failures: 0,
    examples: [],
    ...(detail === undefined ? {} : { detail }),
  };
}

function fail(
  name: string,
  asserts: string,
  failures: number,
  examples: readonly string[],
  detail?: string,
): CheckResult {
  return {
    name,
    asserts,
    status: failures === 0 ? 'PASS' : 'FAIL',
    failures,
    examples: examples.slice(0, MAX_EXAMPLES),
    ...(detail === undefined ? {} : { detail }),
  };
}

type Database = PrismaClient;

/**
 * Counts are never negative.
 *
 * An advertisement count below zero is not a small error, it is evidence that a
 * column was parsed as something it is not. Checked on both the observation
 * table and the summary projection, because they are written by different code.
 */
async function noNegativeValues(db: Database): Promise<CheckResult[]> {
  const name = 'counts.non-negative';
  const asserts = 'No stored figure is below zero';

  const metrics = await db.labourMarketMetric.findMany({
    where: { value: { lt: 0 } },
    select: { id: true },
    take: MAX_EXAMPLES,
  });
  const summaries = await db.geographyMetric.findMany({
    where: { value: { lt: 0 } },
    select: { id: true },
    take: MAX_EXAMPLES,
  });

  return [
    fail(
      name,
      asserts,
      metrics.length + summaries.length,
      [...metrics, ...summaries].map((row) => row.id),
    ),
  ];
}

/**
 * A value exists if and only if the state says it was measured.
 *
 * A database CHECK enforces this (ADR-0002) and this asserts it anyway. The
 * constraint is the guarantee; the check is what notices if a migration ever
 * drops it.
 */
async function missingnessIsModelled(db: Database): Promise<CheckResult[]> {
  const orphanValues = await db.labourMarketMetric.findMany({
    where: {
      OR: [
        { value: { not: null }, valueState: { notIn: ['PRESENT', 'ZERO'] } },
        { value: null, valueState: { in: ['PRESENT', 'ZERO'] } },
      ],
    },
    select: { id: true },
    take: MAX_EXAMPLES,
  });

  return [
    fail(
      'metrics.missingness-modelled',
      'A figure is present exactly when its value state says it was measured',
      orphanValues.length,
      orphanValues.map((row) => row.id),
      'The CHECK constraint from ADR-0002 should make this impossible.',
    ),
  ];
}

/**
 * Every series that names a geography resolves to one that exists.
 *
 * Asked through the repository rather than with a query of its own. The two were
 * the same question written twice, and the repository's answer is the better
 * one: it names the codes that did not resolve and how many series each is
 * holding up, which is what an operator needs and what a bare count is not.
 */
async function geographyResolves(): Promise<CheckResult[]> {
  const watched = sourceDescriptors.filter(
    (descriptor) =>
      isProductionEligible(descriptor) && descriptor.kind === 'MARKET_INDICATOR',
  );

  let failures = 0;
  const examples: string[] = [];

  for (const descriptor of watched) {
    const unresolved = await listUnresolvedGeographies(descriptor.key);
    if (!unresolved.ok) continue;
    for (const dimension of unresolved.value) {
      failures += dimension.seriesCount;
      if (examples.length < MAX_EXAMPLES) {
        examples.push(
          `${descriptor.key}: ${dimension.code ?? dimension.name ?? 'unnamed'} (${String(
            dimension.seriesCount,
          )} series)`,
        );
      }
    }
  }

  return [
    fail(
      'geography.series-resolved',
      'Every series naming a region resolves to a real ASGS area',
      failures,
      examples,
      'An unresolved series keeps the publisher code and can be relinked without ' +
        're-importing, so this is a backlog item rather than corruption.',
    ),
  ];
}

/**
 * A geography drawn on the map has geometry; one without it is marked.
 *
 * Offshore and migratory areas exist as codes with no boundary. They must never
 * be given invented geometry, and they must never silently disappear either:
 * the check is that the flag matches the tier, not that every area has a shape.
 */
async function geographyHierarchyIsSound(db: Database): Promise<CheckResult[]> {
  const orphans = await db.geography.findMany({
    where: { parentId: null, level: { not: 'COUNTRY' } },
    select: { code: true, level: true },
    take: MAX_EXAMPLES,
  });
  const orphanCount = await db.geography.count({
    where: { parentId: null, level: { not: 'COUNTRY' } },
  });

  return [
    fail(
      'geography.hierarchy-complete',
      'Every area below the country has a parent',
      orphanCount,
      orphans.map((row) => `${row.level} ${row.code}`),
    ),
  ];
}

/** Occupations belong to a named classification version, never a bare code. */
async function occupationsAreClassified(db: Database): Promise<CheckResult[]> {
  const unversioned = await db.occupation.count({
    where: { OR: [{ classificationVersion: '' }, { name: '' }] },
  });

  return [
    fail(
      'occupations.classified',
      'Every occupation carries a classification version and a name',
      unversioned,
      [],
      'Occupation codes are never invented; an unmapped listing stays unmapped.',
    ),
  ];
}

/**
 * No two live listings point at the same advertisement.
 *
 * `(source_key, source_id)` is unique in the schema, so this looks for the
 * duplicate that constraint cannot see: the same advertisement reached through
 * two sources, which is what the duplicate grouping exists to collapse. A
 * survivor here means grouping has not run or has not matched.
 */
async function noDuplicateLiveListings(db: Database): Promise<CheckResult[]> {
  const rows = await db.job.groupBy({
    by: ['applyUrl'],
    where: { status: 'ACTIVE', isCanonical: true },
    _count: { _all: true },
    having: { applyUrl: { _count: { gt: 1 } } },
    // Prisma requires an ordering alongside `take` on a grouped query, and it
    // is wanted anyway: the worst offender first makes the examples useful.
    orderBy: { _count: { applyUrl: 'desc' } },
    take: MAX_EXAMPLES,
  });
  const duplicates = rows.reduce((total, row) => total + row._count._all - 1, 0);

  return [
    fail(
      'jobs.no-duplicate-live-listings',
      'No two canonical live listings share an application URL',
      duplicates,
      rows.map((row) => row.applyUrl),
      'Run npm run jobs:dedupe. Duplicates keep their row and their provenance; ' +
        'they only step out of search.',
    ),
  ];
}

/**
 * Dates are possible.
 *
 * A posting date in the future is a parse error somewhere: a day/month swap, or
 * a locale assumption. A verification date in the future is a clock problem. An
 * expiry before first sight is a lifecycle bug. None of these is visible in the
 * interface, and all of them corrupt freshness.
 */
async function datesArePossible(db: Database): Promise<CheckResult[]> {
  // A day of slack, because a source publishes in its own timezone and a
  // listing posted "tomorrow" in Brisbane is not evidence of anything wrong.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const futurePosted = await db.job.findMany({
    where: { postedAt: { gt: tomorrow } },
    select: { id: true },
    take: MAX_EXAMPLES,
  });
  const futurePostedCount = await db.job.count({ where: { postedAt: { gt: tomorrow } } });

  const futureVerified = await db.job.count({
    where: { lastVerifiedAt: { gt: tomorrow } },
  });

  const impossible = await db.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count FROM job
    WHERE expired_at IS NOT NULL AND expired_at < first_seen_at
  `;
  const expiredBeforeSeen = Number(impossible[0]?.count ?? 0);

  return [
    fail(
      'jobs.dates-possible',
      'No posting or verification date lies in the future, and nothing expired before it was seen',
      futurePostedCount + futureVerified + expiredBeforeSeen,
      futurePosted.map((row) => row.id),
      'A future posting date usually means a day and month were swapped.',
    ),
  ];
}

/**
 * A placement and the basis it rests on agree with each other.
 *
 * The product's headline filter reads `regional_status`, so a row where the
 * status and the basis disagree is a listing shown, or withheld, for a reason
 * nobody can state. These are the combinations the classifier cannot produce,
 * and each one means something upstream wrote a placement by hand:
 *
 *   - UNKNOWN with a basis, or a placement with basis NONE. A basis is the
 *     answer to "how was this decided", and an undecided row has no answer
 *     while a decided one must have one.
 *   - A basis of POSTCODE with no postcode. The postcode is the whole of the
 *     evidence, and a row claiming to have been looked up without the value it
 *     was looked up by is unfalsifiable.
 *   - NOT_REGIONAL decided by STATE. The state rule only ever concludes
 *     regional: it applies precisely where the instrument leaves no postcode in
 *     that state unlisted, so it cannot place anything outside the definition.
 *     A row like this would exclude a listing from a regional search on a rule
 *     that has no power to exclude anything.
 *   - A category on a row that is not regional. The categories are subdivisions
 *     of the definition, so a row outside it has neither.
 */
async function regionalPlacementIsCoherent(db: Database): Promise<CheckResult[]> {
  const rows = await db.$queryRaw<{ id: string; problem: string }[]>`
    SELECT id, problem FROM (
      SELECT id,
        CASE
          WHEN regional_status = 'UNKNOWN' AND regional_basis <> 'NONE'
            THEN 'unplaced but carries a basis'
          WHEN regional_status <> 'UNKNOWN' AND regional_basis = 'NONE'
            THEN 'placed but carries no basis'
          WHEN regional_basis = 'POSTCODE' AND postcode IS NULL
            THEN 'placed by postcode but holds no postcode'
          WHEN regional_status = 'NOT_REGIONAL' AND regional_basis = 'STATE'
            THEN 'excluded by a rule that can only include'
          WHEN regional_status <> 'REGIONAL' AND regional_category IS NOT NULL
            THEN 'not regional but carries a category'
          ELSE NULL
        END AS problem
      FROM location
    ) AS checked
    WHERE problem IS NOT NULL
    LIMIT 50
  `;

  return [
    fail(
      'regional.placement-coherent',
      'Every place agrees with itself about whether and how it was placed',
      rows.length,
      rows.map((row) => `${row.id}: ${row.problem}`),
      'A status and a basis that disagree mean a placement was written by ' +
        'something other than the classifier.',
    ),
  ];
}

/**
 * A placement names the instrument that decided it.
 *
 * The definition of a designated regional area is a legislative instrument and
 * instruments are amended. A row that does not say which one placed it cannot
 * be told apart from one placed under a version that no longer exists, so an
 * amendment would leave the corpus silently mixed and no way to find the half
 * that needed redoing.
 *
 * Unplaced rows are excluded: nothing decided them, so there is nothing to name.
 */
async function regionalPlacementIsAttributed(db: Database): Promise<CheckResult[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM location
    WHERE regional_status <> 'UNKNOWN'
      AND (regional_instrument IS NULL OR regional_classified_at IS NULL)
    LIMIT 50
  `;

  return [
    fail(
      'regional.placement-attributed',
      'Every placed location names the instrument that placed it, and when',
      rows.length,
      rows.map((row) => row.id),
      'An unattributed placement cannot be told from one made under a ' +
        'superseded version of the instrument.',
    ),
  ];
}

/**
 * A derived postcode says which boundary set derived it.
 *
 * A postcode the source published and one this product inferred from
 * coordinates are different kinds of fact, and the second inherits the limits
 * of whatever placed it: ABS postal areas approximate Australia Post postcodes
 * rather than reproducing them, and they are re-released. A row claiming a
 * derived postcode without naming the vintage that produced it is asserting an
 * inference nobody can reproduce or date.
 */
async function derivedPostcodeNamesItsReference(db: Database): Promise<CheckResult[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM location
    WHERE postcode_source = 'DERIVED_FROM_COORDINATES'
      AND postcode_reference IS NULL
    LIMIT 50
  `;

  return [
    fail(
      'regional.derived-postcode-sourced',
      'Every postcode inferred from coordinates names the boundary set that placed it',
      rows.length,
      rows.map((row) => row.id),
      'An inference without its reference cannot be reproduced or dated.',
    ),
  ];
}

/**
 * Every stored postcode is four digits.
 *
 * The classifier is strict about this, and deliberately so: a lenient parser
 * turns a malformed value into a confident wrong answer rather than an absent
 * one. That strictness only protects the product if the column cannot hold
 * something the classifier would refuse, because a three-digit postcode would
 * not fail, it would silently make a place unplaceable while looking placed.
 */
async function storedPostcodesAreWellFormed(db: Database): Promise<CheckResult[]> {
  const rows = await db.$queryRaw<{ id: string; postcode: string }[]>`
    SELECT id, postcode FROM location
    WHERE postcode IS NOT NULL AND postcode !~ '^[0-9]{4}$'
    LIMIT 50
  `;

  return [
    fail(
      'regional.postcode-well-formed',
      'Every stored postcode is four digits, which is what the instrument uses',
      rows.length,
      rows.map((row) => `${row.id}: ${row.postcode}`),
      'The classifier refuses anything else, so a malformed value makes a ' +
        'place unplaceable while appearing to be placed.',
    ),
  ];
}

/**
 * The stored placement still agrees with the instrument.
 *
 * The checks above are about a row's internal consistency. This one re-reads
 * the instrument: every location placed by postcode or by state is classified
 * again from its own stored postcode and state, and the answer must match what
 * is stored.
 *
 * It is the check that would catch the failure that matters most, which is a
 * mistyped digit in the transcription of a statute. The unit tests assert the
 * transcription's shape exhaustively; this asserts that the corpus was actually
 * classified under the transcription the code currently holds, which is a
 * different claim and the one that goes stale after an amendment or a
 * half-finished backfill.
 *
 * Rows placed by region are excluded, and that exclusion is the point rather
 * than an oversight: their answer comes from every postcode inside a named
 * region agreeing, which is a relationship between two boundary sets and not
 * something a single row's columns can reproduce. They are covered by
 * `regional.placement-coherent` and by their own unit tests.
 */
async function storedPlacementMatchesInstrument(db: Database): Promise<CheckResult[]> {
  const rows = await db.location.findMany({
    where: { regionalBasis: { in: ['POSTCODE', 'STATE'] } },
    select: {
      id: true,
      postcode: true,
      stateCode: true,
      regionalStatus: true,
      regionalBasis: true,
    },
  });

  const wrong: string[] = [];
  for (const row of rows) {
    // Classified from the same two columns the original pass used, so a
    // mismatch is a change in the reference or a row nothing re-read.
    const expected = classifyPlace(regionalAreas, {
      postcode: row.regionalBasis === 'POSTCODE' ? row.postcode : null,
      jurisdiction: row.stateCode,
    });
    if (expected.status !== row.regionalStatus) {
      wrong.push(
        `${row.id}: stored ${row.regionalStatus}, instrument says ${expected.status}`,
      );
    }
    if (wrong.length >= MAX_EXAMPLES) break;
  }

  return [
    fail(
      'regional.matches-instrument',
      'Every location placed by postcode or state still reads that way against the instrument',
      wrong.length,
      wrong,
      'A mismatch means the reference changed, or a backfill did not finish. ' +
        'Run npm run regional:classify.',
    ),
  ];
}

/**
 * A sponsorship label has the words that produced it.
 *
 * The label is a report of what an advertisement said, and a label without its
 * quotation is our claim rather than the employer's statement. INDETERMINATE
 * and NOT_MENTIONED are findings about absence and correctly carry no evidence;
 * the other four must be able to show their working.
 *
 * The list is written out rather than expressed as "everything else", so that
 * adding a signal to the enum without deciding whether it needs evidence fails
 * this check rather than silently escaping it.
 */
async function sponsorshipIsEvidenced(db: Database): Promise<CheckResult[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM job
    WHERE sponsorship_signal IN ('OFFERED', 'OPEN_TO', 'MAY_BE_CONSIDERED', 'EXCLUDED')
      AND (
        sponsorship_evidence IS NULL
        OR jsonb_array_length(sponsorship_evidence::jsonb) = 0
      )
    LIMIT 50
  `;

  return [
    fail(
      'sponsorship.evidenced',
      'Every sponsorship finding about what an advertisement said quotes the wording',
      rows.length,
      rows.map((row) => row.id),
      'A label without its quotation is our claim, not the employer’s statement.',
    ),
  ];
}

/**
 * Every stored listing comes from a source we are permitted to publish.
 *
 * Two failures are possible and they are different. A listing whose source key
 * is not in the registry is orphaned data. A listing from a real source that is
 * no longer production eligible is data we must stop serving, which is what the
 * Adzuna purge script exists for.
 */
async function everyListingHasALicensedSource(db: Database): Promise<CheckResult[]> {
  const rows = await db.job.groupBy({
    by: ['sourceKey'],
    where: { status: 'ACTIVE' },
    _count: { _all: true },
  });

  const unknown: string[] = [];
  const ineligible: string[] = [];
  let unknownCount = 0;
  let ineligibleCount = 0;

  for (const row of rows) {
    const descriptor = findSourceDescriptor(row.sourceKey);
    if (descriptor === undefined) {
      unknown.push(row.sourceKey);
      unknownCount += row._count._all;
      continue;
    }
    if (!isProductionEligible(descriptor)) {
      ineligible.push(row.sourceKey);
      ineligibleCount += row._count._all;
    }
  }

  return [
    fail(
      'licensing.source-registered',
      'Every live listing comes from a source in the registry',
      unknownCount,
      unknown,
    ),
    fail(
      'licensing.source-eligible',
      'Every live listing comes from a source still permitted in production',
      ineligibleCount,
      ineligible,
      'A source that has lost eligibility must have its listings purged, not hidden.',
    ),
  ];
}

/**
 * Nothing is stored that the rights matrix does not permit publishing.
 *
 * The repository withholds a refused field at read time, so a reader never sees
 * one. This is the stronger statement: it should not be in the database either,
 * because a withheld field sitting in a column is one export away from being
 * published by something that never consulted the gate.
 */
async function storedContentIsPublishable(db: Database): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const descriptor of sourceDescriptors) {
    if (descriptor.kind !== 'JOB_LISTING') continue;
    if (mayRepublishField(descriptor, 'description')) continue;

    const stored = await db.job.count({
      where: { sourceKey: descriptor.key, description: { not: null } },
    });
    if (stored === 0) continue;

    results.push(
      fail(
        `rights.description-withheld.${descriptor.key}`,
        `No description is stored for ${descriptor.key}, whose rights matrix refuses it`,
        stored,
        [descriptor.key],
      ),
    );
  }

  return results.length > 0
    ? results
    : [
        pass(
          'rights.description-withheld',
          'No description is stored for a source whose rights matrix refuses it',
        ),
      ];
}

/**
 * No stored description carries recognisable contact details.
 *
 * Ingestion removes them before writing, so this proves the filter is actually
 * on the write path rather than merely existing. It reads every description,
 * which is the most expensive check here and the reason the sweep is worth
 * running separately rather than on every deploy.
 */
async function noPersonalInformationStored(db: Database): Promise<CheckResult[]> {
  const BATCH = 500;
  let cursor: string | undefined;
  let failures = 0;
  const examples: string[] = [];

  for (;;) {
    const rows = await db.job.findMany({
      where: { description: { not: null } },
      select: { id: true, description: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor === undefined ? {} : { cursor: { id: cursor }, skip: 1 }),
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1]?.id;

    for (const row of rows) {
      if (row.description === null) continue;
      if (!containsPersonalInformation(row.description)) continue;
      failures += 1;
      if (examples.length < MAX_EXAMPLES) examples.push(row.id);
    }

    if (rows.length < BATCH) break;
  }

  return [
    fail(
      'privacy.no-contact-details-stored',
      'No stored description carries an email address or telephone number',
      failures,
      examples,
      'Run npm run jobs:redact -- --apply.',
    ),
  ];
}

/**
 * Every source whose licence demands attribution can actually supply it.
 *
 * A registry entry marked `attributionRequired` with no `attributionText` is a
 * licence obligation the interface cannot meet, and it fails silently: the
 * colophon renders the display name and nobody notices the notice is gone.
 */
async function attributionIsAvailable(): Promise<CheckResult[]> {
  const missing = sourceDescriptors
    // Only sources that can actually reach a reader. A blocked source with
    // `attributionRequired` is recording what would be owed if it were ever
    // switched on, which is a real fact and not an unmet obligation: nothing it
    // holds is displayed. Requiring the wording now would report six permanent
    // failures and teach everyone to ignore this check.
    .filter((descriptor) => isProductionEligible(descriptor))
    .filter((descriptor) => descriptor.attributionRequired)
    .filter((descriptor) => {
      // Adzuna's obligation is a rendered label with a logo, satisfied by its
      // own component, so the stored string is its accessible text rather than
      // the whole notice.
      if (descriptor.key === 'adzuna') return false;
      return descriptor.attributionText === undefined;
    })
    .map((descriptor) => descriptor.key);

  const licensedWithoutLink = sourceDescriptors
    .filter((descriptor) => descriptor.rights?.status === 'ESTABLISHED')
    .filter((descriptor) => descriptor.key !== 'synthetic')
    .filter((descriptor) => descriptor.licence === undefined)
    .map((descriptor) => descriptor.key);

  return [
    fail(
      'attribution.text-available',
      'Every source requiring attribution stores the wording verbatim',
      missing.length,
      missing,
    ),
    fail(
      'attribution.licence-linkable',
      'Every source with established rights names a licence the interface can link',
      licensedWithoutLink.length,
      licensedWithoutLink,
      'CC BY requires a link to the licence, not only its name.',
    ),
  ];
}

/**
 * Every live listing source says what may be reproduced from an advertisement.
 *
 * The field gate already fails closed, so an undescribed source would publish
 * nothing rather than something it should not. This is the other half: a source
 * that reaches production with no rights matrix has silently become a source
 * whose listings appear as titles and nothing else, and the licensing page
 * would describe it as establishing nothing. Both are bugs, and neither shows
 * up as an error.
 *
 * The four fields checked are the ones a listing is useless without. A source
 * genuinely permitted to publish none of them should not be activated.
 */
async function listingSourcesDescribeTheirContent(): Promise<CheckResult[]> {
  const required: readonly JobContentField[] = [
    'title',
    'employer',
    'location',
    'description',
  ];

  const undescribed = sourceDescriptors
    .filter((descriptor) => descriptor.kind === 'JOB_LISTING')
    .filter((descriptor) => isProductionEligible(descriptor))
    .filter((descriptor) =>
      required.some(
        (field) => contentRightFor(descriptor, field) === 'NEEDS_VERIFICATION',
      ),
    )
    .map((descriptor) => descriptor.key);

  return [
    fail(
      'rights.listing-content-described',
      'Every live listing source states a position on the fields a listing needs',
      undescribed.length,
      undescribed,
      'An unstated field is withheld, so this source publishes less than it appears to.',
    ),
  ];
}

/**
 * Freshness thresholds are ordered.
 *
 * Not a query, and it belongs here anyway: a configuration where listings are
 * marked stale before the crawler was ever going to revisit them would mark the
 * whole corpus stale on a schedule of our own making, and the symptom would look
 * like a source problem.
 */
async function lifecycleThresholdsAreOrdered(): Promise<CheckResult[]> {
  const ordered =
    lifecycle.newWithinDays < lifecycle.staleAfterDays &&
    lifecycle.staleAfterDays >= lifecycle.refreshAfterDays &&
    lifecycle.staleAfterDays < lifecycle.expireAfterDays;

  return [
    fail(
      'lifecycle.thresholds-ordered',
      'New precedes stale, stale is no shorter than the refresh interval, and expiry follows both',
      ordered ? 0 : 1,
      [],
      `new ${String(lifecycle.newWithinDays)}, refresh ${String(
        lifecycle.refreshAfterDays,
      )}, stale ${String(lifecycle.staleAfterDays)}, expire ${String(
        lifecycle.expireAfterDays,
      )}`,
    ),
  ];
}

const CHECKS = [
  noNegativeValues,
  missingnessIsModelled,
  geographyResolves,
  geographyHierarchyIsSound,
  occupationsAreClassified,
  noDuplicateLiveListings,
  datesArePossible,
  sponsorshipIsEvidenced,
  regionalPlacementIsCoherent,
  regionalPlacementIsAttributed,
  derivedPostcodeNamesItsReference,
  storedPostcodesAreWellFormed,
  storedPlacementMatchesInstrument,
  everyListingHasALicensedSource,
  storedContentIsPublishable,
  noPersonalInformationStored,
] as const;

/** Checks that need no database, so they run even with nothing configured. */
const OFFLINE_CHECKS = [
  attributionIsAvailable,
  listingSourcesDescribeTheirContent,
  lifecycleThresholdsAreOrdered,
] as const;

export async function runQualityChecks(): Promise<Result<QualityReport, Failure>> {
  const checks: CheckResult[] = [];

  for (const check of OFFLINE_CHECKS) {
    checks.push(...(await check()));
  }

  const database = getDatabase();
  if (!database.ok) {
    checks.push({
      name: 'database',
      asserts: 'A database is reachable',
      status: 'SKIPPED',
      failures: 0,
      examples: [],
      detail: 'No database configured, so every stored-data check was skipped.',
    });
  } else {
    for (const check of CHECKS) {
      checks.push(...(await check(database.value)));
    }
  }

  const passed = checks.filter((check) => check.status === 'PASS').length;
  const failed = checks.filter((check) => check.status === 'FAIL').length;
  const skipped = checks.filter((check) => check.status === 'SKIPPED').length;

  logger.info('Data quality checks complete', { passed, failed, skipped });

  return ok({ checks, passed, failed, skipped, ok: failed === 0 });
}
