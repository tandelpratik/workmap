import { describe, expect, it } from 'vitest';
import {
  australianStateAbbreviations,
  findAreaBySlug,
  isStateAbbreviation,
  stateAbbreviation,
  toAreaSlug,
} from '@/domain/geography';

/**
 * How an area becomes an address, and how a search term becomes a place.
 *
 * The second half of this file exists because of a bug the pages found. A
 * location search matched the term as a substring of the raw location text, and
 * "NT" is a substring of Central, Mount, Sunshine and a good fraction of
 * Australian place names, so the Northern Territory page listed Central West
 * Qld. Two letters are not a place name and must not be searched as one.
 */

const STATES = [
  { name: 'New South Wales' },
  { name: 'Victoria' },
  { name: 'Queensland' },
  { name: 'South Australia' },
  { name: 'Western Australia' },
  { name: 'Tasmania' },
  { name: 'Northern Territory' },
  { name: 'Australian Capital Territory' },
  { name: 'Other Territories' },
];

describe('slugs', () => {
  it('turns a published name into a URL segment', () => {
    expect(toAreaSlug('New South Wales')).toBe('new-south-wales');
    expect(toAreaSlug('Queensland')).toBe('queensland');
    expect(toAreaSlug('Australian Capital Territory')).toBe(
      'australian-capital-territory',
    );
  });

  it('handles the punctuation ASGS names actually contain', () => {
    expect(toAreaSlug('Sydney - Inner West')).toBe('sydney-inner-west');
    expect(toAreaSlug("Wagga Wagga's Region")).toBe('wagga-wagga-s-region');
    expect(toAreaSlug('  Darwin  ')).toBe('darwin');
  });

  it('folds accents to their base letters rather than dropping them', () => {
    expect(toAreaSlug('Yarra Ranges Café')).toBe('yarra-ranges-cafe');
  });

  it('is idempotent, so a slug of a slug is the same slug', () => {
    for (const state of STATES) {
      const once = toAreaSlug(state.name);
      expect(toAreaSlug(once)).toBe(once);
    }
  });

  it('gives every state and territory a distinct address', () => {
    const slugs = STATES.map((state) => toAreaSlug(state.name));
    expect(new Set(slugs).size).toBe(STATES.length);
  });
});

describe('finding an area by its address', () => {
  it('resolves each state from its own slug', () => {
    for (const state of STATES) {
      expect(findAreaBySlug(STATES, toAreaSlug(state.name))?.name).toBe(state.name);
    }
  });

  it('tolerates a differently-cased or spaced address', () => {
    expect(findAreaBySlug(STATES, 'New-South-Wales')?.name).toBe('New South Wales');
    expect(findAreaBySlug(STATES, 'new south wales')?.name).toBe('New South Wales');
  });

  it('returns null for an address that names nothing', () => {
    expect(findAreaBySlug(STATES, 'nowhere')).toBeNull();
    expect(findAreaBySlug(STATES, '')).toBeNull();
  });
});

describe('state abbreviations', () => {
  it('abbreviates each state and territory', () => {
    expect(stateAbbreviation('Queensland')).toBe('QLD');
    expect(stateAbbreviation('New South Wales')).toBe('NSW');
    expect(stateAbbreviation('Australian Capital Territory')).toBe('ACT');
  });

  it('is insensitive to case and punctuation', () => {
    expect(stateAbbreviation('  QUEENSLAND ')).toBe('QLD');
    expect(stateAbbreviation('new-south-wales')).toBe('NSW');
  });

  it('abbreviates nothing it was not given', () => {
    // Other Territories has no conventional abbreviation, and inventing one
    // would put a label on a page no reader would recognise.
    expect(stateAbbreviation('Other Territories')).toBeNull();
    expect(stateAbbreviation('Outside Australia')).toBeNull();
    expect(stateAbbreviation('Brisbane')).toBeNull();
  });

  it('covers exactly the eight states and territories', () => {
    expect(australianStateAbbreviations).toHaveLength(8);
    expect([...australianStateAbbreviations].sort()).toEqual([
      'ACT',
      'NSW',
      'NT',
      'QLD',
      'SA',
      'TAS',
      'VIC',
      'WA',
    ]);
  });
});

describe('recognising an abbreviation in a search term', () => {
  it('recognises every abbreviation, however written', () => {
    for (const code of australianStateAbbreviations) {
      expect(isStateAbbreviation(code), code).toBe(true);
      expect(isStateAbbreviation(code.toLowerCase()), code).toBe(true);
      expect(isStateAbbreviation(` ${code} `), code).toBe(true);
    }
  });

  /*
   * The regression. Each of these place names contains a state abbreviation as
   * a substring, and each was returned by a search for that abbreviation before
   * the two questions were separated. They are place names and must be searched
   * as text.
   */
  it('does not mistake a place name that contains one for the state itself', () => {
    for (const place of [
      'Central West Qld',
      'Mount Isa',
      'Sunshine Coast',
      'Townsville',
      'Wagga Wagga',
      'Newcastle',
    ]) {
      expect(isStateAbbreviation(place), place).toBe(false);
    }
  });

  it('does not treat a full state name as an abbreviation', () => {
    // "Queensland" is a place name and matching it as text is correct: it finds
    // the listings whose location says Queensland as well as the state code.
    expect(isStateAbbreviation('Queensland')).toBe(false);
  });
});
