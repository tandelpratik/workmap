import { findSourceDescriptor } from '@/config/sources';
import { lifecycle } from '@/config/lifecycle';
import { lifecycleLabel, lifecycleOf } from '@/domain/lifecycle';
import type { EmploymentType, JobListing, Salary } from '@/domain/job';
import { SponsorshipBadge } from './sponsorship-badge';
import { JobsworthLabel } from './adzuna-attribution';
import { link } from '@/components/ui/link';

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
        // Derived from dates the listing already carries, not read from a
        // column. See domain/lifecycle.ts.
        const state = lifecycleOf(job, lifecycle);
        const stateLabel = lifecycleLabel(state);

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
                className={link({ underline: 'hover' })}
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

            {job.description !== null ? (
              <p className="text-ink-muted max-w-measure mt-3 line-clamp-2 text-sm leading-relaxed">
                {job.description}
              </p>
            ) : job.descriptionWithheld ? (
              /*
                The advertisement has text and this source's rights matrix does
                not permit reproducing it. Saying so is the point: a blank space
                would read as an employer who wrote nothing, which is a claim
                about them rather than about us.
              */
              <p className="text-ink-faint max-w-measure mt-3 text-sm leading-relaxed">
                The advertisement text is not reproduced here. Read it in full on the
                original listing.
              </p>
            ) : null}

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
              {/*
                Where the listing is in its life, first, because it qualifies
                whether the rest is worth reading. Carried as words rather than
                as a colour: "not recently confirmed" is the message, and a
                reader who sees no colour at all still gets it. ACTIVE is
                deliberately unlabelled, since a badge on every row teaches a
                reader to stop looking at badges.
              */}
              {stateLabel === null ? null : (
                <span className={state === 'STALE' ? 'text-ink font-medium' : undefined}>
                  {stateLabel}
                </span>
              )}
              {job.employmentType === null ? null : (
                <span>{employmentLabels[job.employmentType]}</span>
              )}
              {job.contractTypeLabel === null ? null : (
                <span>{job.contractTypeLabel}</span>
              )}
              {job.categoryLabel === null ? null : <span>{job.categoryLabel}</span>}
              {/*
                Posted and verified are two different dates and both are shown.
                The first is the employer's, the second is the last time the
                source confirmed the advertisement was still there, and the
                second is the one that tells a reader whether the role is
                likely to still exist. Neither is the date this record was
                written, which is an internal fact and stays internal.
              */}
              {job.postedAt === null ? null : (
                <span>Posted {formatDate(job.postedAt)}</span>
              )}
              {job.lastVerifiedAt === null ? null : (
                <span>Verified {formatDate(job.lastVerifiedAt)}</span>
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
