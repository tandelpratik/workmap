import {
  classificationBases,
  regionalBasisExplanation,
  regionalBasisLabel,
  regionalCategoryLabel,
  regionalLabel,
  type RegionalPlacement,
  type RegionalStatus,
} from '@/domain/regional';

/**
 * Where an advertisement sits against the designated regional area
 * instrument, with what settled it.
 *
 * The label alone would be our assertion about someone's job advertisement. The
 * label plus the postcode and the basis is a lookup a reader can repeat against
 * a three-page instrument that anyone can open, which is a different kind of
 * claim and the only kind this product makes.
 *
 * Nothing here concerns a reader. There is no eligibility, no visa subclass, no
 * "you would qualify". It says where a job is and which side of a published
 * postcode table that puts it on. The instrument is a migration instrument
 * because that is who publishes the definition of regional, not because
 * anything here is advice.
 *
 * The basis is shown rather than smoothed away because the three are not
 * equally strong. A listing placed by its postcode was looked up directly. One
 * placed by its region rests on every postcode in that region agreeing, which
 * is exact but is a statement about an area rather than about the job's own
 * address. Flattening them would tell a reader that two different things are
 * the same.
 */

/**
 * Meaning is carried by the words; the dot is an index, not the message.
 *
 * Outlined as well as filled, for the reason the sponsorship markers are: the
 * quiet states all but disappear against the night edition's ground otherwise,
 * and a marker that fails to appear reads as a broken page rather than a
 * deliberate absence.
 */
const STYLES: Record<RegionalStatus, { dot: string; text: string }> = {
  REGIONAL: { dot: 'bg-state-available border-state-available', text: 'text-ink' },
  NOT_REGIONAL: { dot: 'bg-rule-strong border-rule-strong', text: 'text-ink-muted' },
  UNKNOWN: { dot: 'bg-rule border-rule-strong', text: 'text-ink-faint' },
};

/** How the answer was reached, in a phrase, or null where nothing reached it. */
function provenance(place: RegionalPlacement): string | null {
  const basis = regionalBasisLabel(place.basis);
  if (basis === null) return null;

  if (place.basis === 'POSTCODE' && place.postcode !== null) {
    // The postcode is the whole of the evidence, so it is printed rather than
    // described. A reader with the instrument open can check it in seconds.
    // Short, and still a distinction rather than a smoothing. The precedent is
    // the Jobsworth label on an estimated salary: the reader is told which kind
    // of figure they are looking at, in as few words as that takes.
    const derived = place.postcodeIsDerived ? ', from coordinates' : '';
    return `by postcode ${place.postcode}${derived}`;
  }

  return `by ${basis}`;
}

export function RegionalNote({ place }: { place: RegionalPlacement }) {
  const style = STYLES[place.status];
  const how = provenance(place);
  const category = place.category === null ? null : regionalCategoryLabel(place.category);

  return (
    <p className={`flex items-start gap-2 text-sm ${style.text}`}>
      <span
        aria-hidden="true"
        className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full border ${style.dot}`}
      />
      <span>
        {regionalLabel(place.status)}
        {category === null ? null : <span className="text-ink-faint">: {category}</span>}
        {how === null ? null : <span className="text-ink-faint"> ({how})</span>}
      </span>
    </p>
  );
}

/**
 * What the placements mean, shown once per page rather than on every listing.
 *
 * "Location not established" needs the most explaining, because it is the one a
 * reader is most likely to read as a defect in the advertisement rather than a
 * limit of what we hold. It is neither: it is usually a role genuinely
 * advertised across many places at once.
 */
export function RegionalKey() {
  const entries: { status: RegionalStatus; meaning: string }[] = [
    {
      status: 'REGIONAL',
      meaning:
        'The place this advertisement names sits inside the postcodes the ' +
        'instrument lists. It says nothing about any visa or any person.',
    },
    {
      status: 'NOT_REGIONAL',
      meaning:
        'The place sits outside them. In practice that means Sydney, ' +
        'Melbourne or Brisbane, which are what the instrument leaves out.',
    },
    {
      status: 'UNKNOWN',
      meaning:
        'The advertisement could not be placed. Most often it names several ' +
        'regions at once, or a region holding postcodes on both sides of the ' +
        'line, so no single answer is available. It is not a fault in the ' +
        'advertisement.',
    },
  ];

  return (
    <>
      <dl className="mt-4 space-y-2">
        {entries.map((entry) => (
          <div key={entry.status} className="flex items-start gap-2">
            <dt className="flex shrink-0 items-center gap-2">
              <span
                aria-hidden="true"
                className={`inline-block h-2 w-2 rounded-full border ${STYLES[entry.status].dot}`}
              />
              <span className="text-ink text-sm font-medium">
                {regionalLabel(entry.status)}
              </span>
            </dt>
            <dd className="text-ink-faint text-sm">{entry.meaning}</dd>
          </div>
        ))}
      </dl>

      {/*
        What "by postcode", "by region" and "by state" mean on a listing.

        Each card carries two words, because a reader scanning results is not
        reading a methodology and a paragraph on every row is noise rather than
        calm. The explanation still has to exist, so it exists once, here, where
        somebody who wants it will look.
      */}
      <dl className="mt-5 space-y-2">
        {classificationBases.map((basis) => {
          const label = regionalBasisLabel(basis);
          const explanation = regionalBasisExplanation(basis);
          if (label === null || explanation === null) return null;
          return (
            <div key={basis} className="flex items-start gap-2">
              <dt className="text-ink w-20 shrink-0 text-sm font-medium">by {label}</dt>
              <dd className="text-ink-faint text-sm">{explanation}</dd>
            </div>
          );
        })}
      </dl>

      {/*
        Where a postcode came from, explained once. "From coordinates" on a
        listing means the source published a point rather than a postcode, and
        the point was located inside an official postal area. Postal areas
        approximate Australia Post postcodes rather than reproducing them, which
        is the ABS's own caveat and belongs beside any label that rests on one.
      */}
      <p className="text-ink-faint max-w-measure mt-5 text-sm leading-relaxed">
        A postcode marked <span className="text-ink">from coordinates</span> was not
        published by the source. It was found by locating the coordinates the source did
        publish inside an Australian Bureau of Statistics postal area, which approximates
        an Australia Post postcode rather than reproducing it.
      </p>
    </>
  );
}
