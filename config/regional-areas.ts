import type { PostcodeSet, RegionalReference } from '@/domain/regional';

/**
 * The designated regional area postcode tables, transcribed from the
 * instrument that defines them.
 *
 * Source: Migration (Designated regional areas for certain skilled and
 * temporary graduate visas) Instrument (LIN 22/022) 2022, F2022L00231, made
 * 17 February 2022 and commenced 5 March 2022. Downloaded from the Federal
 * Register of Legislation on 10 September 2026 and checked the same day
 * against the register's version list, which shows one version, in force, with
 * no amendments and none pending.
 *
 * This file is a transcription and nothing more. It adds no postcode, merges no
 * range and resolves no ambiguity, because the instrument contains none: every
 * entry below is a line of a table in section 3, in the order the instrument
 * writes it. The helper exists so that the transcription reads against the
 * statute at a glance, which is the only way anyone will ever check it.
 *
 * A note on what this is used for, because the instrument's title invites the
 * wrong assumption. The product uses these tables as a geographic definition:
 * they are the published answer to "which parts of Australia are regional", and
 * they are the answer people mean when they say it. The product does not use
 * them to say anything about a visa, a subclass, an application or a person.
 * The instrument governs the provisions it names; this file borrows only its
 * map.
 *
 * The one place the transcription can go wrong is a mistyped digit, so the
 * tests assert the shape exhaustively: every range ascending, every range
 * within its state's postcode block, and the boundary postcode either side of
 * every range classified the way the instrument classifies it.
 */

/**
 * A run of postcodes, written the way the instrument writes them.
 *
 * A bare number is a single postcode, a pair is "from ... to ..." inclusive.
 * The instrument mixes both in one cell, so the transcription does too.
 */
function ranges(...items: readonly (number | readonly [number, number])[]): PostcodeSet {
  return {
    kind: 'RANGES',
    ranges: items.map((item) =>
      typeof item === 'number'
        ? { from: item, to: item }
        : { from: item[0], to: item[1] },
    ),
  };
}

/** "All postcodes in the Northern Territory". */
const all: PostcodeSet = { kind: 'ALL' };

/** "All postcodes in Western Australia not mentioned in subsection (1)". */
const remainder: PostcodeSet = { kind: 'REMAINDER' };

export const regionalAreas: RegionalReference = {
  instrument: {
    id: 'LIN 22/022',
    registerId: 'F2022L00231',
    title:
      'Migration (Designated regional areas for certain skilled and temporary ' +
      'graduate visas) Instrument (LIN 22/022) 2022',
    commencedOn: '2022-03-05',
    url: 'https://www.legislation.gov.au/F2022L00231/latest/text',
    documentUrl:
      'https://www.legislation.gov.au/F2022L00231/asmade/2022-03-02/text/original/word',
    documentSha256: '655bb493eba7919b1dbb1b42d5b626b405bee72d2087240162426dd75130ce7e',
    retrievedOn: '2026-09-10',
    statusVerifiedOn: '2026-09-10',
  },

  /*
   * Section 3(1). "For subregulation 1.15M(1) of the Regulations, a part of
   * Australia within a postcode mentioned in the following table is a specified
   * designated city or major regional centre."
   */
  cityOrMajorCentre: {
    NSW: ranges(2259, [2264, 2308], [2500, 2526], [2528, 2535], 2574),
    VIC: ranges([3211, 3232], 3235, 3240, 3328, [3330, 3333], 3340, 3342),
    QLD: ranges(
      [4019, 4022],
      4025,
      4037,
      4074,
      [4076, 4078],
      [4207, 4275],
      4300,
      4301,
      [4303, 4305],
      [4500, 4506],
      [4508, 4512],
      [4514, 4519],
      4521,
      4550,
      4551,
      [4553, 4562],
      [4564, 4569],
      [4571, 4575],
    ),
    WA: ranges(
      [6000, 6038],
      [6050, 6083],
      [6090, 6182],
      [6208, 6211],
      6214,
      [6556, 6558],
    ),
    SA: ranges([5000, 5171], 5173, 5174, [5231, 5235], [5240, 5252], 5351, [5950, 5960]),
    TAS: ranges(7000, [7004, 7026], [7030, 7109], [7140, 7151], [7170, 7177]),
    // "All postcodes in the Australian Capital Territory". The whole territory
    // is a category two area, which is why Canberra is regional for this
    // purpose and Sydney is not.
    ACT: all,
  },

  /*
   * Section 3(2). "For subregulation 1.15M(2) of the Regulations, a part of
   * Australia within a postcode mentioned in the following table is a specified
   * regional centre or other regional area."
   */
  regionalCentreOrOther: {
    NSW: ranges(
      [2250, 2258],
      [2260, 2263],
      [2311, 2490],
      2527,
      [2536, 2551],
      [2575, 2739],
      2753,
      2754,
      [2756, 2758],
      [2773, 2898],
    ),
    VIC: ranges(
      [3097, 3099],
      3139,
      3233,
      3234,
      [3236, 3239],
      [3241, 3325],
      3329,
      3334,
      3341,
      [3345, 3424],
      [3430, 3799],
      [3809, 3909],
      [3912, 3971],
      [3978, 3996],
    ),
    QLD: ranges(
      4124,
      4125,
      4133,
      4183,
      4184,
      [4280, 4287],
      [4306, 4498],
      4507,
      4552,
      4563,
      4570,
      [4580, 4895],
    ),
    // Items 4 to 6 are each "all postcodes in [the state] not mentioned in
    // subsection (1)". With the capitals taken by the table above, that leaves
    // every postcode in these three states inside one category or the other.
    WA: remainder,
    SA: remainder,
    TAS: remainder,
    NT: all,
    /*
     * Items 8 and 9: Norfolk Island, and "all postcodes in a Territory other
     * than the Australian Capital Territory, the Northern Territory and
     * Norfolk Island".
     *
     * Carried because the instrument carries them. No source this product uses
     * publishes advertisements in either, so nothing resolves here, and the
     * keys are deliberately not state abbreviations because they are not
     * states.
     */
    NORFOLK_ISLAND: all,
    OTHER_TERRITORIES: all,
  },
};
