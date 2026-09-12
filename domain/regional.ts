/**
 * Whether a place is in a designated regional area.
 *
 * The authority is a single legislative instrument: the Migration (Designated
 * regional areas for certain skilled and temporary graduate visas) Instrument
 * (LIN 22/022) 2022. It is three pages long, it is expressed entirely in
 * postcodes, and it is the whole definition. Nothing here is a judgement about
 * what counts as regional; every answer is a lookup against a table a reader
 * can open and check.
 *
 * The instrument works in two tables:
 *
 *   s3(1)  postcodes that are a "specified designated city or major regional
 *          centre": Newcastle, Wollongong, Geelong, Perth, Adelaide, Hobart,
 *          Canberra, the Gold and Sunshine Coasts.
 *   s3(2)  postcodes that are a "specified regional centre or other regional
 *          area": everywhere else that is listed.
 *
 * A postcode in either table is within a designated regional area. A postcode
 * in neither is not, and in practice that is Sydney, Melbourne and Brisbane.
 * The instrument never names those three. They are what is left.
 *
 * Two consequences shape everything below.
 *
 * The first is that the answer is per postcode, not per region, suburb or
 * statistical area. An SA4 is not a postcode and cannot stand in for one: the
 * Brisbane SA4s hold postcodes on both sides of the line, which is exactly the
 * case a plausible-looking approximation gets wrong.
 *
 * The second is that for most of the country the state alone settles it.
 * Western Australia, South Australia and Tasmania are covered by s3(1) for
 * their capital and by "all postcodes not mentioned in subsection (1)" for the
 * rest, so between the two tables every postcode in them is listed. The
 * Australian Capital Territory, the Northern Territory, Norfolk Island and the
 * other territories are each covered in full by a single line. Only New South
 * Wales, Victoria and Queensland hold postcodes in neither table. That is
 * derived from the reference below rather than written down as a list of
 * states, so an amended instrument changes the behaviour instead of
 * contradicting it.
 *
 * What this module does not do: it says nothing about visas, eligibility,
 * subclasses or anyone's prospects. It reports which side of a published
 * postcode table a place falls on. The instrument is a migration instrument
 * because that is who publishes the definition, not because anything here is
 * advice.
 */

/** A contiguous inclusive run of postcodes, as the instrument writes them. */
export interface PostcodeRange {
  readonly from: number;
  readonly to: number;
}

/**
 * How one jurisdiction's entry in one of the tables is expressed.
 *
 * Three forms, because the instrument uses three. Flattening ALL and REMAINDER
 * into an enumerated list of every postcode in the state would mean inventing
 * the list of postcodes that exist, which is a different dataset from a
 * different publisher and not one this instrument supplies.
 */
export type PostcodeSet =
  | { readonly kind: 'RANGES'; readonly ranges: readonly PostcodeRange[] }
  /** "All postcodes in the Northern Territory". */
  | { readonly kind: 'ALL' }
  /** "All postcodes in Western Australia not mentioned in subsection (1)". */
  | { readonly kind: 'REMAINDER' };

/** The two categories the instrument defines, in its own words. */
export const regionalCategories = [
  /** s3(1): a specified designated city or major regional centre. */
  'CITY_OR_MAJOR_CENTRE',
  /** s3(2): a specified regional centre or other regional area. */
  'REGIONAL_CENTRE_OR_OTHER',
] as const;
export type RegionalCategory = (typeof regionalCategories)[number];

export const regionalStatuses = [
  /** Listed in one of the two tables. */
  'REGIONAL',
  /** In neither table, which the instrument leaves outside the definition. */
  'NOT_REGIONAL',
  /**
   * Not enough is known about the place to ask the question.
   *
   * A distinct answer, never folded into NOT_REGIONAL. "This advertisement is
   * not in a designated regional area" and "we could not tell where this
   * advertisement is" are different facts, and only the first is about the job.
   */
  'UNKNOWN',
] as const;
export type RegionalStatus = (typeof regionalStatuses)[number];

/**
 * What the answer was read from.
 *
 * Published beside the answer rather than kept internal. A listing placed by
 * its postcode was looked up in the instrument; a listing placed by its state
 * was settled by the fact that the instrument leaves no postcode in that state
 * unlisted. Both are exact, but a reader is entitled to know which they are
 * looking at, and the second cannot name a category.
 */
