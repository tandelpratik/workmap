import {
  type EmploymentType,
  type NormalizedJob,
  type Salary,
  type SalaryPeriod,
} from '@/domain/job';
import { adzunaJobSchema, type AdzunaJob, type AdzunaSearchResponse } from './types';

/**
 * Translates Adzuna payloads into domain listings.
 *
 * Everything provider-specific stops here: their field names, their 0/1
 * booleans, their two-axis contract vocabulary and their per-country currency
 * assumption. Nothing downstream knows any of it (ADR-0001).
 */

export const ADZUNA_SOURCE_KEY = 'adzuna';

/**
 * Adzuna's descriptions are always fragments.
 *
 * Their documentation states it plainly: "we currently only provide a snipped
 * of the job description in the response". Recorded on every record so the UI
 * can say so rather than presenting a truncated advert as the whole thing.
 */
const DESCRIPTION_IS_EXCERPT = true;

/**
 * Adzuna quotes salary as an annualised figure.
 *
 * Documented rather than inferred per record, and worth confirming against the
 * first live response: if it were wrong, every salary on the site would be
 * wrong by a factor of about 2,000, which is the kind of error nobody notices
 * because it is uniform.
 */
const SALARY_PERIOD: SalaryPeriod = 'YEAR';

/**
 * Currency by Adzuna country endpoint.
 *
 * A salary is meaningless without one, so a country not listed here yields no
 * salary rather than a number in an assumed currency.
 */
const currencyByCountry: Readonly<Record<string, string>> = {
  at: 'EUR',
  au: 'AUD',
  be: 'EUR',
  br: 'BRL',
  ca: 'CAD',
  ch: 'CHF',
  de: 'EUR',
  es: 'EUR',
  fr: 'EUR',
  gb: 'GBP',
  in: 'INR',
  it: 'EUR',
  mx: 'MXN',
  nl: 'EUR',
  nz: 'NZD',
  pl: 'PLN',
  sg: 'SGD',
  us: 'USD',
  za: 'ZAR',
};

const entities: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/**
 * Reduces provider markup to plain text.
 *
 * Adzuna wraps matched search terms in tags, so their strings are fragments of
 * HTML. Storing plain text means the value is never interpreted as markup
 * anywhere, which removes the injection question rather than answering it at
 * each render site. The trade is losing their emphasis, which is a search
 * artefact rather than part of the employer's advert.
 */
export function toPlainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (entity) => entities[entity.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readSalary(job: AdzunaJob, country: string): Salary | null {
  const min = job.salary_min ?? null;
  const max = job.salary_max ?? null;
  if (min === null && max === null) return null;

  const currency = currencyByCountry[country.toLowerCase()];
  if (currency === undefined) return null;

  return {
    min,
    max,
    currency,
    period: SALARY_PERIOD,
    // An Adzuna Jobsworth estimate is not an employer's figure and must never
    // be shown as one (ADR-0002). It also carries its own labelling obligation
    // under their terms.
    basis: job.salary_is_predicted === true ? 'SOURCE_ESTIMATED' : 'REPORTED',
  };
}

/**
 * Adzuna states two independent things: the schedule (full or part time) and
 * the contract relationship (permanent or contract). Both are kept.
 *
 * employmentType carries the schedule, which is what someone filters on, and
 * falls back to CONTRACT only when no schedule was stated. The relationship
 * itself is preserved verbatim in sourceContractType, so a part-time contract
 * role reads as both rather than as whichever one this function preferred.
 * Anything unrecognised yields null: an unmapped listing is recorded as
 * unmapped, never guessed.
 */
function readEmploymentType(job: AdzunaJob): EmploymentType | null {
  switch (job.contract_time?.toLowerCase()) {
    case 'full_time':
      return 'FULL_TIME';
    case 'part_time':
      return 'PART_TIME';
    default:
      return job.contract_type?.toLowerCase() === 'contract' ? 'CONTRACT' : null;
  }
}

function readPostedAt(job: AdzunaJob): Date | null {
  if (job.created === undefined) return null;
  const parsed = new Date(job.created);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function mapJob(job: AdzunaJob, country: string): NormalizedJob {
  const area = job.location?.area ?? [];
  const displayName = job.location?.display_name;
  const rawText = displayName ?? (area.length > 0 ? area.join(', ') : null);

  const description = job.description === undefined ? null : toPlainText(job.description);
  const companyName =
    job.company?.display_name === undefined ? null : job.company.display_name.trim();
  const categoryTag = job.category?.tag;

  return {
    sourceKey: ADZUNA_SOURCE_KEY,
    sourceId: job.id,
    title: toPlainText(job.title),
    description: description === '' ? null : description,
    descriptionFormat: description === null || description === '' ? null : 'TEXT',
    descriptionIsExcerpt: DESCRIPTION_IS_EXCERPT,
    company: companyName ? { name: companyName } : null,
    location:
      rawText === null
        ? null
        : {
            rawText,
            area,
            latitude: job.latitude ?? null,
            longitude: job.longitude ?? null,
          },
    employmentType: readEmploymentType(job),
    sourceContractType: job.contract_type ?? null,
    // Adzuna does not publish a remote indicator. Inferring one from words in
    // the title would be a guess presented as a filter.
    remoteType: null,
    salary: readSalary(job, country),
    // Kept exactly as given. The tracking parameters on it are how Adzuna
    // attributes the click, and stripping them would take their traffic while
    // publishing their listings.
    applyUrl: job.redirect_url,
    sourceUrl: job.redirect_url,
    postedAt: readPostedAt(job),
    category:
      categoryTag === undefined
        ? null
        : { tag: categoryTag, label: job.category?.label ?? categoryTag },
  };
}

export interface RejectedRecord {
  readonly sourceId: string | null;
  readonly reason: string;
  readonly raw: unknown;
}

export interface MappedPage {
  readonly jobs: readonly NormalizedJob[];
  readonly rejected: readonly RejectedRecord[];
  /** Adzuna's own count of matching ads, when they report one. */
  readonly totalMatching: number | null;
}

/**
 * Validates and maps a page of results.
 *
 * Each record is validated on its own so a single malformed advert is
 * quarantined rather than failing the page (ADR-0005). A listing without an
 * identifier, a title or a destination URL cannot be published, and those are
 * the only fields treated as required.
 */
export function mapSearchResponse(
  response: AdzunaSearchResponse,
  country: string,
): MappedPage {
  const jobs: NormalizedJob[] = [];
  const rejected: RejectedRecord[] = [];

  for (const raw of response.results) {
    const parsed = adzunaJobSchema.safeParse(raw);

    if (!parsed.success) {
      const candidate =
        typeof raw === 'object' && raw !== null && 'id' in raw
          ? String((raw as { id: unknown }).id)
          : null;

      rejected.push({
        sourceId: candidate,
        reason: parsed.error.issues
          .slice(0, 4)
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; '),
        raw,
      });
      continue;
    }

    jobs.push(mapJob(parsed.data, country));
  }

  return { jobs, rejected, totalMatching: response.count ?? null };
}
