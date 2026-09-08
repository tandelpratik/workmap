import { findSourceDescriptor } from '@/config/sources';
import type { SourceDescriptor } from '@/domain/source';
import { AdzunaAttribution } from '@/components/adzuna-attribution';
import { link } from '@/components/ui/link';

/**
 * One source, credited as its licence requires.
 *
 * Attribution was previously a single stored sentence rendered as a single
 * stored sentence, which met the wording obligation and quietly missed a
 * structural one: CC BY requires a *link* to the licence as well as its name,
 * and there was nowhere for that link to come from. Splitting the licence off
 * the terms document gave it somewhere, and this component is what renders it.
 *
 * The required wording is still printed verbatim, exactly as the registry
 * stores it. Nothing here paraphrases, summarises or reflows a licence
 * condition; the structured line beneath it adds the facts the sentence cannot
 * carry, which are the ones a researcher tracing a number actually needs: which
 * dataset, from when, and when this project last read the terms.
 *
 * Adzuna is the one special case, and it stays inside this component rather
 * than being handled by every caller. Their terms mandate a rendered label with
 * a logo and two links rather than a sentence, so the component that satisfies
 * that requirement is substituted for the wording here.
 */

/** A source, optionally narrowed to the dataset and period a page is showing. */
export interface SourceCitation {
  readonly key: string;
  /** The named dataset within the source, when a page draws on one. */
  readonly dataset?: string;
  /** The reference period, in the reader's words: "July 2026". */
  readonly referencePeriod?: string;
}

const verifiedFormat = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * Renders an ISO date, or nothing if it is not one.
 *
 * The registry stores these by hand, so a malformed value is possible. Printing
 * "Invalid Date" beside a licence claim would be worse than printing nothing.
 */
function formatVerified(iso: string): string | null {
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : verifiedFormat.format(date);
}

function Facts({
  descriptor,
  citation,
}: {
  descriptor: SourceDescriptor;
  citation: SourceCitation;
}) {
  const verified =
    descriptor.rights?.lastVerified == null
      ? null
      : formatVerified(descriptor.rights.lastVerified);

  const items: React.ReactNode[] = [];

  if (citation.dataset !== undefined) {
    items.push(<span key="dataset">{citation.dataset}</span>);
  }
  if (citation.referencePeriod !== undefined) {
    items.push(<span key="period">{citation.referencePeriod}</span>);
  }
  if (descriptor.licence !== undefined) {
    items.push(
      <span key="licence">
        Licence{' '}
        <a
          href={descriptor.licence.url}
          target="_blank"
          rel="noopener noreferrer"
          className={link()}
        >
          {descriptor.licence.name}
        </a>
      </span>,
    );
  }
  if (verified !== null) {
    items.push(<span key="verified">Terms read {verified}</span>);
  }

  if (items.length === 0) return null;

  return (
    <p className="text-ink-faint mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {items.map((item, index) => (
        // The separator is a rendered character rather than a border, so it
        // wraps with the item it follows instead of stranding a rule on a line
        // of its own.
        <span key={index} className="flex items-center gap-x-2">
          {index === 0 ? null : <span aria-hidden="true">·</span>}
          {item}
        </span>
      ))}
    </p>
  );
}

export function DataAttribution({ citation }: { citation: SourceCitation }) {
  const descriptor = findSourceDescriptor(citation.key);
  if (descriptor === undefined) return null;

  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[13rem_minmax(0,1fr)]">
      <dt className="text-ink text-xs font-medium">
        {descriptor.homepageUrl === undefined ? (
          descriptor.displayName
        ) : (
          <a
            href={descriptor.homepageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={link()}
          >
            {descriptor.displayName}
          </a>
        )}
      </dt>
      <dd className="text-ink-faint text-xs leading-relaxed">
        {descriptor.key === 'adzuna' ? (
          <AdzunaAttribution />
        ) : (
          (descriptor.attributionText ?? descriptor.displayName)
        )}
        <Facts descriptor={descriptor} citation={citation} />
      </dd>
    </div>
  );
}