export const classificationBases = [
  /** Looked up in the instrument by postcode. The instrument's own unit. */
  'POSTCODE',
  /**
   * Every postcode inside the region the listing named agrees.
   *
   * For sources that publish a region rather than a place. Weaker than a
   * postcode, because it rests on unanimity among the postcodes in an area
   * rather than on the one postcode the job is actually in, and stronger than a
   * state, because a region is a smaller thing. `classifyPlace` never returns
   * it: knowing which regions exist is a matter for the ingestion layer that
   * reads a particular provider's vocabulary, and the answer it reaches is
   * still a classification in these terms.
   */
  'REGION',
  /** The instrument leaves no postcode in that state or territory unlisted. */
  'STATE',
  /** Nothing settled it. */
  'NONE',
] as const;
export type ClassificationBasis = (typeof classificationBases)[number];

/** Where the transcription came from, so an answer traces to a document. */
export interface InstrumentProvenance {
  /** Short name, for example "LIN 22/022". */
  readonly id: string;
  /** Federal Register of Legislation identifier, for example "F2022L00231". */
  readonly registerId: string;
  readonly title: string;
  /** ISO date the instrument commenced. */
  readonly commencedOn: string;
  /** The register page for the current version. */
  readonly url: string;
  /** The document the tables below were transcribed from. */
  readonly documentUrl: string;
  /** SHA-256 of that document as downloaded, so a re-publication is visible. */
  readonly documentSha256: string;
  /** ISO date the document was downloaded. */
  readonly retrievedOn: string;
  /** ISO date the register was last checked to confirm it is still in force. */
  readonly statusVerifiedOn: string;
}

/**
 * The instrument, transcribed.
 *
 * Keyed by jurisdiction. The keys for the states and mainland territories are
 * the abbreviations used everywhere else in this product; Norfolk Island and
 * the other territories have no counterpart there and are carried because the
 * instrument carries them, not because anything resolves to them.
 */
export interface RegionalReference {
  readonly instrument: InstrumentProvenance;
  /** s3(1), the cities and major regional centres. */
  readonly cityOrMajorCentre: Readonly<Record<string, PostcodeSet>>;
  /** s3(2), the regional centres and other regional areas. */
  readonly regionalCentreOrOther: Readonly<Record<string, PostcodeSet>>;
}

export interface RegionalClassification {
  readonly status: RegionalStatus;
  /**
   * Which of the instrument's two categories applies. Null whenever the status
   * is not REGIONAL, and also when the state settled the question without a
   * postcode, because both categories occur inside those states.
   */
  readonly category: RegionalCategory | null;
  readonly basis: ClassificationBasis;
  /** Why, in a sentence a reader can check against the instrument. */
  readonly reason: string;
}

/**
 * Where an advertisement sits, as the product shows it to a reader.
 *
 * Carries the answer, what settled it, and the postcode it rests on, because
 * all three are shown together. A regional label with nothing behind it is our
 * assertion about someone's job advertisement; a label that names the postcode
 * and the instrument is a lookup the reader can repeat.
 */
export interface RegionalPlacement {
  readonly status: RegionalStatus;
  readonly category: RegionalCategory | null;
  readonly basis: ClassificationBasis;
  /** The postcode the answer rests on, where it rests on one. */
  readonly postcode: string | null;
  /**
   * Whether that postcode was derived from the source's coordinates rather
   * than published by the source.
   *
   * Shown, not hidden. A derived postcode inherits the limits of the boundary
   * set that placed it, and a reader comparing our answer against an address
   * deserves to know which kind they are looking at.
   */
  readonly postcodeIsDerived: boolean;
}

/** A listing with no location row at all. Unplaced, and honest about it. */
export const unplaced: RegionalPlacement = {
  status: 'UNKNOWN',
  category: null,
  basis: 'NONE',
  postcode: null,
  postcodeIsDerived: false,
};

/**
 * How a placement is worded to a reader.
 *
 * Every label describes a place, never a person and never a visa. "In a
 * designated regional area" is a statement about where the job is; "you would
 * qualify for a regional visa" would be advice about the reader, which this
 * product does not give and is not permitted to give.
 */
export function regionalLabel(status: RegionalStatus): string {
  switch (status) {
    case 'REGIONAL':
      return 'In a designated regional area';
    case 'NOT_REGIONAL':
      return 'Not in a designated regional area';
    case 'UNKNOWN':
      return 'Location not established';
  }
}

/**
 * The short name each placement goes by in an address or a control.
 *
 * One vocabulary, read by the search page, the search form and the public API.
 * It began as three copies: a map in the page, a list of options in the form and
 * nothing at all in the API, which is how the product's defining filter came to
 * be missing from its own interface. A filter offered in one place and absent
 * from another is not a smaller feature, it is two components disagreeing about
 * what the product does.
 *
 * `all` maps to no filter rather than to a fourth status, because "everywhere"
 * is the absence of the question rather than an answer to it.
 */
