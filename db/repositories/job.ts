import type { Prisma } from '@/db/generated/client/client';
import { getDatabase } from '../client';
import { isSyntheticAllowed } from '@/config/env';
import { findSourceDescriptor } from '@/config/sources';
import { mayRepublishField } from '@/domain/source';
import { isStateAbbreviation } from '@/domain/geography';
import type { Failure } from '@/lib/errors';
import { ok, type Result } from '@/lib/result';
import type {
  EmploymentType,
  JobListing,
  JobStatus,
  Salary,
  SalaryBasis,
  SalaryPeriod,
} from '@/domain/job';
import type { SkillAttachment } from '@/domain/skill';
import type { SponsorshipEvidence, SponsorshipSignal } from '@/domain/sponsorship';
import { unplaced } from '@/domain/regional';
import {
  compareSkills,
  skillVocabulary,
  type SkillDefinition,
} from '@/skills/vocabulary';
import type {
  ClassificationBasis,
  RegionalCategory,
  RegionalPlacement,
  RegionalStatus,
} from '@/domain/regional';

/**
 * Job repository.
 *
 * Returns domain listings, never Prisma rows (ADR-0001). Two rules are enforced
 * here rather than trusted to callers:
 *
 *   - synthetic records are excluded unless this process explicitly permits
 *     them, so a fixture cannot reach a public response (ADR-0009);
 *   - expired listings are excluded from search, because sending an applicant
 *     to a filled advert is the worst thing a job board can do.
 *
 * There are deliberately no aggregate queries here. Counts by region, by
 * employer or by category would be exactly the "aggregation (including but not
 * limited to vacancy counts, average salaries etc)" that the Adzuna terms
 * reserve for a written licence. The one count returned is the size of a
 * result set, which is part of paginating a search rather than a published
 * statistic.
 */

