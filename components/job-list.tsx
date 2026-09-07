import { findSourceDescriptor } from '@/config/sources';
import type { EmploymentType, JobListing, Salary } from '@/domain/job';
import { SponsorshipBadge } from './sponsorship-badge';
import { JobsworthLabel } from './adzuna-attribution';

/**
 * The results list.
 *
 * An editorial index: hairlines, one column, typography carrying the
 * hierarchy. Not a grid of cards. Every listing states where it came from and
 * whether the salary was quoted by the employer or estimated by the provider,
 * because a reader cannot judge a figure without knowing which it is
 * (ADR-0002).
 *
 * Naming the source on each listing is provenance, not decoration. Two
 * licensed sources are live and they are not interchangeable: one is an
 * aggregator's index of advertisements, the other is a state government's own
 * board. A reader deciding how much weight to give a listing needs to know
 * which they are looking at.
 *
 * The salary sits directly under the employer rather than at the foot of the
 * entry, because it is the second thing anyone looks for and burying it under
 * the description made every row scan the same.
 */

const employmentLabels: Record<EmploymentType, string> = {
  FULL_TIME: 'Full time',
  PART_TIME: 'Part time',
  CASUAL: 'Casual',
  CONTRACT: 'Contract',
  TEMPORARY: 'Temporary',
  INTERNSHIP: 'Internship',
  APPRENTICESHIP: 'Apprenticeship',
};

const periodLabels = {
  HOUR: 'an hour',
  DAY: 'a day',
  WEEK: 'a week',
  MONTH: 'a month',
  YEAR: 'a year',
} as const;

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatSalary(salary: Salary): string {
  const { min, max, currency, period } = salary;
  const suffix = periodLabels[period];

  if (min !== null && max !== null) {
    return min === max
      ? `${formatMoney(min, currency)} ${suffix}`
      : `${formatMoney(min, currency)} to ${formatMoney(max, currency)} ${suffix}`;
  }
  if (min !== null) return `From ${formatMoney(min, currency)} ${suffix}`;
  if (max !== null) return `Up to ${formatMoney(max, currency)} ${suffix}`;
  return '';
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Australia/Sydney',
  }).format(date);
}

export function JobList({ jobs }: { jobs: readonly JobListing[] }) {
  return (
    <ol className="border-rule-heavy mt-8 border-t-2">
      {jobs.map((job) => {
        const salary = job.salary === null ? null : formatSalary(job.salary);
        const source = findSourceDescriptor(job.sourceKey);

        return (
          <li key={job.id} className="border-rule border-b py-6">
            <h3 className="font-serif text-xl leading-snug font-semibold">
              <a
                href={job.applyUrl}
                target="_blank"
                // noreferrer is deliberately absent: the link carries Adzuna's
                // own tracking parameters and referrer, which is how they
                // attribute the click we owe them for the listing.
                rel="noopener"
                className="text-ink hover:text-accent underline-offset-4 hover:underline"
              >
                {job.title}
              </a>
            </h3>

            <p className="text-ink-muted mt-1.5 text-sm">
              {job.companyName ?? 'Employer not stated'}
              {job.locationLabel === null ? null : (
                <>
                  <span className="text-ink-faint"> · </span>
                  {job.locationLabel}
                  {/* Their display_name stops at the suburb, so the state is
                      added from the resolved location rather than left off. */}
                  {job.stateCode === null ? null : `, ${job.stateCode}`}
                </>
              )}
            </p>

            {salary === null ? null : (
              <p className="tabular text-ink mt-2 text-sm font-medium">
                {salary}
                {job.salary?.basis === 'SOURCE_ESTIMATED' ? (
                  <>
                    <span className="text-ink-faint font-normal"> · </span>
                    <JobsworthLabel />
                  </>
                ) : null}
              </p>
            )}

            {job.description === null ? null : (
              <p className="text-ink-muted max-w-measure mt-3 line-clamp-2 text-sm leading-relaxed">
                {job.description}
              </p>
            )}

            {/*
              What the advertisement said about sponsorship, with the wording
              that said it. Placed above the metadata rather than among it,
              because a quotation from an employer is not a tag.
            */}
            <div className="mt-3">
              <SponsorshipBadge
                signal={job.sponsorship.signal}
                evidence={job.sponsorship.evidence}
              />
            </div>

            <p className="text-ink-faint text-label mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono uppercase">
              {job.employmentType === null ? null : (
                <span>{employmentLabels[job.employmentType]}</span>
              )}
              {job.contractTypeLabel === null ? null : (
                <span>{job.contractTypeLabel}</span>
              )}
              {job.categoryLabel === null ? null : <span>{job.categoryLabel}</span>}
              {job.postedAt === null ? null : (
                <span>Posted {formatDate(job.postedAt)}</span>
              )}
              {job.descriptionIsExcerpt && job.description !== null ? (
                <span>Excerpt</span>
              ) : null}
              {/* Provenance, last, because it qualifies everything above it. */}
              <span className="text-ink-muted">
                {source?.displayName ?? job.sourceKey}
              </span>
            </p>
          </li>
        );
      })}
    </ol>
  );
}