export const areaFilters = {
  regional: 'REGIONAL',
  elsewhere: 'NOT_REGIONAL',
  unplaced: 'UNKNOWN',
  all: null,
} as const satisfies Record<string, RegionalStatus | null>;

export type AreaFilter = keyof typeof areaFilters;

/**
 * What a request with no area asked for.
 *
 * Regional, because that is what the product is. A reader arriving at a regional
 * job search should get regional work, and the surfaces that apply this default
 * say in words that they have, because a filter removing most of the corpus has
 * to announce itself rather than be inferred from a control.
 */
export const defaultAreaFilter: AreaFilter = 'regional';

export function isAreaFilter(value: string | undefined): value is AreaFilter {
  return value !== undefined && Object.hasOwn(areaFilters, value);
}

/** How each choice is offered to a reader. */
export function areaFilterLabel(filter: AreaFilter): string {
  switch (filter) {
    case 'regional':
      return 'In a designated regional area';
    case 'elsewhere':
      return 'Not in one';
    case 'unplaced':
      return 'Location not established';
    case 'all':
      return 'Everywhere';
  }
}

/** The instrument's own words for its two categories. */
export function regionalCategoryLabel(category: RegionalCategory): string {
  switch (category) {
    case 'CITY_OR_MAJOR_CENTRE':
      return 'designated city or major regional centre';
    case 'REGIONAL_CENTRE_OR_OTHER':
      return 'regional centre or other regional area';
  }
}

/**
 * What settled it, in a phrase that completes "decided by ...".
 *
 * Published beside the answer rather than kept for operators. The three bases
 * are not equally strong and pretending otherwise would flatten a real
 * difference: a postcode is the instrument's own unit, a region is unanimity
 * among the postcodes inside it, and a state is the instrument leaving nothing
 * in that state unlisted.
 */
export function regionalBasisLabel(basis: ClassificationBasis): string | null {
  switch (basis) {
    case 'POSTCODE':
      return 'postcode';
    case 'REGION':
      return 'region';
    case 'STATE':
      return 'state';
    case 'NONE':
      return null;
  }
}

/**
 * What each basis actually rests on, for the key rather than the card.
 *
 * The card gets two words because a hundred rows of explanation is not calm,
 * it is noise, and a reader scanning results is not reading a methodology. The
 * explanation still has to exist somewhere, so it exists once, where somebody
 * who wants it will look.
 */
export function regionalBasisExplanation(basis: ClassificationBasis): string | null {
  switch (basis) {
    case 'POSTCODE':
      return 'The postcode was looked up directly in the instrument.';
    case 'REGION':
      return 'The advertisement named a region rather than a place, and every postcode inside that region falls the same side of the instrument.';
    case 'STATE':
      return 'The instrument lists every postcode in that state or territory, so no postcode was needed.';
    case 'NONE':
      return null;
  }
}

/**
 * A postcode as the instrument writes them: exactly four digits.
 *
 * Deliberately strict. Three digits are not silently padded, even though the
 * Northern Territory's 08xx postcodes are often written that way, because the
 * only postcodes this product feeds in come from an official postcode reference
 * that writes four, and a lenient parser turns a malformed value into a
 * confident wrong answer rather than an absent one.
 */
export function normalisePostcode(raw: string): string | null {
  const trimmed = raw.trim();
  return /^\d{4}$/.test(trimmed) ? trimmed : null;
}

function withinRanges(set: PostcodeSet, postcode: number): boolean {
  return (
    set.kind === 'RANGES' &&
    set.ranges.some((range) => postcode >= range.from && postcode <= range.to)
  );
}

/**
 * Whether a jurisdiction's entry covers a postcode.
 *
 * REMAINDER is the only form that cannot be read on its own: "all postcodes not
 * mentioned in subsection (1)" is defined by reference to the other table, so
 * the other table has to be passed in. Reading it as "all postcodes" would put
 * the whole of Perth in the wrong category, and reading it as "none" would put
 * the whole of regional Western Australia outside the definition.
 */
function covers(
  set: PostcodeSet | undefined,
  postcode: number,
  cityEntry: PostcodeSet | undefined,
): boolean {
  if (set === undefined) return false;
  if (set.kind === 'ALL') return true;
  if (set.kind === 'RANGES') return withinRanges(set, postcode);
  return !(cityEntry !== undefined && covers(cityEntry, postcode, undefined));
}

/**
 * Whether the instrument leaves no postcode in this jurisdiction unlisted.
 *
 * Derived rather than declared. A jurisdiction is wholly inside the definition
 * when either table covers it in full, or when the second table takes the
 * remainder of the first. Anything else has a gap, and a place in it cannot be
 * settled without a postcode.
 */