export interface JobSearchQuery {
  readonly text?: string;
  readonly location?: string;
  readonly category?: string;
  readonly employmentType?: EmploymentType;
  /**
   * Restrict to advertisements carrying a particular sponsorship finding.
   *
   * A filter over what advertisements say, not over who may apply. Filtering
   * to MENTIONED narrows the list to advertisements that mention sponsorship;
   * it does not assert that anyone is eligible for anything.
   */
  readonly sponsorship?: SponsorshipSignal;
  /**
   * Restrict to one source.
   *
   * A provenance filter, not a quality one. The two live sources are not
   * interchangeable: one is an aggregator's index of advertisements and the
   * other is a state government's own board, and a reader deciding how much
   * weight to give a listing may reasonably want only one of them.
   */
  readonly source?: string;
  /**
   * Restrict to advertisements by where they sit against the regional
   * instrument.
   *
   * Omitted means every advertisement, which is deliberately not what the pages
   * ask for: the jobs page defaults to REGIONAL and says so. The default lives
   * there rather than here, because a repository that quietly filtered would
   * make an unfiltered count impossible to obtain and hide the size of what is
   * being left out.
   *
   * UNKNOWN is selectable in its own right. Advertisements the product cannot
   * place are not failures to be hidden; they are a fifth of the corpus and a
   * reader is entitled to look at them knowing what they are.
   */
  readonly regional?: RegionalStatus;
  /**
   * Restrict to advertisements whose text names a particular skill.
   *
   * Keyed by the vocabulary's stable name, never by the display name, so
   * rewording a skill for readers cannot silently change what a saved search
   * returns.
   *
   * A filter over what an advertisement says, exactly as the sponsorship
   * filter is. It selects advertisements that mention the thing; it does not
   * assert the thing is mandatory, and it does not assert that an
   * advertisement without it has no such requirement. Most of this corpus
   * reaches us as an excerpt, so an absent skill is usually an absent
   * paragraph.
   */
  readonly skill?: string;
  /**
   * Restrict to advertisements posted within this many days.
   *
   * Measured from the employer's posting date, which every stored listing
   * carries, and never from when this site discovered it. A crawl backfilling a
   * corpus would otherwise make the whole of it look freshly posted.
   */
  readonly postedWithinDays?: number;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface JobSearchResult {
  readonly jobs: readonly JobListing[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

interface JobRow {
  id: string;
  title: string;
  sponsorshipSignal: string;
  /** JSON, so its shape is checked on the way out. See parseEvidence. */
  sponsorshipEvidence: unknown;
  description: string | null;
  descriptionIsExcerpt: boolean;
  employmentType: string | null;
  sourceContractType: string | null;
  salaryMin: { toString(): string } | null;
  salaryMax: { toString(): string } | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryBasis: string | null;
  sourceCategoryLabel: string | null;
  applyUrl: string;
  postedAt: Date | null;
  lastVerifiedAt: Date | null;
  firstSeenAt: Date;
  status: string;
  retrievedAt: Date;
  sourceKey: string;
  company: { name: string } | null;
  location: {
    rawText: string;
    stateCode: string | null;
    postcode: string | null;
    postcodeSource: string | null;
    regionalStatus: string;
    regionalCategory: string | null;
    regionalBasis: string;
  } | null;
  skills: {
    matchedText: string | null;
    skill: { name: string; normalizedName: string; kind: string };
  }[];
}

function toSalary(row: JobRow): Salary | null {
  if (row.salaryMin === null && row.salaryMax === null) return null;
  if (
    row.salaryCurrency === null ||
    row.salaryPeriod === null ||
    row.salaryBasis === null
  ) {
    // A figure without its currency, period or basis cannot be shown honestly,
    // so it is not shown at all (ADR-0002).
    return null;
  }

  return {
    min: row.salaryMin === null ? null : Number(row.salaryMin.toString()),
    max: row.salaryMax === null ? null : Number(row.salaryMax.toString()),
    currency: row.salaryCurrency,
    period: row.salaryPeriod as SalaryPeriod,
    basis: row.salaryBasis as SalaryBasis,
  };
}

/**
 * The provider's contract word, in sentence case for display.
 *
 * Only presented when it adds something: "permanent" alongside a full-time
 * schedule is the default assumption and saying it twice is noise, whereas
 * "contract" changes what someone is applying for.
 */
function contractLabel(value: string | null): string | null {
  if (value === null) return null;
  const normalised = value.trim().toLowerCase();
  if (normalised === '' || normalised === 'permanent') return null;
  return normalised.charAt(0).toUpperCase() + normalised.slice(1);
}

/**
 * Reads stored evidence back, defensively.
 *
 * The column is JSON, so its shape is not guaranteed by the database. Anything
 * unexpected yields an empty list rather than a partial quotation: showing a
 * mangled excerpt as an employer's words is worse than showing none.
 */
function parseEvidence(value: unknown): readonly SponsorshipEvidence[] {
  if (!Array.isArray(value)) return [];
  const out: SponsorshipEvidence[] = [];
  for (const item of value) {
    if (item === null || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const phrase = record['phrase'];
    /*
     * `sentence` is the field written now. `context` is what rows written
     * before the six-way split carry: a window of characters either side of
     * the phrase rather than the sentence it sat in.
     *
     * Both are read, because a reclassification run is a separate step from a
     * deployment and the gap between them is exactly when a reader would
     * otherwise see a label with its quotation missing. The old shape is a
     * worse quotation, not a wrong one.
     */
    const sentence = record['sentence'] ?? record['context'];
    if (typeof phrase !== 'string' || typeof sentence !== 'string') continue;
    out.push({ phrase, sentence });
  }
  return out;
}

/**
 * Whether this source's rights matrix permits reproducing advertisement text.
 *
 * Decided here rather than in a component, for the same reason the synthetic
 * and expiry rules are decided here: a rule enforced at one boundary is a rule,
 * and a rule enforced at each call site is a habit. An unknown source key
 * yields no descriptor and therefore no permission, which is the direction that
 * fails safely.
 */
function mayShowDescription(sourceKey: string): boolean {
  const descriptor = findSourceDescriptor(sourceKey);
  return descriptor !== undefined && mayRepublishField(descriptor, 'description');
}

/**
 * Where the advertisement sits, read off the location it was resolved to.
 *
 * A listing with no location row is unplaced rather than not regional. The two
 * are different facts and only one of them is about the job, which is the same
 * distinction the classifier itself refuses to collapse.
 *
 * The stored values are enums written by our own ingestion, so they are cast
 * rather than validated. The one thing worth defending against is the absence
 * of a location, which happens for real.
 */
function toPlacement(row: JobRow): RegionalPlacement {
  if (row.location === null) return unplaced;

  return {
    status: row.location.regionalStatus as RegionalStatus,
    category: row.location.regionalCategory as RegionalCategory | null,
    basis: row.location.regionalBasis as ClassificationBasis,
    postcode: row.location.postcode,
    postcodeIsDerived: row.location.postcodeSource === 'DERIVED_FROM_COORDINATES',
  };
}

/**
 * What the advertisement's own text named, in the order everything shows it.
 *
 * Sorted here rather than in the page, so the public API and the page agree
 * and neither has to know how a skill list is meant to read. The database has
 * no opinion about the order of a join, and an unordered list would reshuffle
 * itself between deployments for no reason a reader could see.
 *
 * `kind` is read from the row rather than looked up in the vocabulary. The two
 * are kept in step by `skills.vocabulary-in-step`, and reading the stored
 * value means a row whose vocabulary entry has been withdrawn still describes
 * itself rather than arriving with a hole in it.
 */
function toSkills(row: JobRow): readonly SkillAttachment[] {
  return row.skills
    .map((link) => ({
      name: link.skill.name,
      normalizedName: link.skill.normalizedName,
      kind: link.skill.kind as SkillAttachment['kind'],
      matchedText: link.matchedText,
    }))
    .sort(compareSkills);
}

function toDomain(row: JobRow): JobListing {
  const descriptionPermitted = mayShowDescription(row.sourceKey);

  return {
    id: row.id,
    title: row.title,
    sponsorship: {
      signal: row.sponsorshipSignal as SponsorshipSignal,
      // Stored as JSON, so it is validated on the way out rather than trusted.
      // A malformed value yields no evidence, which shows the label without a
      // quotation instead of rendering something we cannot vouch for.
      evidence: parseEvidence(row.sponsorshipEvidence),
    },
    companyName: row.company?.name ?? null,
    locationLabel: row.location?.rawText ?? null,
    stateCode: row.location?.stateCode ?? null,
    place: toPlacement(row),
    description: descriptionPermitted ? row.description : null,
    descriptionIsExcerpt: row.descriptionIsExcerpt,
    // Only withheld when there was something to withhold. A source we may not
    // quote and an advertisement with no text produce the same empty space, and
    // saying "withheld" over the second would be a claim about a listing that
    // never had a description.
    descriptionWithheld: !descriptionPermitted && row.description !== null,
    employmentType: row.employmentType as EmploymentType | null,
    contractTypeLabel: contractLabel(row.sourceContractType),
    salary: toSalary(row),
    categoryLabel: row.sourceCategoryLabel,
    applyUrl: row.applyUrl,
    postedAt: row.postedAt,
    lastVerifiedAt: row.lastVerifiedAt,
    firstSeenAt: row.firstSeenAt,
    status: row.status as JobStatus,
    skills: toSkills(row),
    sourceKey: row.sourceKey,
    retrievedAt: row.retrievedAt,
  };
}

const jobSelect = {
  id: true,
  sponsorshipSignal: true,
  sponsorshipEvidence: true,
  title: true,
  description: true,
  descriptionIsExcerpt: true,
  employmentType: true,
  sourceContractType: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  salaryPeriod: true,
  salaryBasis: true,
  sourceCategoryLabel: true,
  applyUrl: true,
  postedAt: true,
  lastVerifiedAt: true,
  firstSeenAt: true,
  status: true,
  retrievedAt: true,
  sourceKey: true,
  company: { select: { name: true } },
  location: {
    select: {
      rawText: true,
      stateCode: true,
      postcode: true,
      postcodeSource: true,
      regionalStatus: true,
      regionalCategory: true,
      regionalBasis: true,
    },
  },
  /*
   * What each advertisement's text named, with the words that named it.
   *
   * `matchedText` travels with the skill because the label on its own is our
   * reading of an advertisement and the label beside the advertisement's own
   * words is a quotation a reader can check, which is the settlement the
   * sponsorship evidence reached for the same reason.
   *
   * `method` is deliberately not selected. Whether a human or the batch pass
   * attached a skill is an operational fact about this product, not a fact
   * about the job, and publishing it would invite a reader to weigh two
   * attachments differently when the evidence for both is the same sentence.
   */
  skills: {
    select: {
      matchedText: true,
      skill: { select: { name: true, normalizedName: true, kind: true } },
    },
  },
} as const;

export async function searchJobs(
  query: JobSearchQuery = {},
): Promise<Result<JobSearchResult, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const page = Math.max(1, Math.trunc(query.page ?? 1));
  const pageSize = Math.min(
    Math.max(1, Math.trunc(query.pageSize ?? DEFAULT_PAGE_SIZE)),
    MAX_PAGE_SIZE,
  );

  const text = query.text?.trim();
  const location = query.location?.trim();

  /*
   * Every narrowing the caller asked for, as independent conditions.
   *
   * An array rather than one object, and that is a correctness fix rather than
   * a tidying. Spreading each filter into a single literal means two filters
   * that happen to reach for the same key silently overwrite each other, with
   * the last one written winning and no error anywhere. Two pairs were doing
   * exactly that:
   *
   *   - `regional` and `location` both wrote `location`. Any place search on
   *     the jobs page therefore discarded the area filter, and because the page
   *     defaults to regional and prints "Showing advertisements in a designated
   *     regional area" above the results, a search for Brisbane returned 887
   *     listings under a heading asserting they were regional, each carrying
   *     its own label saying they were not. The product contradicted itself on
   *     the same screen.
   *   - `regional: 'UNKNOWN'` and `text` both wrote `OR`. A keyword search
   *     inside the unplaced listings quietly widened to the whole corpus.
   *
   * Both were invisible because the collision produces a valid query returning
   * plausible rows. Conditions that cannot share a key cannot collide, so this
   * shape is what stops the next filter added here from doing it again, and
   * `skill` below was going to be the next one.
   */
  const conditions: Prisma.JobWhereInput[] = [];

  /*
   * The plain-string filters test truthiness rather than definedness, so an
   * empty string stays "no filter" instead of becoming "match the empty
   * string", which is how a cleared form control would otherwise return
   * nothing at all.
   */
  if (query.category) conditions.push({ sourceCategoryTag: query.category });
  if (query.source) conditions.push({ sourceKey: query.source });
  if (query.employmentType !== undefined) {
    conditions.push({ employmentType: query.employmentType });
  }
  if (query.sponsorship !== undefined) {
    conditions.push({ sponsorshipSignal: query.sponsorship });
  }

  /*
   * Where the advertisement sits against the instrument.
   *
   * UNKNOWN has to reach through the relation and past it at once: a listing
   * is unplaced either because the place it resolved to could not be settled,
   * or because it resolved to no place at all. Filtering only on the relation
   * would silently drop the second kind, which is the group most in need of
   * being visible.
   */
  if (query.regional !== undefined) {
    conditions.push(
      query.regional === 'UNKNOWN'
        ? {
            OR: [
              { location: { is: { regionalStatus: 'UNKNOWN' } } },
              { locationId: null },
            ],
          }
        : { location: { is: { regionalStatus: query.regional } } },
    );
  }

  /*
   * An advertisement whose text names this skill.
   *
   * `some` over the join, keyed by the vocabulary's stable name. The
   * attachment itself is the claim, and it was written by a pass that quotes
   * the words that produced it, so this filter inherits that evidence rather
   * than adding a judgement of its own.
   */
  if (query.skill) {
    conditions.push({
      skills: { some: { skill: { is: { normalizedName: query.skill } } } },
    });
  }

  if (query.postedWithinDays !== undefined) {
    conditions.push({
      postedAt: {
        gte: new Date(Date.now() - query.postedWithinDays * 24 * 60 * 60 * 1000),
      },
    });
  }

  /*
   * A location term is one of two questions, and answering the wrong one is
   * how "NT" came to return Queensland listings.
   *
   * A state abbreviation is matched against the resolved state and nothing
   * else. Two letters are a substring of a great many Australian place
   * names: "NT" sits inside Central, Mount and Sunshine, so a text match
   * for the Northern Territory returned Central West Qld. Anything else is a
   * place name, which is exactly what a substring match is for, and it keeps
   * matching the state code as well so "Queensland" still works.
   */
  if (location !== undefined && location !== '') {
    conditions.push(
      isStateAbbreviation(location)
        ? { location: { is: { stateCode: { equals: location.toUpperCase() } } } }
        : {
            location: {
              is: {
                OR: [
                  { rawText: { contains: location, mode: 'insensitive' } },
                  { stateCode: { equals: location.toUpperCase() } },
                ],
              },
            },
          },
    );
  }

  if (text !== undefined && text !== '') {
    conditions.push({
      OR: [
        { title: { contains: text, mode: 'insensitive' } },
        { description: { contains: text, mode: 'insensitive' } },
        { company: { is: { name: { contains: text, mode: 'insensitive' } } } },
      ],
    });
  }

  const where: Prisma.JobWhereInput = {
    status: 'ACTIVE',
    // One row per vacancy. A listing grouped as a duplicate keeps its record
    // and its provenance and stops competing with the row that represents it
    // (milestone 15). Everything ungrouped is canonical by default, so this
    // filter is inert until a duplicate is actually found.
    isCanonical: true,
    // Fixtures never reach a response unless this process is explicitly a
    // development one (ADR-0009).
    ...(isSyntheticAllowed() ? {} : { isSynthetic: false }),
    ...(conditions.length === 0 ? {} : { AND: conditions }),
  };

  const [rows, total] = await Promise.all([
    database.value.job.findMany({
      where,
      select: jobSelect,
      // Newest first, with undated adverts last rather than sorted as if they
      // were ancient.
      orderBy: [{ postedAt: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    database.value.job.count({ where }),
  ]);

  return ok({ jobs: rows.map(toDomain), total, page, pageSize });
}
export interface JobCategory {
  readonly tag: string;
  readonly label: string;
}
/**
 * Which sources currently hold listings.
 *
 * Deliberately without counts, for the same reason the category list is: a list
 * of sources is a filter vocabulary, and a list of sources with a number beside
 * each is a statistic about advertisement volumes by provider, which the Adzuna
 * terms do not permit us to publish.
 *
 * Read so the source filter can offer only what is actually there. A control
 * listing a source holding nothing is a control with a setting that always
 * returns nothing.
 */
export async function listIndexedSources(): Promise<Result<string[], Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  /*
   * groupBy rather than findMany with distinct.
   *
   * Prisma applies `distinct` in the application, so the findMany form asks the
   * database for every matching row's source key and throws almost all of them
   * away locally: 2,713 strings across the wire to learn that there are two
   * sources. groupBy compiles to a real GROUP BY and returns the two.
   *
   * The queries themselves are around a millisecond either way, so this is not
   * about time. It is about not paying to transfer a thousandfold more rows
   * than the answer needs, on a free tier that meters exactly that.
   */
  const rows = await database.value.job.groupBy({
    by: ['sourceKey'],
    where: {
      status: 'ACTIVE',
      isCanonical: true,
      ...(isSyntheticAllowed() ? {} : { isSynthetic: false }),
    },
  });

  return ok(
    rows
      .map((row) => row.sourceKey)
      .sort((a, b) =>
        (findSourceDescriptor(a)?.displayName ?? a).localeCompare(
          findSourceDescriptor(b)?.displayName ?? b,
        ),
      ),
  );
}

/**
 * Which skills any live advertisement actually names.
 *
 * Read so the skill control can offer only settings that can return something.
 * The vocabulary holds 22 entries and every one of them was measured against
 * the corpus before it was written, but that is a fact about the corpus on the
 * day it was written: a re-import, a retirement sweep or a tightened pattern
 * can empty one, and a control offering a skill nothing carries is a control
 * with a setting that always returns nothing.
 *
 * **Deliberately without counts**, exactly as `listIndexedSources` is, and for
 * the same reason. A list of skills is a filter vocabulary. A list of skills
 * with a number beside each is a statistic about what employers are asking
 * for, drawn from a corpus that includes Adzuna listings, and the Adzuna terms
 * reserve "aggregation (including but not limited to vacancy counts, average
 * salaries etc)" for a written licence. That a skill appears at all is what a
 * control needs; how often it appears is the part we may not publish.
 *
 * Even if the licence allowed it, the figure would be worth little: 383 of the
 * 403 skill-carrying listings are Queensland Government vacancies, so any
 * count would describe one state's public service rather than a labour market.
 *
 * Returned as the vocabulary's own entries, in the vocabulary's order, so the
 * control is grouped and worded from the single authority on what a skill is
 * called. A stored row whose vocabulary entry has been withdrawn is dropped
 * here rather than offered: its attachments are kept (the extraction pass
 * never cascades them away) but a filter naming a skill the product no longer
 * recognises would be offering a reader a definition it cannot explain.
 */
export async function listSkillsInUse(): Promise<
  Result<readonly SkillDefinition[], Failure>
> {
  const database = getDatabase();
  if (!database.ok) return database;

  /*
   * An existence test over the join rather than a group and count.
   *
   * It compiles to one EXISTS subquery, returns at most one row per skill, and
   * is the shape of the question: which skills does any live advertisement
   * name. A groupBy would compute the counts on the way to the same answer,
   * and a count computed is a count that can later be returned by somebody who
   * finds it already sitting there. The query that cannot produce the figure
   * is the one to write.
   */
  const named = await database.value.skill.findMany({
    where: {
      jobs: {
        some: {
          job: {
            status: 'ACTIVE',
            isCanonical: true,
            ...(isSyntheticAllowed() ? {} : { isSynthetic: false }),
          },
        },
      },
    },
    select: { normalizedName: true },
  });

  const present = new Set(named.map((row) => row.normalizedName));
  return ok(skillVocabulary.filter((skill) => present.has(skill.normalizedName)));
}

/**
 * When each source last confirmed its listings were still live.
 *
 * Keyed by source rather than reduced to one figure, because one figure was the
 * bug. The jobs page took Adzuna's most recent retrieval and printed it above a
 * page that might be showing Queensland listings crawled a week apart, which
 * told a reader something about freshness that was not true of what they were
 * looking at.
 *
 * `lastVerifiedAt` rather than `retrievedAt`: verified means the source
 * confirmed the advertisement, retrieved means this record was written. Only
 * the first is a statement about the job (ADR-0002).
 */
export async function lastVerifiedBySource(
  sourceKeys: readonly string[],
): Promise<Result<ReadonlyMap<string, Date>, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;
  if (sourceKeys.length === 0) return ok(new Map());

  const rows = await database.value.job.groupBy({
    by: ['sourceKey'],
    where: {
      sourceKey: { in: [...sourceKeys] },
      status: 'ACTIVE',
      ...(isSyntheticAllowed() ? {} : { isSynthetic: false }),
    },
    _max: { lastVerifiedAt: true },
  });

  const freshness = new Map<string, Date>();
  for (const row of rows) {
    const verified = row._max.lastVerifiedAt;
    if (verified !== null) freshness.set(row.sourceKey, verified);
  }

  return ok(freshness);
}
