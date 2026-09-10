import { describe, expect, it, beforeAll } from 'vitest';
import {
  buildRegionLookup,
  classifyByRegions,
  loadRegionArtefact,
  type RegionArtefact,
  type RegionLookup,
} from '@/ingestion/region-inheritance';
import { smartJobsRegions } from '@/integrations/smartjobs-qld/regions';

/**
 * The region rule, and the two ways it can go wrong.
 *
 * It can be too generous, settling a listing whose region holds postcodes on
 * both sides of the instrument, which would tell a reader a Brisbane job is
 * regional. It can be too shy, refusing a listing every one of whose regions
 * agrees, which would drop real regional work out of a regional search. Both
 * directions are tested, and the mixed cases are named individually because
 * they are the ones a future change is most likely to quietly "fix".
 *
 * These run against the real artefact rather than a fixture. That is
 * deliberate: the artefact is generated from two 50 MB ABS spreadsheets by a
 * build step nobody will run often, and a test that only exercised a hand-made
 * copy of it would pass for ever while the committed file rotted.
 */

let artefact: RegionArtefact;
let lookup: RegionLookup;

beforeAll(async () => {
  artefact = await loadRegionArtefact();
  // The registry mapping the real classifier gets from the database, built here
  // from the artefact itself. Names and codes agree inside one edition; the
  // classifier joins on the code for the cross-edition reason given in the
  // module, and that join is not what these tests are about.
  lookup = buildRegionLookup(
    artefact,
    artefact.areas.map((area) => ({ code: area.code, name: area.name })),
  );
});

describe('the artefact this rule rests on', () => {
  it('was built from the instrument the product uses', () => {
    expect(artefact.instrument.registerId).toBe('F2022L00231');
  });

  it('covers every statistical area', () => {
    // 108 in the ASGS Edition 4 registry. A short artefact means a build that
    // silently dropped areas, and every dropped area is a region that quietly
    // stops settling its listings.
    expect(artefact.areas.length).toBe(108);
  });

  it('reaches all four verdicts', () => {
    const seen = new Set(artefact.areas.map((area) => area.status));
    expect(seen.has('REGIONAL')).toBe(true);
    expect(seen.has('NOT_REGIONAL')).toBe(true);
    // If nothing came out mixed, the unanimity rule is not being applied and
    // some threshold has crept in.
    expect(seen.has('MIXED')).toBe(true);
  });

  it('maps every Queensland portal region to an area it knows', () => {
    /*
     * The join the whole rule depends on. Each portal region names an ABS
     * statistical area, and a name that no longer matches would silently turn
     * that region's listings unknown rather than failing.
     */
    const names = new Set(artefact.areas.map((area) => area.name.toLowerCase()));
    const unmatched = smartJobsRegions
      .filter((region) => region.sa4Name !== null)
      .filter((region) => !names.has(region.sa4Name!.toLowerCase()))
      .map((region) => `${region.portalName} -> ${String(region.sa4Name)}`);

    expect(unmatched, `unmatched: ${unmatched.join(', ')}`).toEqual([]);
  });
});

describe('a listing naming one region', () => {
  it('is regional where every postcode in that region is', () => {
    for (const region of ['Cairns region', 'Townsville region', 'Wide Bay']) {
      expect(classifyByRegions(lookup, region), region).toBe('REGIONAL');
    }
  });

  it('is regional for the coasts, which the instrument lists in full', () => {
    // Both are section 3(1) areas. Worth asserting because "the Gold Coast is
    // not regional" is a common assumption and the instrument disagrees.
    expect(classifyByRegions(lookup, 'Gold Coast')).toBe('REGIONAL');
    expect(classifyByRegions(lookup, 'Sunshine Coast')).toBe('REGIONAL');
  });

  it('is not regional for the parts of Brisbane the instrument leaves out', () => {
    expect(classifyByRegions(lookup, 'Brisbane Inner City')).toBe('NOT_REGIONAL');
    expect(classifyByRegions(lookup, 'Brisbane - North')).toBe('NOT_REGIONAL');
  });

  it('settles nothing where the region holds postcodes on both sides', () => {
    /*
     * The cases that must never be resolved by taking the larger side. Moreton
     * Bay - North is mixed on the strength of a single mesh block out of 3,339,
     * and Darling Downs - Maranoa on five out of 2,567. A threshold would sweep
     * both up, and sweeping them up is precisely how a statutory line gets
     * crossed on a reader's behalf.
     */
    for (const region of [
      'Brisbane - South',
      'Brisbane - East',
      'Brisbane - West',
      'Ipswich region',
      'Logan - Beaudesert',
      'Moreton Bay - North',
      'Moreton Bay - South',
      'Darling Downs - Maranoa',
    ]) {
      expect(classifyByRegions(lookup, region), region).toBe('UNKNOWN');
    }
  });
});

describe('a listing naming several regions', () => {
  it('is settled when every region it names agrees', () => {
    // A real shape from the corpus: one advertisement across several regional
    // centres. It has no single place and it is still unambiguously regional.
    expect(
      classifyByRegions(
        lookup,
        'Cairns region, Townsville region, Mackay region, Wide Bay, Rockhampton region',
      ),
    ).toBe('REGIONAL');
  });

  it('is unsettled when the regions disagree', () => {
    expect(classifyByRegions(lookup, 'Brisbane Inner City, Cairns region')).toBe(
      'UNKNOWN',
    );
  });

  it('is unsettled when any one of them is mixed', () => {
    // Unanimity, not majority. Nine regions agreeing does not overrule the
    // tenth that cannot answer.
    expect(
      classifyByRegions(lookup, 'Cairns region, Townsville region, Ipswich region'),
    ).toBe('UNKNOWN');
  });

  it('handles the statewide advertisement', () => {
    const everywhere = smartJobsRegions
      .filter((region) => region.sa4Name !== null)
      .map((region) => region.portalName)
      .join(', ');
    expect(classifyByRegions(lookup, everywhere)).toBe('UNKNOWN');
  });
});

describe('what the region rule declines to answer', () => {
  it('says nothing at all about text that is not this vocabulary', () => {
    /*
     * Null, not UNKNOWN, and the difference is what keeps the rule out of the
     * way. An Adzuna location is a suburb and an area, it is settled by its
     * coordinates, and this rule must leave it alone rather than declare it
     * unplaceable.
     */
    expect(classifyByRegions(lookup, 'Unanderra, Wollongong Area')).toBeNull();
    expect(classifyByRegions(lookup, 'Brisbane CBD, Brisbane')).toBeNull();
    expect(classifyByRegions(lookup, '')).toBeNull();
  });

  it('says nothing when the only entries name no place', () => {
    // Recognised vocabulary, but "Flexible" and "Various" are not locations.
    // They must not settle anything and must not be read as agreement either.
    expect(classifyByRegions(lookup, 'Flexible')).toBeNull();
    expect(classifyByRegions(lookup, 'Various')).toBeNull();
  });

  it('ignores a non-place sitting beside real regions', () => {
    expect(classifyByRegions(lookup, 'Flexible, Cairns region')).toBe('REGIONAL');
  });
});