export function isWhollyRegional(
  reference: RegionalReference,
  jurisdiction: string,
): boolean {
  const city = reference.cityOrMajorCentre[jurisdiction];
  const other = reference.regionalCentreOrOther[jurisdiction];
  if (city?.kind === 'ALL' || other?.kind === 'ALL') return true;
  return other?.kind === 'REMAINDER';
}

/** Every jurisdiction the instrument covers in full, for reporting and tests. */
export function whollyRegionalJurisdictions(
  reference: RegionalReference,
): readonly string[] {
  const keys = new Set([
    ...Object.keys(reference.cityOrMajorCentre),
    ...Object.keys(reference.regionalCentreOrOther),
  ]);
  return [...keys].filter((key) => isWhollyRegional(reference, key)).sort();
}

function unknown(reason: string): RegionalClassification {
  return { status: 'UNKNOWN', category: null, basis: 'NONE', reason };
}

/**
 * Classifies a place.
 *
 * The jurisdiction is required, and a postcode without one yields UNKNOWN
 * rather than a guess. Postcode ranges are stated per jurisdiction and two of
 * them overlap: the Australian Capital Territory sits inside the 2xxx block
 * New South Wales also uses, so 2611 read without a state matches a New South
 * Wales range in s3(2) while actually being Canberra, which s3(1) covers. Both
 * answers are "regional", so the error would never surface as a wrong status,
 * only as a wrong category printed beside a quotation from a statute. That is
 * the kind of mistake that survives for years.
 *
 * Absence from both tables is reported as NOT_REGIONAL, which is the
 * instrument's own logic: it defines what is included and leaves the rest out.
 * That reading assumes the postcode is a real one in the stated jurisdiction,
 * which is the caller's responsibility, and is why the only postcodes fed in
 * here come from an official postcode reference rather than from free text.
 */
export function classifyPlace(
  reference: RegionalReference,
  place: { readonly postcode: string | null; readonly jurisdiction: string | null },
): RegionalClassification {
  const cite = reference.instrument.id;

  if (place.jurisdiction === null) {
    return unknown(
      'No state or territory is recorded for this place, and the postcode ' +
        `tables in ${cite} are stated per state and territory.`,
    );
  }

  const jurisdiction = place.jurisdiction.trim().toUpperCase();
  const city = reference.cityOrMajorCentre[jurisdiction];
  const other = reference.regionalCentreOrOther[jurisdiction];

  if (city === undefined && other === undefined) {
    return unknown(`${cite} lists no postcodes for "${jurisdiction}".`);
  }

  if (place.postcode !== null) {
    const normalised = normalisePostcode(place.postcode);
    if (normalised === null) {
      return unknown(
        `"${place.postcode}" is not a four-digit postcode, so it cannot be ` +
          `looked up in ${cite}.`,
      );
    }
    const postcode = Number(normalised);

    if (covers(city, postcode, undefined)) {
      return {
        status: 'REGIONAL',
        category: 'CITY_OR_MAJOR_CENTRE',
        basis: 'POSTCODE',
        reason:
          `Postcode ${normalised} is listed in ${cite} s3(1) as a designated ` +
          'city or major regional centre.',
      };
    }

    if (covers(other, postcode, city)) {
      return {
        status: 'REGIONAL',
        category: 'REGIONAL_CENTRE_OR_OTHER',
        basis: 'POSTCODE',
        reason:
          `Postcode ${normalised} is listed in ${cite} s3(2) as a regional ` +
          'centre or other regional area.',
      };
    }

    return {
      status: 'NOT_REGIONAL',
      category: null,
      basis: 'POSTCODE',
      reason:
        `Postcode ${normalised} appears in neither table of ${cite}, so it is ` +
        'not within a designated regional area.',
    };
  }

  if (isWhollyRegional(reference, jurisdiction)) {
    /*
     * A category only where one line covers the whole jurisdiction. Western
     * Australia, South Australia and Tasmania are whole because the two tables
     * divide them between the two categories, so naming one here would be a
     * coin toss dressed as a citation.
     */
    const category: RegionalCategory | null =
      city?.kind === 'ALL'
        ? 'CITY_OR_MAJOR_CENTRE'
        : other?.kind === 'ALL'
          ? 'REGIONAL_CENTRE_OR_OTHER'
          : null;

    return {
      status: 'REGIONAL',
      category,
      basis: 'STATE',
      reason:
        `${cite} leaves no postcode in ${jurisdiction} outside a designated ` +
        'regional area, so no postcode is needed to place this one.',
    };
  }

  return unknown(
    `${jurisdiction} holds postcodes on both sides of ${cite}, so this place ` +
      'cannot be settled without one.',
  );
}
