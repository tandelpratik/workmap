import {
  sponsorshipLabel,
  sponsorshipMeaning,
  sponsorshipSignals,
  type SponsorshipEvidence,
  type SponsorshipSignal,
} from '@/domain/sponsorship';

/**
 * What an advertisement said about sponsorship, with the sentence that said it.
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

/**
 * Meaning is carried by the words; the dot is an index, not the message.
 *
 * Each dot is outlined as well as filled. The two unknown states are the
 * quietest colours in the palette by design, and against the night edition's
 * ground an unoutlined one all but disappears, which leaves the label looking
 * as though its marker failed to load.
 *
 * The three affirmative strengths share one colour rather than being given a
 * ramp of their own. Encoding strength in colour would put the product's most
 * consequential distinction into the one channel the accessibility rules
 * forbid relying on, and the words already carry it.
 */
const STYLES: Record<SponsorshipSignal, { dot: string; text: string }> = {
  OFFERED: { dot: 'bg-state-available border-state-available', text: 'text-ink' },
  OPEN_TO: { dot: 'bg-state-available border-state-available', text: 'text-ink' },
  MAY_BE_CONSIDERED: {
    dot: 'bg-paper border-state-available',
    text: 'text-ink',
  },
  EXCLUDED: { dot: 'bg-state-blocked border-state-blocked', text: 'text-ink' },
  NOT_MENTIONED: { dot: 'bg-rule-strong border-rule-strong', text: 'text-ink-muted' },
  INDETERMINATE: { dot: 'bg-rule border-rule-strong', text: 'text-ink-faint' },
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
          className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full border ${style.dot}`}
        />
        <span>{sponsorshipLabel(signal)}</span>
      </p>

      {evidence.length > 0 ? (
        <figure className="border-rule-strong mt-2 ml-4 border-l-2 pl-3">
          {evidence.map((item) => (
            <blockquote
              key={item.phrase + item.sentence}
              className="text-ink-muted text-sm leading-relaxed"
            >
              {/*
                The advertisement's own sentence, quoted rather than
                paraphrased. A paraphrase would be our statement about an
                employer, which is the thing this product must never make.
              */}
              {item.sentence}
            </blockquote>
          ))}
          <figcaption className="text-ink-faint mt-1 text-xs">
            Sponsorship wording found in advertisement
          </figcaption>
        </figure>
      ) : null}
    </div>
  );
}

/**
 * The key, shown once per page rather than repeated on every listing.
 *
 * Built from the signal list rather than a second hand-written copy of it, so a
 * new signal cannot reach the interface without its explanation. The two
 * absences carry most of the weight: a reader has to understand that "not
 * mentioned" is about the document and "description incomplete" is about the
 * limits of what we hold, and that neither is a statement about the employer.
 */
export function SponsorshipKey() {
  return (
    <dl className="mt-4 space-y-2">
      {sponsorshipSignals.map((signal) => (
        <div key={signal} className="flex items-start gap-2">
          <dt className="flex shrink-0 items-center gap-2">
            <span
              aria-hidden="true"
              className={`inline-block h-2 w-2 rounded-full border ${STYLES[signal].dot}`}
            />
            <span className="text-ink text-sm font-medium">
              {sponsorshipLabel(signal)}
            </span>
          </dt>
          <dd className="text-ink-faint text-sm">{sponsorshipMeaning(signal)}</dd>
        </div>
      ))}
    </dl>
  );
}
