import { describe, expect, it } from 'vitest';
import { regionalAreas } from '@/config/regional-areas';
import {
  classifyPlace,
  isWhollyRegional,
  normalisePostcode,
  whollyRegionalJurisdictions,
  type PostcodeSet,
} from '@/domain/regional';

/**
 * The transcription is the risk, not the logic.
 *
 * `config/regional-areas.ts` is a hand-typed copy of two tables in a statute.
 * The classification code around it is a dozen lines and fails loudly when it is
 * wrong; a mistyped digit in the tables fails silently and forever, and it
 * mislabels real jobs in real towns. So the structural checks below are
 * exhaustive rather than representative, and the worked examples sit on both
 * sides of a boundary wherever the instrument draws one.
 *
 * The worked examples assert what the tables say, not what a suburb is called.
 * That distinction matters: "4305 is Ipswich" is a geographic claim this project
 * has no source for, while "4305 is listed in s3(1)" is a fact about a document
 * anyone can open.
 */

/** The thousand-block each jurisdiction's postcodes sit in. */
const blocks: Readonly<Record<string, number>> = {
  NSW: 2,
  ACT: 2,
  VIC: 3,
  QLD: 4,
  SA: 5,
  WA: 6,
  TAS: 7,
};

const tables = [
  { section: 's3(1)', entries: regionalAreas.cityOrMajorCentre },
  { section: 's3(2)', entries: regionalAreas.regionalCentreOrOther },
] as const;

function rangeSets(): { section: string; jurisdiction: string; set: PostcodeSet }[] {
  return tables.flatMap(({ section, entries }) =>
    Object.entries(entries)
      .filter(([, set]) => set.kind === 'RANGES')
      .map(([jurisdiction, set]) => ({ section, jurisdiction, set })),
  );
}

