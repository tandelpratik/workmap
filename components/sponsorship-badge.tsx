import {
  sponsorshipLabel,
  type SponsorshipEvidence,
  type SponsorshipSignal,
} from '@/domain/sponsorship';

/**
 * What an advertisement said about sponsorship, with the words that said it.
 *
 * The evidence is not an optional extra. A label on its own is our
 * characterisation of an employer; a label beside the employer's own sentence
 * is a quotation the reader can check, and the link to the original is how
 * they check it.
 *
 * Nothing here addresses the reader's circumstances. There is no "you may be
 * eligible", no visa subclass, no likelihood. The product reports wording and
 * points at official sources for anything further.
 */

/** Shape is carried by more than colour, per the accessibility rules. */
const STYLES: Record<SponsorshipSignal, { dot: string; text: string }> = {
  MENTIONED: { dot: 'bg-state-available', text: 'text-ink' },
  EXCLUDED: { dot: 'bg-state-blocked', text: 'text-ink' },
  NOT_MENTIONED: { dot: 'bg-rule-strong', text: 'text-ink-muted' },
  INDETERMINATE: { dot: 'bg-rule', text: 'text-ink-faint' },
};

export function SponsorshipBadge({
  signal,
  evidence,
}: {
  signal: SponsorshipSignal;
  evidence: readonly SponsorshipEvidence[];
}) {
  const style = STYLES[signal];

  return (
    <div>
      <p className={`flex items-start gap-2 text-sm ${style.text}`}>
        <span
          aria-hidden="true"
          className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${style.dot}`}
        />
        <span>{sponsorshipLabel(signal)}</span>
      </p>

      {evidence.length > 0 ? (
        <figure className="border-rule-strong mt-2 ml-4 border-l-2 pl-3">
          {evidence.map((item) => (
            <blockquote
              key={item.phrase + item.context}
              className="text-ink-muted text-sm leading-relaxed"
            >
              {/*
                The advertisement's words, quoted rather than paraphrased. A
                paraphrase would be our statement about an employer, which is
                the thing this product must never make.
              */}
              {item.context}
            </blockquote>
          ))}
          <figcaption className="text-ink-faint mt-1 text-xs">
            Quoted from the advertisement
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}

/**
 * The key, shown once per page rather than repeated on every listing.
 *
 * "Not known" needs explaining more than the others do: a reader has to
 * understand it is a limit of what we hold, not something the employer said.
 */
export function SponsorshipKey() {
  const entries: { signal: SponsorshipSignal; meaning: string }[] = [
    {
      signal: 'MENTIONED',
      meaning: 'The advertisement says sponsorship is available.',
    },
    {
      signal: 'EXCLUDED',
      meaning: 'The advertisement says sponsorship is not available.',
    },
    {
      signal: 'NOT_MENTIONED',
      meaning:
        'The whole advertisement was read and says nothing either way. It does not mean the employer never sponsors.',
    },
    {
      signal: 'INDETERMINATE',
      meaning:
        'Only part of the advertisement is held, so its silence proves nothing. Open the original to read it in full.',
    },
  ];

  return (
    <dl className="mt-4 space-y-2">
      {entries.map((entry) => (
        <div key={entry.signal} className="flex items-start gap-2">
          <dt className="flex shrink-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full ${STYLES[entry.signal].dot}`}
            />
            <span className="text-ink text-sm font-medium">
              {sponsorshipLabel(entry.signal)}
            </span>
          </dt>
          <dd className="text-ink-faint text-sm">{entry.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