describe('the transcribed instrument', () => {
  it('cites the document it was transcribed from', () => {
    const { instrument } = regionalAreas;
    expect(instrument.registerId).toBe('F2022L00231');
    // A checksum of the document as downloaded, so a silent re-publication of
    // the same identifier is detectable rather than assumed away.
    expect(instrument.documentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(new URL(instrument.url).hostname).toBe('www.legislation.gov.au');
    expect(new URL(instrument.documentUrl).hostname).toBe('www.legislation.gov.au');
    for (const date of [
      instrument.commencedOn,
      instrument.retrievedOn,
      instrument.statusVerifiedOn,
    ]) {
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('states every range low to high', () => {
    for (const { section, jurisdiction, set } of rangeSets()) {
      if (set.kind !== 'RANGES') continue;
      for (const range of set.ranges) {
        expect(
          range.from <= range.to,
          `${section} ${jurisdiction}: ${String(range.from)} to ${String(range.to)} runs backwards`,
        ).toBe(true);
      }
    }
  });

  it('states ranges in ascending order and never overlapping', () => {
    // A transposed pair of digits usually shows up here first: it either sorts
    // out of order or collides with its neighbour. Adjacency is permitted,
    // because the instrument itself writes 3233 and 3234 as separate items.
    for (const { section, jurisdiction, set } of rangeSets()) {
      if (set.kind !== 'RANGES') continue;
      set.ranges.forEach((range, index) => {
        if (index === 0) return;
        const previous = set.ranges[index - 1];
        if (previous === undefined) return;
        expect(
          range.from > previous.to,
          `${section} ${jurisdiction}: ${String(range.from)} does not follow ${String(previous.to)}`,
        ).toBe(true);
      });
    }
  });

  it('keeps every postcode inside its own jurisdiction block', () => {
    // Catches the leading-digit typo, which is the one that would silently move
    // a whole range into another state.
    for (const { section, jurisdiction, set } of rangeSets()) {
      if (set.kind !== 'RANGES') continue;
      const block = blocks[jurisdiction];
      expect(block, `no postcode block recorded for ${jurisdiction}`).toBeDefined();
      for (const range of set.ranges) {
        expect(
          Math.floor(range.from / 1000),
          `${section} ${jurisdiction}: ${String(range.from)} is outside the ${String(block)}xxx block`,
        ).toBe(block);
        expect(
          Math.floor(range.to / 1000),
          `${section} ${jurisdiction}: ${String(range.to)} is outside the ${String(block)}xxx block`,
        ).toBe(block);
      }
    }
  });

  it('never lists one postcode in both categories', () => {
    // The two tables define different things, so a postcode in both would be a
    // transcription error rather than a feature of the instrument.
    for (const [jurisdiction, block] of Object.entries(blocks)) {
      for (let postcode = block * 1000; postcode < (block + 1) * 1000; postcode += 1) {
        const code = String(postcode).padStart(4, '0');
        const result = classifyPlace(regionalAreas, { postcode: code, jurisdiction });
        // classifyPlace returns the first table that matches, so the assertion
        // is made directly against the sets rather than through it.
        const inCity = matches(regionalAreas.cityOrMajorCentre[jurisdiction], postcode);
        const inOther = matchesRanges(
          regionalAreas.regionalCentreOrOther[jurisdiction],
          postcode,
        );
        expect(
          inCity && inOther,
          `${jurisdiction} ${code} appears in both tables (${result.reason})`,
        ).toBe(false);
      }
    }
  });
});

function matches(set: PostcodeSet | undefined, postcode: number): boolean {
  if (set === undefined) return false;
  if (set.kind === 'ALL') return true;
  if (set.kind === 'REMAINDER') return false;
  return set.ranges.some((range) => postcode >= range.from && postcode <= range.to);
}

/** Only the explicitly listed ranges, ignoring the remainder clause. */
function matchesRanges(set: PostcodeSet | undefined, postcode: number): boolean {
  return set?.kind === 'RANGES' ? matches(set, postcode) : false;
}

describe('which jurisdictions the instrument settles on its own', () => {
  it('covers every postcode outside New South Wales, Victoria and Queensland', () => {
    /*
     * The finding that shapes the whole classifier. Between the two tables the
     * instrument lists every postcode in these seven jurisdictions, so a
     * listing in any of them is in a designated regional area whether or not a
     * postcode was ever recorded for it.
     */
    expect(whollyRegionalJurisdictions(regionalAreas)).toEqual([
      'ACT',
      'NORFOLK_ISLAND',
      'NT',
      'OTHER_TERRITORIES',
      'SA',
      'TAS',
      'WA',
    ]);
  });

  it('leaves the three eastern states needing a postcode', () => {
    // Sydney, Melbourne and Brisbane are the only places the instrument leaves
    // out, and they are inside these three states.
    for (const jurisdiction of ['NSW', 'VIC', 'QLD']) {
      expect(isWhollyRegional(regionalAreas, jurisdiction)).toBe(false);
    }
  });
});

describe('classifying by postcode', () => {
  const cases = [
    // The three excluded capitals, which the instrument defines by omission.
    { jurisdiction: 'NSW', postcode: '2000', status: 'NOT_REGIONAL', category: null },
    { jurisdiction: 'VIC', postcode: '3000', status: 'NOT_REGIONAL', category: null },
    { jurisdiction: 'QLD', postcode: '4000', status: 'NOT_REGIONAL', category: null },

    // s3(1), cities and major regional centres.
    {
      jurisdiction: 'NSW',
      postcode: '2300',
      status: 'REGIONAL',
      category: 'CITY_OR_MAJOR_CENTRE',
    },
    {
      jurisdiction: 'NSW',
      postcode: '2500',
      status: 'REGIONAL',
      category: 'CITY_OR_MAJOR_CENTRE',
    },
    {
      jurisdiction: 'VIC',
      postcode: '3220',
      status: 'REGIONAL',
      category: 'CITY_OR_MAJOR_CENTRE',
    },
    {
      jurisdiction: 'QLD',
      postcode: '4217',
      status: 'REGIONAL',
      category: 'CITY_OR_MAJOR_CENTRE',
    },
    {
      jurisdiction: 'WA',
      postcode: '6000',
      status: 'REGIONAL',
      category: 'CITY_OR_MAJOR_CENTRE',
    },
    {
      jurisdiction: 'SA',
      postcode: '5000',
      status: 'REGIONAL',
      category: 'CITY_OR_MAJOR_CENTRE',
    },
    {
      jurisdiction: 'TAS',
      postcode: '7000',
      status: 'REGIONAL',
      category: 'CITY_OR_MAJOR_CENTRE',
    },
    {
      jurisdiction: 'ACT',
      postcode: '2600',
      status: 'REGIONAL',
      category: 'CITY_OR_MAJOR_CENTRE',
    },

    // s3(2), regional centres and other regional areas.
    {
      jurisdiction: 'NSW',
      postcode: '2650',
      status: 'REGIONAL',
      category: 'REGIONAL_CENTRE_OR_OTHER',
    },
    {
      jurisdiction: 'VIC',
      postcode: '3550',
      status: 'REGIONAL',
      category: 'REGIONAL_CENTRE_OR_OTHER',
    },
    {
      jurisdiction: 'QLD',
      postcode: '4870',
      status: 'REGIONAL',
      category: 'REGIONAL_CENTRE_OR_OTHER',
    },
    // Reached through the remainder clause rather than an explicit range.
    {
      jurisdiction: 'WA',
      postcode: '6430',
      status: 'REGIONAL',
      category: 'REGIONAL_CENTRE_OR_OTHER',
    },
    {
      jurisdiction: 'SA',
      postcode: '5600',
      status: 'REGIONAL',
      category: 'REGIONAL_CENTRE_OR_OTHER',
    },
    {
      jurisdiction: 'TAS',
      postcode: '7250',
      status: 'REGIONAL',
      category: 'REGIONAL_CENTRE_OR_OTHER',
    },
    {
      jurisdiction: 'NT',
      postcode: '0800',
      status: 'REGIONAL',
      category: 'REGIONAL_CENTRE_OR_OTHER',
    },
  ] as const;

  for (const testCase of cases) {
    it(`places ${testCase.jurisdiction} ${testCase.postcode}`, () => {
      const result = classifyPlace(regionalAreas, {
        postcode: testCase.postcode,
        jurisdiction: testCase.jurisdiction,
      });
      expect(result.status).toBe(testCase.status);
      expect(result.category).toBe(testCase.category);
      expect(result.basis).toBe('POSTCODE');
    });
  }

  it('reads the boundary between two adjacent Queensland ranges', () => {
    /*
     * 4303 to 4305 is in s3(1) and 4306 begins s3(2). Both are regional, and
     * they are different categories, so an off-by-one in the transcription
     * changes what a reader is told without changing whether the job appears.
     * This is the case the dormant "outside Greater Brisbane" flag in the
     * Queensland adapter gets wrong, and the reason it must never be promoted.
     */
    const inside = classifyPlace(regionalAreas, {
      postcode: '4305',
      jurisdiction: 'QLD',
    });
    const beyond = classifyPlace(regionalAreas, {
      postcode: '4306',
      jurisdiction: 'QLD',
    });
    expect(inside.category).toBe('CITY_OR_MAJOR_CENTRE');
    expect(beyond.category).toBe('REGIONAL_CENTRE_OR_OTHER');
  });

  it('reads the boundary either side of a Sydney gap', () => {
    // 2526 ends a listed range, 2527 is listed separately in the other table,
    // and 2528 resumes the first. Three consecutive postcodes, two categories.
    expect(
      classifyPlace(regionalAreas, { postcode: '2526', jurisdiction: 'NSW' }).category,
    ).toBe('CITY_OR_MAJOR_CENTRE');
    expect(
      classifyPlace(regionalAreas, { postcode: '2527', jurisdiction: 'NSW' }).category,
    ).toBe('REGIONAL_CENTRE_OR_OTHER');
    expect(
      classifyPlace(regionalAreas, { postcode: '2528', jurisdiction: 'NSW' }).category,
    ).toBe('CITY_OR_MAJOR_CENTRE');
  });

  it('needs the jurisdiction, because the 2xxx block is shared', () => {
    /*
     * The reason the jurisdiction is not optional. The same postcode falls in
     * an Australian Capital Territory line of s3(1) and a New South Wales range
     * of s3(2). Both are regional, so the mistake would never show up as a
     * wrong answer, only as the wrong statutory category quoted beside it.
     */
    const asTerritory = classifyPlace(regionalAreas, {
      postcode: '2611',
      jurisdiction: 'ACT',
    });
    const asState = classifyPlace(regionalAreas, {
      postcode: '2611',
      jurisdiction: 'NSW',
    });
    expect(asTerritory.category).toBe('CITY_OR_MAJOR_CENTRE');
    expect(asState.category).toBe('REGIONAL_CENTRE_OR_OTHER');
  });

  it('quotes the instrument in every reason it gives', () => {
    for (const jurisdiction of ['NSW', 'VIC', 'QLD', 'WA', 'ACT']) {
      const result = classifyPlace(regionalAreas, { postcode: '4000', jurisdiction });
      expect(result.reason).toContain(regionalAreas.instrument.id);
    }
  });
});

describe('classifying without a postcode', () => {
  it('settles a wholly covered state from the state alone', () => {
    const result = classifyPlace(regionalAreas, { postcode: null, jurisdiction: 'WA' });
    expect(result.status).toBe('REGIONAL');
    expect(result.basis).toBe('STATE');
    // Western Australia is split between the two categories, so naming one
    // would be a guess. The status is certain; the category is not available.
    expect(result.category).toBeNull();
  });

  it('names the category where one line covers the whole jurisdiction', () => {
    expect(
      classifyPlace(regionalAreas, { postcode: null, jurisdiction: 'ACT' }).category,
    ).toBe('CITY_OR_MAJOR_CENTRE');
    expect(
      classifyPlace(regionalAreas, { postcode: null, jurisdiction: 'NT' }).category,
    ).toBe('REGIONAL_CENTRE_OR_OTHER');
  });

  it('refuses to settle the three eastern states', () => {
    for (const jurisdiction of ['NSW', 'VIC', 'QLD']) {
      const result = classifyPlace(regionalAreas, { postcode: null, jurisdiction });
      expect(result.status).toBe('UNKNOWN');
      expect(result.basis).toBe('NONE');
    }
  });

  it('is case and whitespace insensitive about the jurisdiction', () => {
    expect(
      classifyPlace(regionalAreas, { postcode: null, jurisdiction: ' nt ' }).status,
    ).toBe('REGIONAL');
  });
});

describe('what the classifier refuses to answer', () => {
  it('reports unknown, never not-regional, when the place is unplaced', () => {
    /*
     * The distinction the product depends on. "Not in a designated regional
     * area" is a statement about the job; "we could not place this job" is a
     * statement about our data, and collapsing the second into the first would
     * quietly drop real regional listings out of a regional search.
     */
    const noJurisdiction = classifyPlace(regionalAreas, {
      postcode: '2650',
      jurisdiction: null,
    });
    expect(noJurisdiction.status).toBe('UNKNOWN');

    const unknownJurisdiction = classifyPlace(regionalAreas, {
      postcode: '2650',
      jurisdiction: 'ZZZ',
    });
    expect(unknownJurisdiction.status).toBe('UNKNOWN');

    const malformed = classifyPlace(regionalAreas, {
      postcode: '26',
      jurisdiction: 'NSW',
    });
    expect(malformed.status).toBe('UNKNOWN');
  });

  it('accepts only four-digit postcodes', () => {
    expect(normalisePostcode('2000')).toBe('2000');
    expect(normalisePostcode('  0800  ')).toBe('0800');
    // Not padded. See the note in domain/regional.ts: a lenient parser turns a
    // malformed value into a confident wrong answer.
    expect(normalisePostcode('800')).toBeNull();
    expect(normalisePostcode('20000')).toBeNull();
    expect(normalisePostcode('2a00')).toBeNull();
    expect(normalisePostcode('')).toBeNull();
  });
});
